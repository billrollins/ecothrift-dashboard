import { useEffect, useState } from 'react'
import { fetchBlogPosts, type BlogPostSummary } from '../api'
import PostCard from '../components/PostCard'
import { useSeo } from '../useSeo'

export default function BlogPage() {
  useSeo({
    title: 'Blog',
    description:
      'A transparent look at Eco-Thrift’s vision, challenges, transitions, and the decisions behind the store.',
    path: '/blog',
  })

  const [posts, setPosts] = useState<BlogPostSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchBlogPosts()
      .then((data) => {
        if (active) setPosts(data)
      })
      .catch(() => {
        if (active) setPosts([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <div className="blog-hero">
        <div className="wrap">
          <span className="eyebrow">Founder Notes</span>
          <h1 className="h2" style={{ fontSize: 38 }}>
            The Eco-Thrift Journal
          </h1>
          <p className="lead">
            A transparent look at our vision, challenges, transitions, and the decisions behind the
            store.
          </p>
        </div>
      </div>
      <div className="section">
        <div className="wrap">
          {loading ? (
            <div className="bgrid">
              {Array.from({ length: 3 }).map((_, i) => (
                <div className="post" key={i}>
                  <div className="postthumb ph g3" />
                  <div className="pb">
                    <span className="skline short" />
                    <span className="skline" />
                  </div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <p className="lead">No posts yet — check back soon.</p>
          ) : (
            <div className="bgrid">
              {posts.map((p) => (
                <PostCard key={p.slug} post={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
