import { Link } from 'react-router-dom'
import { AUTHOR, type BlogPost } from '../data/content'
import AuthorAvatar from './AuthorAvatar'

export default function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link className="post" to={`/blog/${post.slug}`}>
      <div className="postthumb">
        <img src={post.img} alt="" loading="lazy" />
      </div>
      <div className="pb">
        <div className="meta">
          {post.series} · {post.date}
        </div>
        <h3>{post.title}</h3>
        <p>{post.excerpt}</p>
        <div className="by">
          <AuthorAvatar />
          {AUTHOR.name}
        </div>
      </div>
    </Link>
  )
}
