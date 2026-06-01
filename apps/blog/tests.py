"""Tests for the blog: Super Admin gating, live() visibility, slug lock, sanitization."""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.blog.models import BlogPost, BlogSeries
from apps.blog.sanitize import clean_blog_html

User = get_user_model()


def _make_admin(email='admin@e.com'):
    user = User.objects.create_user(email, 'Ada', 'Min', password='pw')
    group, _ = Group.objects.get_or_create(name='Admin')
    user.groups.add(group)
    return user


def _make_superuser(email='owner@e.com'):
    return User.objects.create_superuser(email, 'Bill', 'Rollins', password='pw')


class BlogPermissionTests(APITestCase):
    def setUp(self):
        self.superuser = _make_superuser()
        self.admin = _make_admin()

    def test_admin_non_superuser_forbidden(self):
        """An Admin-group user without is_superuser cannot reach staff blog APIs."""
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get('/api/blog/posts/').status_code, 403)
        self.assertEqual(self.client.get('/api/blog/series/').status_code, 403)

    def test_superuser_allowed(self):
        self.client.force_authenticate(self.superuser)
        self.assertEqual(self.client.get('/api/blog/posts/').status_code, 200)

    def test_unauthenticated_blocked(self):
        self.assertIn(self.client.get('/api/blog/posts/').status_code, (401, 403))


