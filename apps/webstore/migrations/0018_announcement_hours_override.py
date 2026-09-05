from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_templates(apps, schema_editor):
    Announcement = apps.get_model('webstore', 'Announcement')
    if not Announcement.objects.filter(is_template=True).exists():
        Announcement.objects.create(
            title='Sale weekend',
            slug='template-sale-weekend',
            kind='promotion',
            style='sale',
            body_html='<p>Storewide sale through {{sale_end}}. See in-store for details.</p>',
            body_text='Storewide sale through {{sale_end}}. See in-store for details.',
            body_json={},
            cta_label='Shop the sale',
            cta_url='/shop',
            placements=['banner', 'home_hero'],
            priority=10,
            dismissible=True,
            is_active=False,
            is_template=True,
        )
        Announcement.objects.create(
            title='Holiday hours notice',
            slug='template-holiday-hours-notice',
            kind='holiday',
            style='holiday',
            body_html='<p>{{holiday_hours}}. Regular hours: {{regular_hours}}.</p>',
            body_text='{{holiday_hours}}. Regular hours: {{regular_hours}}.',
            body_json={},
            cta_label='Visit us',
            cta_url='/visit',
            placements=['banner', 'visit'],
            priority=20,
            dismissible=True,
            is_active=False,
            is_template=True,
        )


def unseed_templates(apps, schema_editor):
    Announcement = apps.get_model('webstore', 'Announcement')
    Announcement.objects.filter(
        slug__in=['template-sale-weekend', 'template-holiday-hours-notice'],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0002_enhancement_request'),
        ('webstore', '0017_canfield_hours_closed_sun_mon'),
    ]

    operations = [
        migrations.CreateModel(
            name='StoreHoursOverride',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(max_length=120)),
                ('date_start', models.DateField()),
                ('date_end', models.DateField()),
                ('closed', models.BooleanField(default=False)),
                ('open', models.CharField(blank=True, default='09:00', max_length=5)),
                ('close', models.CharField(blank=True, default='18:00', max_length=5)),
                ('note', models.CharField(blank=True, default='', max_length=240)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='hours_overrides_created', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['date_start', 'id'],
            },
        ),
        migrations.AddIndex(
            model_name='storehoursoverride',
            index=models.Index(fields=['is_active', 'date_start', 'date_end'], name='webstore_st_is_acti_8c1a1a_idx'),
        ),
        migrations.CreateModel(
            name='Announcement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('slug', models.SlugField(blank=True, max_length=220, unique=True)),
                ('kind', models.CharField(choices=[
                    ('promotion', 'Promotion'),
                    ('notice', 'Notice'),
                    ('holiday', 'Holiday'),
                    ('event', 'Event'),
                ], default='promotion', max_length=20)),
                ('style', models.CharField(choices=[
                    ('sale', 'Sale'),
                    ('info', 'Info'),
                    ('warning', 'Warning'),
                    ('holiday', 'Holiday'),
                    ('seasonal', 'Seasonal'),
                ], default='info', max_length=20)),
                ('body_json', models.JSONField(blank=True, default=dict)),
                ('body_html', models.TextField(blank=True, default='')),
                ('body_text', models.TextField(blank=True, default='')),
                ('cta_label', models.CharField(blank=True, default='', max_length=80)),
                ('cta_url', models.CharField(blank=True, default='', max_length=400)),
                ('placements', models.JSONField(blank=True, default=list)),
                ('priority', models.IntegerField(default=0)),
                ('dismissible', models.BooleanField(default=True)),
                ('is_active', models.BooleanField(default=False)),
                ('is_template', models.BooleanField(default=False)),
                ('starts_at', models.DateTimeField(blank=True, null=True)),
                ('ends_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='announcements_created', to=settings.AUTH_USER_MODEL,
                )),
                ('linked_hours_override', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='announcements', to='webstore.storehoursoverride',
                )),
                ('updated_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='announcements_updated', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-priority', '-updated_at'],
            },
        ),
        migrations.AddIndex(
            model_name='announcement',
            index=models.Index(fields=['is_active', 'is_template', 'starts_at', 'ends_at'], name='webstore_an_is_acti_4b2c2c_idx'),
        ),
        migrations.CreateModel(
            name='AnnouncementImage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('alt', models.CharField(blank=True, default='', max_length=200)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('announcement', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='images', to='webstore.announcement',
                )),
                ('s3_file', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='announcement_images', to='core.s3file',
                )),
            ],
            options={
                'ordering': ['sort_order', 'id'],
            },
        ),
        migrations.RunPython(seed_templates, unseed_templates),
    ]
