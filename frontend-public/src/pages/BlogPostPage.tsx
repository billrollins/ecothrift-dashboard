import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchBlogPost, type BlogPostDetail } from '../api'
import { absolutePublicAssetUrl, AUTHOR, SITE_URL } from '../data/content'
import AuthorAvatar from '../components/AuthorAvatar'
import { useJsonLd, useSeo } from '../useSeo'
import NotFoundPage from './NotFoundPage'

export default function BlogPostPage() {
  const { slug = '' } = useParams()
  const [post, setPost] = useState<BlogPostDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setNotFound(false)
    fetchBlogPost(slug)
      .then((data) => {
        if (active) setPost(data)
      })
      .catch(() => {
        if (active) setNotFound(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [slug])

  const heroAbsolute = post?.hero
    ? post.hero.url.startsWith('http')
      ? post.hero.url
      : `${SITE_URL}${post.hero.url}`
    : undefined

  useSeo({
    title: notFound ? 'Page not found' : post?.meta_title || post?.title,
    description: post?.meta_description || post?.excerpt,
    path: `/blog/${slug}`,
    type: 'article',
    image: heroAbsolute,
    noindex: notFound,
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

  if (notFound) return <NotFoundPage />

  if (loading || !post) {
    return (
      <div className="section">
        <div className="wrap article">
          <span className="skline short" />
          <span className="skline" />
          <span className="articlehero ph g3" style={{ display: 'block', marginTop: 24 }} />
        </div>
      </div>
    )
  }

  return (
    <div className="section">
      <div className="wrap article">
        <div className="crumb">
          <Link to="/">Home</Link> / <Link to="/blog">Blog</Link> / <span>{post.title}</span>
        </div>
        {post.series ? <div className="meta">{post.series}</div> : null}
        <h1 className="atitle">{post.title}</h1>
        <p className="articledate">{post.date}</p>
        <div className="authorline">
          <AuthorAvatar size="lg" />
          <div>
            <b>{post.author_name}</b>
            <span>{post.author_role}</span>
          </div>
        </div>
        {post.hero ? (
          <div className="articlehero">
            <img src={post.hero.url} alt={post.hero.alt || post.title} />
          </div>
        ) : null}
        <div className="abody" dangerouslySetInnerHTML={{ __html: post.body_html }} />
        <Link className="btn btn--ghost" to="/blog">
          Back to the blog
        </Link>
      </div>
    </div>
  )
}