class BlogLiveVisibilityTests(APITestCase):
    def setUp(self):
        now = timezone.now()
        self.published = BlogPost.objects.create(title='Published', slug='published', status='published')
        self.draft = BlogPost.objects.create(title='Draft', slug='draft', status='draft')
        self.future = BlogPost.objects.create(
            title='Future', slug='future', status='scheduled', scheduled_for=now + timedelta(days=2),
        )
        self.past = BlogPost.objects.create(
            title='Past', slug='past', status='scheduled', scheduled_for=now - timedelta(minutes=5),
        )
        self.archived = BlogPost.objects.create(title='Archived', slug='archived', status='archived')

    def test_live_queryset(self):
        live = set(BlogPost.objects.live().values_list('slug', flat=True))
        self.assertEqual(live, {'published', 'past'})

    def test_public_list_only_live(self):
        slugs = {p['slug'] for p in self.client.get('/api/blog/public/posts/').json()}
        self.assertEqual(slugs, {'published', 'past'})

    def test_public_detail_404_for_draft(self):
        self.assertEqual(self.client.get('/api/blog/public/posts/draft/').status_code, 404)
        self.assertEqual(self.client.get('/api/blog/public/posts/future/').status_code, 404)

    def test_public_detail_ok_for_published(self):
        resp = self.client.get('/api/blog/public/posts/published/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['slug'], 'published')


class BlogSlugLockTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(_make_superuser())

    def _create(self, title):
        return self.client.post(
            '/api/blog/posts/', {'title': title, 'body_html': '<p>Body</p>'}, format='json',
        )

    def test_slug_editable_before_publish(self):
        resp = self._create('Hello There')
        pid = resp.json()['id']
        patched = self.client.patch(
            f'/api/blog/posts/{pid}/', {'slug': 'custom-slug'}, format='json',
        )
        self.assertEqual(patched.json()['slug'], 'custom-slug')

    def test_cleared_draft_slug_regenerates_from_title(self):
        resp = self._create('Untitled post')
        pid = resp.json()['id']
        self.assertEqual(resp.json()['slug'], 'untitled-post')
        patched = self.client.patch(
            f'/api/blog/posts/{pid}/',
            {'title': 'A Better Title', 'slug': ''},
            format='json',
        )
        self.assertEqual(patched.json()['slug'], 'a-better-title')

    def test_slug_locked_after_publish(self):
        resp = self._create('Hello World')
        pid = resp.json()['id']
        original_slug = resp.json()['slug']
        self.assertEqual(original_slug, 'hello-world')
        self.client.post(f'/api/blog/posts/{pid}/publish-now/')
        patched = self.client.patch(
            f'/api/blog/posts/{pid}/', {'slug': 'changed'}, format='json',
        )
        self.assertEqual(patched.json()['slug'], original_slug)


class BlogSanitizeTests(TestCase):
    def test_strips_script(self):
        out = clean_blog_html('<p>safe</p><script>alert(1)</script>')
        self.assertNotIn('<script', out.lower())
        self.assertIn('<p>safe</p>', out)

    def test_drops_event_handlers(self):
        out = clean_blog_html('<p onclick="evil()">hi</p>')
        self.assertNotIn('onclick', out.lower())

    def test_keeps_allowed_tags(self):
        out = clean_blog_html(
            '<h2>Title</h2><blockquote>q</blockquote>'
            '<ul><li>one</li></ul><a href="https://x.com">link</a>'
        )
        for needle in ('<h2>', '<blockquote>', '<ul>', '<li>', 'href="https://x.com"'):
            self.assertIn(needle, out)

    def test_blocks_javascript_url(self):
        out = clean_blog_html('<a href="javascript:alert(1)">x</a>')
        self.assertNotIn('javascript:', out.lower())

    def test_keeps_bt_classes(self):
        out = clean_blog_html(
            '<p class="bt-dropcap"><span class="bt-size-large bt-color-clay">Hi</span></p>'
            '<blockquote class="bt-pullquote">Q</blockquote>'
            '<pre class="bt-codeblock">x = 1</pre>'
        )
        self.assertIn('bt-dropcap', out)
        self.assertIn('bt-size-large', out)
        self.assertIn('bt-color-clay', out)
        self.assertIn('bt-pullquote', out)
        self.assertIn('bt-codeblock', out)

    def test_strips_unknown_classes(self):
        out = clean_blog_html('<p class="bt-dropcap evil-class">x</p>')
        self.assertIn('bt-dropcap', out)
        self.assertNotIn('evil-class', out)

    def test_keeps_columns_markup(self):
        out = clean_blog_html(
            '<section class="bt-columns bt-columns-2">'
            '<div class="bt-column"><p>a</p></div>'
            '<div class="bt-column"><p>b</p></div>'
            '</section>'
        )
        self.assertIn('bt-columns-2', out)
        self.assertIn('bt-column', out)

    def test_keeps_callout_markup(self):
        out = clean_blog_html(
            '<div class="bt-callout bt-callout-tip"><p>Heads up</p></div>'
        )
        self.assertIn('bt-callout', out)
        self.assertIn('bt-callout-tip', out)
        self.assertIn('<p>Heads up</p>', out)

    def test_keeps_table_markup(self):
        out = clean_blog_html(
            '<table><thead><tr><th colspan="2">Header</th></tr></thead>'
            '<tbody><tr><td>a</td><td>b</td></tr></tbody></table>'
        )
        self.assertIn('<table>', out)
        self.assertIn('<th colspan="2">', out)
        self.assertIn('<td>a</td>', out)

    def test_table_drops_style_and_nonnumeric_colspan(self):
        out = clean_blog_html(
            '<table><tbody><tr>'
            '<td style="width: 200px" colspan="2">x</td>'
            '<td colspan="evil">y</td>'
            '</tr></tbody></table>'
        )
        self.assertNotIn('style=', out)
        self.assertIn('colspan="2"', out)
        self.assertNotIn('colspan="evil"', out)

    def test_strips_iframe(self):
        out = clean_blog_html(
            '<p>before</p><iframe src="https://evil.example/embed"></iframe><p>after</p>'
        )
        self.assertNotIn('<iframe', out.lower())
        self.assertIn('<p>before</p>', out)
        self.assertIn('<p>after</p>', out)

    def test_keeps_link_card_no_iframe(self):
        out = clean_blog_html(
            '<a class="bt-linkcard" href="https://youtu.be/abc" target="_blank" rel="noopener nofollow">'
            '<span class="bt-linkcard-media">'
            '<img src="https://img.youtube.com/vi/abc/hqdefault.jpg" alt=""></span>'
            '<span class="bt-linkcard-body">'
            '<span class="bt-linkcard-title">Watch</span>'
            '<span class="bt-linkcard-host">youtu.be</span></span></a>'
        )
        self.assertIn('bt-linkcard', out)
        self.assertIn('href="https://youtu.be/abc"', out)
        self.assertIn('bt-linkcard-title', out)
        self.assertIn('<img', out)
        self.assertNotIn('<iframe', out.lower())


class BlogBodyDerivationTests(TestCase):
    def test_body_text_and_counts(self):
        post = BlogPost(title='Counting', slug='counting')
        post.apply_body(body_html='<p>one two three four five</p>')
        post.save()
        self.assertEqual(post.body_text, 'one two three four five')
        self.assertEqual(post.word_count, 5)
        self.assertGreaterEqual(post.reading_minutes, 1)
