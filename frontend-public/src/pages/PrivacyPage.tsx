import { Link } from 'react-router-dom'
import { SITE_URL, STORE } from '../data/content'
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, PRIVACY_NO_SHARING } from '../data/legal'
import { useSeo } from '../useSeo'

/** Public Privacy Policy. The bold sentence under "Text messages" is required wording: see data/legal.ts. */
export default function PrivacyPage() {
  useSeo({
    title: 'Privacy Policy',
    description: 'What Eco-Thrift collects, what we do with it, and how to stop text messages.',
    path: '/privacy',
  })
  return (
    <div className="section">
      <div className="wrap article">
        <div className="crumb">
          <Link to="/">Home</Link> / <span>Privacy Policy</span>
        </div>
        <h1 className="atitle">Eco-Thrift Privacy Policy</h1>
        <p className="articledate">Last updated: {LEGAL_LAST_UPDATED}</p>

        <div className="abody" style={{ marginTop: 28 }}>
          <p>
            {LEGAL_ENTITY} (&ldquo;we&rdquo;) runs {SITE_URL}. This page says what we collect and what we do
            with it.
          </p>

          <h2>What we collect</h2>
          <p>
            Your name and contact details (email, mobile number) when you give them to us; the account
            activity needed to run the service; and basic technical data (browser, pages viewed) that keeps
            the site working and secure.
          </p>

          <h2>How we use it</h2>
          <p>
            To run your account and the service you asked for, to send you the messages you agreed to, to
            keep the site secure, and to meet legal requirements. We do not sell your information.
          </p>

          <h2>Text messages</h2>
          <p>
            If you agree to receive texts, we use your mobile number only to send the kinds of messages you
            agreed to. <strong data-testid="privacy-no-sharing">{PRIVACY_NO_SHARING}</strong> Your number is
            shared only with the service providers that deliver the messages (our text-messaging provider
            and the phone carriers).
          </p>

          <h2>Who else sees it</h2>
          <p>
            Companies that run our hosting, payments, email and text delivery, only as needed to do that job
            for us; and authorities when the law requires it.
          </p>

          <h2>Your choices</h2>
          <p>
            You can ask us to show, correct or delete your information, and you can stop texts at any time by
            replying STOP.
          </p>

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
          <p>
            See also our <Link to="/terms">Terms</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
