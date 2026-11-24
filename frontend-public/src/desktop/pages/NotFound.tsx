/** Not found on a computer (Dash Update #211): one headline, a search that opens /store?q= (the phone's `storeSearch`),
 *  and a button home. */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { storeSearch } from '../../phone/pages/NotFound'
import { useSeo } from '../../useSeo'
import './info.css'

export default function NotFound() {
  useSeo({ title: 'Page not found', noindex: true })
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate(storeSearch(text))
  }
  return (
    <div className="dk-w dk-nf">
      <p className="dk-kick">404</p>
      <h1 className="disp">We couldn’t find that page</h1>
      <form role="search" onSubmit={submit}>
        <input type="search" aria-label="Search the store" placeholder="Search the store" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Search</button>
      </form>
      <Link className="btn btn-ink" to="/">
        Back to home
      </Link>
    </div>
  )
}
