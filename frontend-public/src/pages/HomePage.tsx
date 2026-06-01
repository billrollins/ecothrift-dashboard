import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchBlogPosts, type BlogPostSummary } from '../api'
import PostCard from '../components/PostCard'
import StoreMap from '../components/StoreMap'
import { HOW_IT_WORKS, STORE, STORE_JSONLD, TESTIMONIALS } from '../data/content'
import { useJsonLd, useSeo } from '../useSeo'

export default function HomePage() {
  useSeo({ description: STORE.metaDescription, path: '/' })
  useJsonLd(STORE_JSONLD)

  const [posts, setPosts] = useState<BlogPostSummary[]>([])
  const [postsLoading, setPostsLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchBlogPosts()
      .then((data) => {
        if (active) setPosts(data.slice(0, 3))
      })
      .catch(() => {
        if (active) setPosts([])
      })
      .finally(() => {
        if (active) setPostsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div>
            <span className="eyebrow">New inventory weekly</span>
            <h1>
              Quality goods,
              <br />
              fair prices, every week.
            </h1>
            <p className="lede">
              Brand-name overstock and gently used finds, inspected and priced fairly. Come dig
              through the latest arrivals at our Omaha store.
            </p>
            <div className="hbtns">
              <Link className="btn btn--primary" to="/visit">
                Visit the store
              </Link>
            </div>
          </div>
          <div className="frame">
            <span className="tab">In store now</span>
            <div className="ph g4" style={{ aspectRatio: '5 / 4' }} />
            <div className="cap">
              <b>New finds, every week</b>
              <span>{STORE.retail.address}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="head">
            <div>
              <span className="eyebrow">How it works</span>
              <h2 className="h2">Three simple steps</h2>
            </div>
          </div>
          <div className="how">
            {HOW_IT_WORKS.map((s) => (
              <div className="howc" key={s.n}>
                <div className="hnum">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section tight">
        <div className="wrap">
          <div className="sell">
            <div>
              <h3>Our online store is on the way.</h3>
              <p>
                We&rsquo;re rebuilding ecothrift.us so you can browse and buy online. For now, the
                full selection lives at our store — come see us.
              </p>
            </div>
            <Link className="btn btn--light" to="/visit">
              Plan your visit
            </Link>
          </div>
        </div>
      </section>

      {(postsLoading || posts.length > 0) && (
        <section className="section tight">
          <div className="wrap">
            <div className="head">
              <div>
                <span className="eyebrow">From the founder</span>
                <h2 className="h2">Notes from Bill</h2>
              </div>
              <Link className="link" to="/blog">
                Read the blog →
              </Link>
            </div>
            <div className="bgrid">
              {postsLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div className="post" key={i}>
                      <div className="postthumb ph g3" />
                      <div className="pb">
                        <span className="skline short" />
                        <span className="skline" />
                      </div>
                    </div>
                  ))
                : posts.map((p) => <PostCard key={p.slug} post={p} />)}
            </div>
          </div>
        </section>
      )}

      <section className="section tight">
        <div className="wrap">
          <div className="head">
            <div>
              <span className="eyebrow">From the neighborhood</span>
              <h2 className="h2">Trusted across Omaha</h2>
            </div>
          </div>
          <div className="revs">
            {TESTIMONIALS.map((t, i) => (
              <div className="rev" key={i}>
                <div className="stars">★★★★★</div>
                <p>{t.quote}</p>
                <div className="who">{t.who}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section tight">
        <div className="wrap">
          <div className="visit">
            <StoreMap />
            <div className="vinfo">
              <span className="eyebrow">Visit</span>
              <h3>{STORE.retail.name}</h3>
              <div className="vrow">
                <b>Address</b>
                <span>{STORE.retail.address}</span>
              </div>
              <div className="vrow">
                <b>Hours</b>
                <span>{STORE.retail.hours}</span>
              </div>
              <div className="vrow">
                <b>Pickup</b>
                <span>Free, usually ready the same day</span>
              </div>
              <div style={{ marginTop: 20 }}>
                <Link className="btn btn--primary" to="/visit">
                  Store details
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
