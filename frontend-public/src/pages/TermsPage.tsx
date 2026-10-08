import { Link } from 'react-router-dom'
import { SITE_URL, STORE } from '../data/content'
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, NO_TEXTS } from '../data/legal'
import { useSeo } from '../useSeo'

/** Public Terms: the website and the emails we send (email-first, D20). See data/legal.ts. */
export default function TermsPage() {
  useSeo({
    title: 'Terms',
    description: 'Eco-Thrift terms: the website and the emails we send, and how to stop them.',
    path: '/terms',
  })
  return (
    <div className="section">
      <div className="wrap article">
        <div className="crumb">
          <Link to="/">Home</Link> / <span>Terms</span>
        </div>
        <h1 className="atitle">Eco-Thrift Terms</h1>
        <p className="articledate">Last updated: {LEGAL_LAST_UPDATED}</p>

        <div className="abody" style={{ marginTop: 28 }}>
          <p>
            These terms cover the Eco-Thrift website ({SITE_URL}) and the emails we send. Both are run by{' '}
            {LEGAL_ENTITY}.
          </p>

          <h2>Emails</h2>
          <ul>
            <li>
              <strong>Who sends:</strong> Eco-Thrift ({LEGAL_ENTITY}), from{' '}
              <a href={`mailto:${STORE.email}`}>{STORE.email}</a>.
            </li>
            <li>
              <strong>Always:</strong> the emails something you did needs, such as a receipt, an online hold, a
              Thrift+ warranty return, or a job application you sent us (interview times, reminders, and your first
              day if you&rsquo;re hired).
            </li>
            <li>
              <strong>Thrift+ members who give us an email:</strong> their Thrift+ updates (savings, gift card
              balance, receipts and returns), and store news (new arrivals and sales).
            </li>
            <li>
              <strong>Stopping store news:</strong> every store news email has an unsubscribe link, and we honor it
              promptly. Thrift+ members can also turn store news off in their Thrift+ account or at any register.
            </li>
            <li>
              <strong>Giving an email is optional</strong>, and never a condition of purchase or of joining Thrift+.
            </li>
            <li>
              <strong>Privacy:</strong> see our <Link to="/privacy">Privacy Policy</Link> at {SITE_URL}/privacy.
            </li>
          </ul>

          <h2>Text messages</h2>
          <p data-testid="terms-no-texts">{NO_TEXTS}</p>

          <h2>Contact</h2>
          <p>
            {LEGAL_ENTITY}
            <br />
            {STORE.retail.address}
            <br />
            <a href={`tel:${STORE.retail.phoneHref}`}>{STORE.retail.phone}</a>
            <br />
            <a href={`mailto:${STORE.email}`}>{STORE.email}</a>
          </p>
        </div>
      </div>
    </div>
  )
}
