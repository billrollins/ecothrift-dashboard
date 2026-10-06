import { Link } from 'react-router-dom'
import { SITE_URL, STORE } from '../data/content'
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, TERMS_RATES } from '../data/legal'
import { useSeo } from '../useSeo'

/** Public Terms. "Message and data rates may apply." is required wording: see data/legal.ts. */
export default function TermsPage() {
  useSeo({
    title: 'Terms',
    description: 'Eco-Thrift terms, including our text messaging program: what we send, how to stop, and how to get help.',
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
            These terms cover the Eco-Thrift website ({SITE_URL}) and the text messages we send. Both are run
            by {LEGAL_ENTITY}.
          </p>

          <h2>Text messaging program</h2>
          <ul>
            <li>
              <strong>Who sends:</strong> Eco-Thrift ({LEGAL_ENTITY}).
            </li>
            <li>
              <strong>Who it is for:</strong> Thrift+ members, customers and job applicants who agree to receive
              texts.
            </li>
            <li>
              <strong>What we send:</strong>
              <ul style={{ marginTop: 8 }}>
                <li>
                  <strong>Thrift+ account texts:</strong> your welcome message, rewards and credit balance,
                  receipts, and return updates.
                </li>
                <li>
                  <strong>Store news texts:</strong> new arrivals, truck days, and sales, up to about 4
                  messages a month.
                </li>
                <li>
                  <strong>Job application texts:</strong> for people who apply at {SITE_URL}/careers and tick
                  the box: interview times and reminders, and a first-day reminder if you are hired.
                </li>
              </ul>
            </li>
            <li>
              <strong>How often:</strong> message frequency varies.
            </li>
            <li>
              <strong>Cost:</strong> <span data-testid="terms-rates">{TERMS_RATES}</span>
            </li>
            <li>
              <strong>Stopping:</strong> reply <strong>STOP</strong> to any message to opt out; you&rsquo;ll get
              one message confirming it. Reply <strong>START</strong> to opt back in.
            </li>
            <li>
              <strong>Help:</strong> reply <strong>HELP</strong>, or contact us at{' '}
              <a href={`tel:${STORE.retail.phoneHref}`}>{STORE.retail.phone}</a> or{' '}
              <a href={`mailto:${STORE.email}`}>{STORE.email}</a>.
            </li>
            <li>
              <strong>Consent is not a condition of purchase</strong> or of using the service.
            </li>
            <li>Carriers are not liable for delayed or undelivered messages.</li>
            <li>
              <strong>Privacy:</strong> see our <Link to="/privacy">Privacy Policy</Link> at {SITE_URL}/privacy.
            </li>
          </ul>

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
