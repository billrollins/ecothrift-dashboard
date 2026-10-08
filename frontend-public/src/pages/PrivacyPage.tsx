import { Link } from 'react-router-dom'
import { SITE_URL, STORE } from '../data/content'
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, NO_TEXTS, PRIVACY_NO_SHARING } from '../data/legal'
import { useSeo } from '../useSeo'

/** Public Privacy Policy (email-first, D20). See data/legal.ts. */
export default function PrivacyPage() {
  useSeo({
    title: 'Privacy Policy',
    description: 'What Eco-Thrift collects, what we do with it, and how to stop our emails.',
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
            Your name and contact details (email, phone number) when you give them to us; the account
            activity needed to run the service; and basic technical data (browser, pages viewed) that keeps
            the site working and secure.
          </p>

          <h2>How we use it</h2>
          <p>
            To run your account and the service you asked for, to send you the messages you agreed to, to
            keep the site secure, and to meet legal requirements. We do not sell your information.
          </p>

          <h2>Email</h2>
          <p>
            We email you what something you did needs (a receipt, a hold, a warranty return, a job application).
            Thrift+ members who give an email also get their Thrift+ updates and store news; every store news email
            has an unsubscribe link.{' '}
            <strong data-testid="privacy-no-sharing">{PRIVACY_NO_SHARING}</strong> Your address is shared only
            with the service providers that deliver our email.
          </p>

          <h2>Text messages</h2>
          <p data-testid="privacy-no-texts">{NO_TEXTS}</p>

          <h2>Job applications</h2>
          <p>
            When you apply for a job, we keep your answers, your resume if you add one, and notes from the
            people who review it. We use them only to consider you for work at Eco-Thrift, and we keep them for
            at least a year after we decide. Only the people at Eco-Thrift who handle hiring can see them.
          </p>

          <h2>Who else sees it</h2>
          <p>
            Companies that run our hosting, payments and email sending, only as needed to do that job for
            us; and authorities when the law requires it.
          </p>

          <h2>Your choices</h2>
          <p>
            You can ask us to show, correct or delete your information. You can stop store news with the
            unsubscribe link in any of those emails, and Thrift+ members can turn store news off in their Thrift+
            account or at any register.
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
