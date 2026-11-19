/** Not found on the phone site: one headline, a search box that opens /store?q=, and a button home. */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSeo } from '../../useSeo'
import './legal/legal.css'

/** The store search a typed text opens ('' opens the whole list). */
export function storeSearch(text: string): string {
  const q = text.trim()
  return q ? `/store?q=${encodeURIComponent(q)}` : '/store'
}

export default function NotFound() {
  useSeo({ title: 'Page not found', noindex: true })
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate(storeSearch(text))
  }
  return (
    <div className="lg">
      <header className="lg-hd">
        <p className="lbl">404</p>
        <h1 className="disp">We couldn&rsquo;t find that page</h1>
      </header>
      <div className="lg-one">
        <form className="lg-find" role="search" onSubmit={submit}>
          <input
            type="search"
            enterKeyHint="search"
            aria-label="Search the store"
            placeholder="Search the store"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" aria-label="Search">
            <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </button>
        </form>
        <Link className="btn btn-ink" to="/">
          Back to home
        </Link>
      </div>
    </div>
  )
}
