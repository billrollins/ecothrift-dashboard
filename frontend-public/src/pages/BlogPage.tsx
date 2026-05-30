import { POSTS } from '../data/content'
import PostCard from '../components/PostCard'
import { useSeo } from '../useSeo'

export default function BlogPage() {
  useSeo({
    title: 'Blog',
    description:
      'Stories from Eco-Thrift’s founders on building a circular economy in Omaha — where we started, how we’re growing, and where we’re headed.',
    path: '/blog',
  })
  return (
    <>
      <div className="blog-hero">
        <div className="wrap">
          <span className="eyebrow">From the founder</span>
          <h1 className="h2" style={{ fontSize: 38 }}>
            The Eco-Thrift journal
          </h1>
          <p className="lead">
            Notes from Bill Rollins on pricing, sustainability, and building a thrift store the
            honest way.
          </p>
        </div>
      </div>
      <div className="section">
        <div className="wrap">
          <div className="bgrid">
            {POSTS.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
