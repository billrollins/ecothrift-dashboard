/**
 * /blog on a computer (Dash Update #211): the journal's live posts (GET /api/blog/public/posts/, src/api.ts) as a grid
 * of equal cards, three across. A post shows a picture only when it has its own hero; one that fails to load is left
 * out of its card, never a broken image. While the list loads: quiet blocks in the cards' shape.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchBlogPosts, type BlogPostSummary } from '../../api'
import { useSeo } from '../../useSeo'
import './blog.css'

function Card({ post }: { post: BlogPostSummary }) {
  const [heroOk, setHeroOk] = useState(true)
  return (
    <Link className="dk-bl" to={`/blog/${post.slug}`}>
      <div className="pic">
        {post.hero && heroOk ? (
          <img src={post.hero.url} alt={post.hero.alt || ''} width={420} height={236} loading="lazy" decoding="async" onError={() => setHeroOk(false)} />
        ) : null}
      </div>
      <div className="bd">
        <span className="meta">
          {post.series ? <b>{post.series}</b> : null}
          {post.series && post.date ? ' · ' : ''}
          {post.date}
        </span>
        <h2>{post.title}</h2>
        {post.excerpt ? <p>{post.excerpt}</p> : null}
      </div>
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
      .then((data) => active && setPosts(Array.isArray(data) ? data : []))
      .catch(() => active && setPosts([]))
    return () => {
      active = false
    }
  }, [])
  return (
    <div className="dk-w">
      <div className="dk-pt">
        <p className="dk-kick">Founder Notes</p>
        <h1 className="disp">The Eco-Thrift Journal</h1>
        <p>A transparent look at our vision, challenges, transitions, and the decisions behind the store.</p>
      </div>
      {posts === null ? (
        <div className="dk-bl-grid" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div className="dk-bl" key={i}>
              <div className="pic" />
              <div className="bd" style={{ minHeight: 140 }} />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="dk-note" style={{ marginTop: 32, fontSize: 18 }}>No posts yet - check back soon.</p>
      ) : (
        <div className="dk-bl-grid">
          {posts.map((p) => (
            <Card key={p.slug} post={p} />
          ))}
        </div>
      )}
    </div>
  )
}
