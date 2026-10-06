import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import '../../careers/careers.css'
import {
  shrinkPhoto,
  submitApplication,
  useCareers,
  type CareerJob,
  type Question,
} from '../../careers/api'
import { useSeo } from '../../useSeo'
import { NoOpenings, PreviewBar } from './CareersPage'

type Answer = string | string[]
type Answers = Record<string, Answer>

function isEmpty(value: Answer | undefined): boolean {
  return value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

function QuestionField({
  name,
  question,
  value,
  error,
  onChange,
}: {
  name: string
  question: Question
  value: Answer | undefined
  error?: string
  onChange: (value: Answer) => void
}) {
  const id = `q-${name.replace(/[^a-z0-9]/gi, '-')}`
  const label = (
    <label className="cr-label" htmlFor={question.type === 'yes_no' || question.type === 'multi' ? undefined : id}>
      {question.label} {!question.required && <span className="cr-opt">(optional)</span>}
    </label>
  )
  let input
  switch (question.type) {
    case 'yes_no':
      input = (
        <div className="cr-yn" role="radiogroup" aria-label={question.label}>
          {['yes', 'no'].map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={value === option}
              className={value === option ? 'on' : undefined}
              onClick={() => onChange(option)}
            >
              {option === 'yes' ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      )
      break
    case 'multi': {
      const picked = Array.isArray(value) ? value : []
      input = (
        <div className="cr-chips" role="group" aria-label={question.label}>
          {(question.options ?? []).map((option) => {
            const on = picked.includes(option)
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                className={`cr-chip${on ? ' on' : ''}`}
                onClick={() => onChange(on ? picked.filter((p) => p !== option) : [...picked, option])}
              >
                {option}
              </button>
            )
          })}
        </div>
      )
      break
    }
    case 'choice':
      input = (
        <select id={id} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {(question.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
      break
    case 'long_text':
      input = (
        <textarea id={id} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
      )
      break
    default:
      input = (
        <input
          id={id}
          type={question.type === 'number' ? 'number' : question.type === 'date' ? 'date' : question.type === 'time' ? 'time' : 'text'}
          inputMode={question.type === 'number' ? 'numeric' : undefined}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
  return (
    <div className={`cr-q${error ? ' cr-bad' : ''}`} data-field={`answers.${name}`}>
      {label}
      {question.help && <div className="cr-help">{question.help}</div>}
      {input}
      {error && <div className="cr-err">{error}</div>}
    </div>
  )
}

function TextField({
  name,
  label,
  type = 'text',
  value,
  error,
  autoComplete,
  onChange,
}: {
  name: string
  label: string
  type?: string
  value: string
  error?: string
  autoComplete?: string
  onChange: (value: string) => void
}) {
  return (
    <div className={`cr-q${error ? ' cr-bad' : ''}`} data-field={name}>
      <label className="cr-label" htmlFor={`f-${name}`}>
        {label}
      </label>
      <input
        id={`f-${name}`}
        type={type}
        autoComplete={autoComplete}
        inputMode={type === 'tel' ? 'tel' : type === 'email' ? 'email' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <div className="cr-err">{error}</div>}
    </div>
  )
}

export default function CareersApplyPage() {
  const { careers, loading } = useCareers()
  const [params] = useSearchParams()
  const startedAt = useRef(Date.now())
  const fileInput = useRef<HTMLInputElement>(null)
  const [contact, setContact] = useState({ first_name: '', last_name: '', phone: '', email: '' })
  const [roles, setRoles] = useState<string[]>([])
  const [answers, setAnswers] = useState<Answers>({})
  const [smsConsent, setSmsConsent] = useState(false)
  const [resume, setResume] = useState<File | null>(null)
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [sending, setSending] = useState(false)
  const [doneName, setDoneName] = useState<string | null>(null)

  useSeo({ title: 'Apply - Careers', path: '/careers/apply', noindex: !!careers?.preview })

  useEffect(() => {
    const role = params.get('role')
    if (role && careers?.jobs.some((j) => j.slug === role)) setRoles((r) => (r.includes(role) ? r : [...r, role]))
  }, [params, careers])

  const questions = careers?.questions ?? []
  const before = questions.filter((q) => !q.after_roles)
  const after = questions.filter((q) => q.after_roles)
  const pickedJobs = useMemo(
    () => (careers?.jobs ?? []).filter((j) => roles.includes(j.slug)),
    [careers, roles],
  )

  if (loading) {
    return (
      <div className="wrap" aria-busy="true">
        <div className="pagehead">
          <span className="skline" style={{ width: 220 }} />
        </div>
      </div>
    )
  }
  if (!careers?.public || careers.jobs.length === 0) return <NoOpenings />

  if (doneName !== null) {
    return (
      <div className="wrap cr-done">
        <span className="eyebrow">Application sent</span>
        <h1>Thanks{doneName ? `, ${doneName}` : ''}. We got it.</h1>
        <p>
          A real person will read your application. We sent a copy of what happens next to your email. If it
          looks like a fit, we&rsquo;ll call or text you to set up an interview at the store.
        </p>
        <div className="hbtns" style={{ marginTop: 22 }}>
          <Link className="btn btn--ghost" to="/careers">
            Back to careers
          </Link>
          <Link className="btn btn--ghost" to="/visit">
            Visit the store
          </Link>
        </div>
      </div>
    )
  }

  const setAnswer = (key: string, value: Answer) => {
    setAnswers((a) => ({ ...a, [key]: value }))
    setErrors((e) => {
      if (!e[`answers.${key}`]) return e
      const next = { ...e }
      delete next[`answers.${key}`]
      return next
    })
  }

  const setField = (key: keyof typeof contact, value: string) => {
    setContact((c) => ({ ...c, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }))
  }

  const toggleRole = (job: CareerJob) => {
    setRoles((r) => (r.includes(job.slug) ? r.filter((s) => s !== job.slug) : [...r, job.slug]))
    if (errors.roles) setErrors((e) => ({ ...e, roles: '' }))
  }

  function checkLocally(): Record<string, string> {
    const found: Record<string, string> = {}
    if (!contact.first_name.trim()) found.first_name = 'Required.'
    if (!contact.last_name.trim()) found.last_name = 'Required.'
    if (contact.phone.replace(/\D/g, '').length < 10) found.phone = 'Enter a phone number with area code.'
    if (!/^\S+@\S+\.\S+$/.test(contact.email.trim())) found.email = 'Enter an email address.'
    if (roles.length === 0) found.roles = 'Pick at least one role.'
    for (const q of questions) if (q.required && isEmpty(answers[q.key])) found[`answers.${q.key}`] = 'Required.'
    for (const job of pickedJobs) {
      for (const q of job.questions) {
        const key = `${job.slug}.${q.key}`
        if (q.required && isEmpty(answers[key])) found[`answers.${key}`] = 'Required.'
      }
    }
    return found
  }

  function showErrors(found: Record<string, string>) {
    setErrors(found)
    const first = Object.keys(found).find((k) => found[k])
    if (first) {
      const el = document.querySelector(`[data-field="${CSS.escape(first)}"]`)
      el?.scrollIntoView({ block: 'center' })
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError('')
    const found = checkLocally()
    if (Object.keys(found).length) {
      setFormError('Please fill in the marked questions.')
      showErrors(found)
      return
    }
    setSending(true)
    const form = new FormData()
    Object.entries(contact).forEach(([k, v]) => form.append(k, v.trim()))
    roles.forEach((slug) => form.append('roles', slug))
    const sent: Answers = {}
    for (const q of questions) if (!isEmpty(answers[q.key])) sent[q.key] = answers[q.key]
    for (const job of pickedJobs) {
      for (const q of job.questions) {
        const key = `${job.slug}.${q.key}`
        if (!isEmpty(answers[key])) sent[key] = answers[key]
      }
    }
    form.append('answers', JSON.stringify(sent))
    form.append('sms_consent', smsConsent ? 'true' : 'false')
    form.append('website', website)
    form.append('started_at', String(startedAt.current))
    if (resume) form.append('resume', await shrinkPhoto(resume))
    const result = await submitApplication(form)
    setSending(false)
    if (result.ok) {
      setDoneName(result.first_name ?? '')
      window.scrollTo({ top: 0 })
      return
    }
    setFormError(result.detail || 'Please fix the marked questions.')
    if (result.errors) showErrors(result.errors)
  }

  const renderQuestion = (q: Question, key: string) => (
    <QuestionField
      key={key}
      name={key}
      question={q}
      value={answers[key]}
      error={errors[`answers.${key}`]}
      onChange={(v) => setAnswer(key, v)}
    />
  )

  return (
    <>
      <PreviewBar on={careers.preview} />
      <div className="wrap cr-form">
        <div className="pagehead" style={{ paddingTop: 32 }}>
          <Link className="eyebrow" to="/careers">
            ← Careers
          </Link>
          <h1>Apply to Eco-Thrift</h1>
          <p className="lead">{careers.page?.apply_note || 'It takes about 5 minutes.'}</p>
        </div>

        <form onSubmit={onSubmit} noValidate style={{ marginTop: 22 }}>
          {formError && <div className="formerror">{formError}</div>}

          <section className="cr-card">
            <h2>About you</h2>
            <p className="cr-sub">So we can reach you.</p>
            <div className="cr-grid">
              <TextField name="first_name" label="First name" autoComplete="given-name" value={contact.first_name}
                error={errors.first_name} onChange={(v) => setField('first_name', v)} />
              <TextField name="last_name" label="Last name" autoComplete="family-name" value={contact.last_name}
                error={errors.last_name} onChange={(v) => setField('last_name', v)} />
              <TextField name="phone" label="Mobile phone" type="tel" autoComplete="tel" value={contact.phone}
                error={errors.phone} onChange={(v) => setField('phone', v)} />
              <TextField name="email" label="Email" type="email" autoComplete="email" value={contact.email}
                error={errors.email} onChange={(v) => setField('email', v)} />
            </div>
            <label className="cr-consent" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} />
              <span>{careers.sms_consent_text}</span>
            </label>
            <div className="cr-hp" aria-hidden="true">
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>
          </section>

          <section className="cr-card" data-field="roles">
            <h2>Which role?</h2>
            <p className="cr-sub">Pick one or more.</p>
            <div className="cr-rolepick">
              {careers.jobs.map((job) => {
                const on = roles.includes(job.slug)
                return (
                  <button
                    type="button"
                    key={job.slug}
                    className={`cr-rolebox${on ? ' on' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggleRole(job)}
                  >
                    <span className="cr-box" aria-hidden="true">
                      {on ? '✓' : ''}
                    </span>
                    <span>
                      <b>{job.title}</b>
                      <span>
                        {job.tagline} {job.schedule}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            {errors.roles && <div className="cr-err" style={{ marginTop: 8 }}>{errors.roles}</div>}
          </section>

          <section className="cr-card">
            <h2>Your availability and a few questions</h2>
            <p className="cr-sub">Straight answers help us most.</p>
            {before.map((q) => renderQuestion(q, q.key))}
          </section>

          {pickedJobs
            .filter((job) => job.questions.length > 0)
            .map((job) => (
              <section className="cr-card" key={job.slug}>
                <h2>For {job.title}</h2>
                {job.questions.map((q) => renderQuestion(q, `${job.slug}.${q.key}`))}
              </section>
            ))}

          <section className="cr-card">
            <h2>
              Resume <span className="cr-opt" style={{ fontSize: 14 }}>(optional)</span>
            </h2>
            <p className="cr-sub">A PDF, a Word file, or a photo of a paper resume. No resume? That&rsquo;s fine.</p>
            <div className={`cr-q${errors.resume ? ' cr-bad' : ''}`} data-field="resume">
              <div className="cr-file">
                <button type="button" className="btn btn--ghost" onClick={() => fileInput.current?.click()}>
                  {resume ? 'Choose a different file' : 'Add a resume'}
                </button>
                {resume && (
                  <>
                    <span className="cr-fname">{resume.name}</span>
                    <button type="button" className="btn btn--ghost" onClick={() => setResume(null)}>
                      Remove
                    </button>
                  </>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept=".pdf,.doc,.docx,image/*"
                  onChange={(e) => {
                    setResume(e.target.files?.[0] ?? null)
                    setErrors((er) => ({ ...er, resume: '' }))
                    e.target.value = ''
                  }}
                />
              </div>
              {errors.resume && <div className="cr-err">{errors.resume}</div>}
            </div>
            {after.length > 0 && <div style={{ marginTop: 18 }}>{after.map((q) => renderQuestion(q, q.key))}</div>}
          </section>

          <button className="btn btn--primary cr-submit" type="submit" disabled={sending}>
            {sending ? 'Sending…' : 'Send my application'}
          </button>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 12, lineHeight: 1.5 }}>
            We use your answers only to consider you for a job at Eco-Thrift. See our{' '}
            <Link to="/privacy" style={{ textDecoration: 'underline' }}>
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </div>
    </>
  )
}
