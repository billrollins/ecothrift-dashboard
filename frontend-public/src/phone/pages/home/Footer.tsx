/** Home 8, the close (critic cycle 11-20, owner: the black bar "VERY ugly", the footer logo "redundant"): one light
 *  section in the home's own look, four cream tiles in the Shop by category shape (About, Questions, Careers, Returns;
 *  words.ts INFO, the same names as the menu), then one quiet line: Privacy, Thrift+ terms and the release (owner
 *  2026-10-20: staff can tell which version is live). No logo: the header carries it. Nothing opens in place. */
import { Link } from 'react-router-dom'
import { PAGE_VERSION } from '../../shell/Prompts'
import { INFO, type Info } from '../words'
import './Footer.css'

/** The tiles' line icons (24 box, `svg.i`). */
function InfoIcon({ name }: { name: Info['icon'] }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      {name === 'about' ? (
        <path d="M4 10v10h16V10M3 10l2-6h14l2 6zM10 20v-5h4v5" />
      ) : name === 'questions' ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 17h.01" />
        </>
      ) : name === 'careers' ? (
        <>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18" />
        </>
      ) : (
        <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
      )}
    </svg>
  )
}

/** The tiles under a title: all four, or `only` those places (About ends with Questions and Careers). */
export function InfoTiles({ title = 'Help and info', only }: { title?: string; only?: string[] }) {
  const tiles = only ? INFO.filter((i) => only.includes(i.to)) : INFO
  return (
    <section className="info" aria-labelledby="info-h">
      <div className="sh">
        <h2 id="info-h">{title}</h2>
      </div>
      <nav className="info-grid" aria-label={title}>
        {tiles.map((i) => (
          <Link className="info-t" key={i.to} to={i.to}>
            <InfoIcon name={i.icon} />
            <b>{i.name}</b>
            <span>{i.line}</span>
          </Link>
        ))}
      </nav>
    </section>
  )
}

export default function Footer() {
  return (
    <footer className="foot">
      <InfoTiles />
      <p className="foot-end">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Thrift+ terms</Link>
        {PAGE_VERSION ? <span className="foot-v tn">v{PAGE_VERSION}</span> : null}
      </p>
    </footer>
  )
}
