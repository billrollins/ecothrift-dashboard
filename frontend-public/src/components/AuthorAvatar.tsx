import { AUTHOR } from '../data/content'

interface AuthorAvatarProps {
  /** `sm` = blog cards (26px); `lg` = article byline (44px) */
  size?: 'sm' | 'lg'
}

export default function AuthorAvatar({ size = 'sm' }: AuthorAvatarProps) {
  return (
    <img
      className={`avatar${size === 'lg' ? ' avatar--lg' : ''}`}
      src={AUTHOR.photo}
      alt={AUTHOR.name}
      width={size === 'lg' ? 44 : 26}
      height={size === 'lg' ? 44 : 26}
      loading="lazy"
    />
  )
}
