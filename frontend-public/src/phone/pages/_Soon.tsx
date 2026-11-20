/** A page that a later piece builds: a tiny stand-in so every owned path answers today. Replace its lazy import in
 *  App.tsx with the real page; nothing else changes. */
import { Link, useLocation } from 'react-router-dom'

const NAMES: Array<[RegExp, string]> = [
  [/^\/store\/item\//, 'This item'],
  [/^\/store/, 'In store'],
  [/^\/categories/, 'Categories'],
  [/^\/thriftplus/, 'Thrift+'],
  [/^\/about/, 'About'],
  [/^\/questions/, 'Questions'],
  [/^\/careers/, 'Careers'],
]

export default function Soon() {
  const { pathname } = useLocation()
  const name = NAMES.find(([re]) => re.test(pathname))?.[1] || 'This page'
  return (
    <section className="soon">
      <h1 className="disp">{name}</h1>
      <p>Coming in the next update.</p>
      <Link className="btn btn-ink" to="/">
        Home
      </Link>
    </section>
  )
}
