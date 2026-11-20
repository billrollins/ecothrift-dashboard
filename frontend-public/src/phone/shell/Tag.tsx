/** The price tag: an ink block with soft lime numbers; `deal` = the gold deal tag (owner 2026-11-20, G2: door busters,
 *  Black Friday, BO-HO-GO; gold means a special deal and nothing else). `$` small, cents raised. Colours: kit.css tokens. */
import { tagParts } from '../lib/format'

export function Tag({ price, cents = 'always', className = '', deal = false }: { price: number; cents?: 'always' | 'auto'; className?: string; deal?: boolean }) {
  const { dollars, cents: c } = tagParts(price)
  const showCents = cents === 'always' || c !== '00'
  return (
    <span className={`tag tn${deal ? ' tag-deal' : ''}${className ? ` ${className}` : ''}`}>
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

