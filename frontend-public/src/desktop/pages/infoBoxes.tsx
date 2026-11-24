/** The four places a shopper looks for (phone/pages/words.ts INFO: About, Questions, Careers, Returns) as equal boxes
 *  with the phone's line icons. */
import { Link } from 'react-router-dom'
import { INFO, type Info } from '../../phone/pages/words'

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

export function InfoBoxes({ skip }: { skip?: string }) {
  const tiles = INFO.filter((i) => i.to !== skip)
  return (
    <nav className={`dk-boxes${tiles.length === 4 ? ' four' : ''}`} aria-label="Help and info" style={{ marginTop: 20 }}>
      {tiles.map((i) => (
        <Link className="dk-box" key={i.to} to={i.to} style={{ minHeight: 150 }}>
          <InfoIcon name={i.icon} />
          <b>{i.name}</b>
          <span>{i.line}</span>
        </Link>
      ))}
    </nav>
  )
}
