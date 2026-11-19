/**
 * /blog/<slug> on the phone site: GET /api/blog/public/posts/<slug>/ (src/api.ts). The band carries the series, the
 * title, the date and the author; the body is the server's HTML on white, readable at 16 px. A missing post (any
 * failed fetch, as the current page does) shows the phone site's not-found page.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchBlogPost, type BlogPostDetail } from '../../api'
import { absolutePublicAssetUrl, AUTHOR, SITE_URL } from '../../data/content'
import { useJsonLd, useSeo } from '../../useSeo'
import NotFound from './NotFound'
import { BackRow } from './legal/parts'
import './legal/legal.css'
import './legal/blog.css'

type State = { slug: string; post: BlogPostDetail | null; missing: boolean }

export default function BlogPost() {
  const { slug = '' } = useParams()
  const [state, setState] = useState<State>({ slug: '', post: null, missing: false })

  useEffect(() => {
    let active = true
    fetchBlogPost(slug)
      .then((post) => {
        if (active) setState({ slug, post, missing: false })
      })
      .catch(() => {
        if (active) setState({ slug, post: null, missing: true })
      })
    return () => {
      active = false
    }
  }, [slug])

  const ready = state.slug === slug
  const post = ready ? state.post : null
  const missing = ready && state.missing

  const heroAbsolute = post?.hero
    ? post.hero.url.startsWith('http')
      ? post.hero.url
      : `${SITE_URL}${post.hero.url}`
    : undefined

  useSeo({
    title: missing ? 'Page not found' : post?.meta_title || post?.title,
    description: post?.meta_description || post?.excerpt,
    path: `/blog/${slug}`,
    type: 'article',
    image: heroAbsolute,
    noindex: missing,
  })
  useJsonLd(
    post
      ? {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          datePublished: post.date_iso,
          author: { '@type': 'Person', name: post.author_name, image: absolutePublicAssetUrl(AUTHOR.photo) },
          image: heroAbsolute,
        }
      : null,
  )

  if (missing) return <NotFound />

  if (!post) {
    return (
      <div className="lg" aria-busy="true">
        <BackRow fallback="/blog" label="Blog" />
        <header className="lg-hd">
          <p className="lbl">&nbsp;</p>
          <h1 className="disp lg-long">&nbsp;</h1>
          <p className="lg-date">&nbsp;</p>
        </header>
        <div className="bp-sk">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <i key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <article className="lg">
      <BackRow fallback="/blog" label="Blog" />
      <header className="lg-hd">
        <p className="lbl">{post.series || 'Founder Notes'}</p>
        <h1 className={`disp${post.title.length > 28 ? ' lg-long' : ''}`}>{post.title}</h1>
        <p className="bp-by">
          {post.author_name}
          {post.author_role ? <span>{post.author_role}</span> : null}
          {post.date ? <span>· {post.date}</span> : null}
        </p>
      </header>
      {post.hero ? (
        <img className="bp-hero" src={post.hero.url} alt={post.hero.alt || post.title} width={390} height={219} />
      ) : null}
      <div className="lg-body bp-body" dangerouslySetInnerHTML={{ __html: post.body_html }} />
      <div className="bp-end">
        <Link className="btn btn-line" to="/blog">
          Back to the blog
        </Link>
      </div>
    </article>
  )
}
