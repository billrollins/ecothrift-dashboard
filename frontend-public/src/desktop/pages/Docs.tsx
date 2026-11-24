/**
 * The reading pages on a computer (Dash Update #211): Thrift+ terms, Privacy and one journal post. Their words are the
 * reviewed ones and live in one place only: the phone site's pages render them (phone/pages/Terms.tsx, Privacy.tsx,
 * BlogPost.tsx, which read data/thriftPlusTerms*.ts, data/legal.ts and the blog API), imported whole here and set as a
 * document on a desktop page: a reading column on white, the other policies in a column beside it.
 */
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import PhoneBlogPost from '../../phone/pages/BlogPost'
import PhonePrivacy from '../../phone/pages/Privacy'
import PhoneTerms from '../../phone/pages/Terms'
import './docs.css'

const SIDE: Array<[string, string]> = [
  ['Thrift+ terms', '/terms'],
  ['3-day returns', '/returns'],
  ['Privacy', '/privacy'],
  ['Questions', '/questions'],
  ['Blog', '/blog'],
]

export function DocFrame({ children, kind = 'policy' }: { children: ReactNode; kind?: 'policy' | 'post' }) {
  const { pathname } = useLocation()
  return (
    <div className={`dk-w dk-doc dk-doc-${kind}`}>
      <aside className="dk-doc-side">
        <p className="dk-kick">{kind === 'post' ? 'The Eco-Thrift Journal' : 'Policies'}</p>
        <nav aria-label="Policies">
          {SIDE.map(([name, to]) => (
            <Link key={to} to={to} className={pathname === to ? 'on' : undefined} aria-current={pathname === to ? 'page' : undefined}>
              {name}
            </Link>
          ))}
        </nav>
      </aside>
      <article className="dk-doc-body">{children}</article>
    </div>
  )
}

export function TermsPage() {
  return (
    <DocFrame>
      <PhoneTerms />
    </DocFrame>
  )
}

export function PrivacyPage() {
  return (
    <DocFrame>
      <PhonePrivacy />
    </DocFrame>
  )
}

export function PostPage() {
  return (
    <DocFrame kind="post">
      <PhoneBlogPost />
    </DocFrame>
  )
}
