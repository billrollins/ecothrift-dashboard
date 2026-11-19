/** The printed price tag: black block, lime numbers. `$` small, cents raised. */
import { tagParts } from '../lib/format'

export function Tag({ price, cents = 'always', className = '' }: { price: number; cents?: 'always' | 'auto'; className?: string }) {
  const { dollars, cents: c } = tagParts(price)
  const showCents = cents === 'always' || c !== '00'
  return (
    <span className={`tag tn${className ? ` ${className}` : ''}`}>
      <small>$</small>
      {dollars}
      {showCents ? <sup>{c}</sup> : null}
    </span>
  )
}

/** A file in frontend-public/public/ (prod base `/static/site/`). */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}

