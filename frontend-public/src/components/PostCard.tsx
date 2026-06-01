import { Link } from 'react-router-dom'
import type { BlogPostSummary } from '../api'
import AuthorAvatar from './AuthorAvatar'

export default function PostCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link className="post" to={`/blog/${post.slug}`}>
      <div className="postthumb">
        {post.hero ? <img src={post.hero.url} alt={post.hero.alt || ''} loading="lazy" /> : null}
      </div>
      <div className="pb">
        <div className="meta">
          {post.series}
          {post.series && post.date ? ' · ' : ''}
          {post.date}
        </div>
        <h3>{post.title}</h3>
        <p>{post.excerpt}</p>
        <div className="by">
          <AuthorAvatar />
          {post.author_name}
        </div>
      </div>
    </Link>
  )
}
