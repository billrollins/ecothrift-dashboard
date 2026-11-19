/** Home 8, the footer (mockup blocks/90-footer.html): the small, easy to find things, one row each; then the logo on
 *  its own green band; the release small and quiet. "Returns and policies" is the current site's /terms. */
import { Link } from 'react-router-dom'
import { PAGE_VERSION } from '../../shell/Prompts'
import { asset } from '../../shell/Tag'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="foot">
      <Link className="r" to="/about">
        About Eco-Thrift<span>›</span>
      </Link>
      <Link className="r" to="/questions">
        Questions<span>›</span>
      </Link>
      <Link className="r" to="/careers">
        Careers<span>›</span>
      </Link>
      <a className="r" href="/terms">
        Returns and policies<span>›</span>
      </a>
      <div className="brand">
        <img className="logo" src={asset('phone/eco-thrift-logo-white.svg')} width={261} height={64} alt="Eco-Thrift" loading="lazy" decoding="async" />
      </div>
      {PAGE_VERSION ? <p className="foot-v">v{PAGE_VERSION}</p> : null}
    </footer>
  )
}
