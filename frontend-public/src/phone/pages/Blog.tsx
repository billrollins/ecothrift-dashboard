/**
 * /blog on the phone site: the green band, then one card per live post (GET /api/blog/public/posts/, src/api.ts).
 * A post shows a picture only when it has its own hero. While the list loads: quiet blocks in the cards' shape.
 * A failed fetch reads the same as an empty list (as the current page does).
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchBlogPosts, type BlogPostSummary } from '../../api'
import { useSeo } from '../../useSeo'
import { BackRow } from './legal/parts'
import './legal/legal.css'
import './legal/blog.css'

export function PostCard({ post, eager = false }: { post: BlogPostSummary; eager?: boolean }) {
  return (
    <Link className="bl-card" to={`/blog/${post.slug}`}>
      {post.hero ? (
        <img
          className="bl-pic"
          src={post.hero.url}
          alt={post.hero.alt || ''}
          width={358}
          height={201}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
        />
      ) : null}
      <span className="bl-txt">
        <span className="bl-meta">
          {post.series ? <b>{post.series}</b> : null}
          {post.series && post.date ? ' · ' : ''}
          {post.date}
        </span>
        <h2>{post.title}</h2>
        {post.excerpt ? <span className="bl-ex">{post.excerpt}</span> : null}
      </span>
    </Link>
  )
}

export default function Blog() {
  useSeo({
    title: 'Blog',
    description: 'A transparent look at Eco-Thrift’s vision, challenges, transitions, and the decisions behind the store.',
    path: '/blog',
  })
  const [posts, setPosts] = useState<BlogPostSummary[] | null>(null)

  useEffect(() => {
    let active = true
    fetchBlogPosts()
      .then((data) => {
        if (active) setPosts(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (active) setPosts([])
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="lg">
      <BackRow />
      <header className="lg-hd">
        <p className="lbl">Founder Notes</p>
        <h1 className="disp">The Eco-Thrift Journal</h1>
        <p className="lg-sub">A transparent look at our vision, challenges, transitions, and the decisions behind the store.</p>
      </header>
      {posts === null ? (
        <div className="bl-list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div className="bl-sk" key={i}>
              <i />
              <i />
              <i />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="bl-none">No posts yet - check back soon.</p>
      ) : (
        <div className="bl-list">
          {posts.map((p, i) => (
            <PostCard key={p.slug} post={p} eager={i === 0} />
          ))}
        </div>
      )}
    </div>
  )
}
