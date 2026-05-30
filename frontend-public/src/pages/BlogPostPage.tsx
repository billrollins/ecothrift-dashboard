import { Link, useParams } from 'react-router-dom'
import { AUTHOR, POSTS, SITE_URL } from '../data/content'
import AuthorAvatar from '../components/AuthorAvatar'
import { useJsonLd, useSeo } from '../useSeo'
import NotFoundPage from './NotFoundPage'

export default function BlogPostPage() {
  const { slug } = useParams()
  const post = POSTS.find((p) => p.slug === slug)

  useSeo({
    title: post ? post.title : 'Page not found',
    description: post?.excerpt,
    path: `/blog/${slug ?? ''}`,
    type: 'article',
    image: post?.img,
    noindex: !post,
  })

  useJsonLd(
    post
      ? {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          datePublished: post.dateIso,
          author: { '@type': 'Person', name: AUTHOR.name, image: `${SITE_URL}${AUTHOR.photo}` },
          image: post.img.startsWith('http') ? post.img : `https://ecothrift.us${post.img}`,
        }
      : null,
  )

  if (!post) return <NotFoundPage />

  return (
    <div className="section">
      <div className="wrap article">
        <div className="crumb">
          <Link to="/">Home</Link> / <Link to="/blog">Blog</Link> / <span>{post.title}</span>
        </div>
        <div className="meta">{post.series}</div>
        <h1 className="atitle">{post.title}</h1>
        <p className="articledate">{post.date}</p>
        <div className="authorline">
          <AuthorAvatar size="lg" />
          <div>
            <b>{AUTHOR.name}</b>
            <span>{AUTHOR.role}</span>
          </div>
        </div>
        <div className="articlehero">
          <img src={post.img} alt={post.title} />
        </div>
        <div className="abody">
          {post.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        <Link className="btn btn--ghost" to="/blog">
          Back to the blog
        </Link>
      </div>
    </div>
  )
}
