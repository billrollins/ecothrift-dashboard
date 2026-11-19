/**
 * Apply (W4): the live form (src/pages/careers/CareersApplyPage.tsx) as short steps. Kept whole: every question and
 * which are required (the careers file's own, plus each picked role's own), the local checks word for word, the resume
 * (PDF, Word or photo; photos shrunk by shrinkPhoto), the bot checks (hidden `website` field, `started_at`), the
 * preview and practice keys (src/careers/api.ts keeps them in sessionStorage and adds them to the request), and the one
 * POST to /api/hiring/public/apply/. Practice links skip the local checks, as live.
 * New: one or two questions a screen, `?step=N` in the URL (the phone's own Back goes back a step), Back and Next in a
 * bar that never moves, answers kept for the tab (a reload keeps them), a review screen before Send, and every error
 * (ours or the server's) shown on the step it belongs to.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { shrinkPhoto, submitApplication, useCareers, type CareerJob } from '../../careers/api'
import { useSeo } from '../../useSeo'
import { QuestionField, TextField } from './careers/Fields'
import { Loading, NoOpenings, PracticeBar, PreviewBar, RoleIcon } from './careers/parts'
import {
  EMPTY_CONTACT,
  answerText,
  buildForm,
  buildSteps,
  checkAll,
  checkStep,
  clearDraft,
  firstErrorStep,
  loadDraft,
  saveDraft,
  stepFields,
  type Answer,
  type Answers,
  type Contact,
  type Item,
  type Step,
} from './careers/steps'
import './careers.css'

type NavState = { crStep?: number } | null

export default function CareersApply() {
  const { careers, loading } = useCareers()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [draft] = useState(loadDraft)
  const startedAt = useRef(draft?.startedAt ?? Date.now())
  const fileInput = useRef<HTMLInputElement>(null)
  const [contact, setContact] = useState<Contact>(draft?.contact ?? EMPTY_CONTACT)
  const [roles, setRoles] = useState<string[]>(draft?.roles ?? [])
  const [answers, setAnswers] = useState<Answers>(draft?.answers ?? {})
  const [smsConsent, setSmsConsent] = useState(draft?.smsConsent ?? false)
  const [resume, setResume] = useState<File | null>(null)
  const [lostResume, setLostResume] = useState(draft?.resumeName ?? '')
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [sending, setSending] = useState(false)
  const [doneName, setDoneName] = useState<string | null>(null)
  const [fromReview, setFromReview] = useState(false)
  const scrollToError = useRef(false)

  useSeo({ title: 'Apply - Careers', path: '/careers/apply', noindex: !!careers?.preview })

  // Once the roles are known: a ?role= link picks that role (as live), and a kept draft drops roles no longer open.
  const settled = useRef(false)
  useEffect(() => {
    if (!careers || settled.current) return
    settled.current = true
    const open = new Set(careers.jobs.map((j) => j.slug))
    const role = params.get('role')
    setRoles((r) => {
      const kept = r.filter((s) => open.has(s))
      return role && open.has(role) && !kept.includes(role) ? [...kept, role] : kept
    })
  }, [careers, params])

  // Keep the answers for this tab (never the resume itself, the honeypot, or anything after Send).
  useEffect(() => {
    if (doneName !== null) return
    saveDraft({ contact, roles, answers, smsConsent, startedAt: startedAt.current, resumeName: resume?.name ?? lostResume })
  }, [contact, roles, answers, smsConsent, resume, lostResume, doneName])

  const steps = useMemo<Step[]>(() => (careers ? buildSteps(careers, roles) : []), [careers, roles])
  const wanted = Number(params.get('step')) || 1
  const at = steps.length ? Math.min(Math.max(wanted, 1), steps.length) - 1 : 0
  const step = steps[at]

  // A new step opens at its top; after a failed Send it opens at its first marked question.
  useLayoutEffect(() => {
    if (scrollToError.current) {
      scrollToError.current = false
      const first = document.querySelector('.cr-step .cr-bad')
      if (first) {
        first.scrollIntoView({ block: 'center' })
        return
      }
    }
    window.scrollTo(0, 0)
  }, [at, doneName])

  useEffect(() => {
    if (step?.kind === 'review') setFromReview(false)
  }, [step?.kind])

  if (loading) return <Loading />
  if (!careers?.public || careers.jobs.length === 0) return <NoOpenings />
  const practice = !!careers.practice

  if (doneName !== null) {
    return (
      <>
        <section className="cr-hero cr-done">
          <div className="cr-tick" aria-hidden="true">
            <svg className="i" viewBox="0 0 24 24">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div className="lbl">{practice ? 'Practice application sent' : 'Application sent'}</div>
          <h1 className="disp cr-h1">
            {practice ? 'Done' : 'Thanks'}
            {doneName ? <span>{doneName}</span> : null}
          </h1>
          {practice ? (
            <p className="cr-sub">
              It&rsquo;s in Dash under People &rarr; Applicants with a Practice tag. Anything you left blank has a
              placeholder. If you gave an email, the auto-reply is on its way, starting with [Practice].
            </p>
          ) : (
            <>
              <p className="cr-sub">We got it. A real person will read your application.</p>
              <p className="cr-sub2">
                We sent a copy of what happens next to your email. If it looks like a fit, we&rsquo;ll email you a link
                to pick an interview time at the store.
              </p>
            </>
          )}
        </section>
        {!practice && (
          <section className="cr-band cr-lime cr-two">
            <Link className="btn btn-ink" to="/careers">
              Back to careers
            </Link>
            <Link className="btn btn-line" to="/#visit">
              Visit the store
            </Link>
          </section>
        )}
      </>
    )
  }

  const form = { contact, roles, answers }
  const laterMarked = steps.findIndex((s, i) => i > at && stepFields(s).some((k) => errors[k]))
  const pickedJobs = careers.jobs.filter((j) => roles.includes(j.slug))

  /** Open step `i`. A push adds a history entry (the phone's Back returns here); state notes where it came from. */
  function go(i: number, push = true) {
    const next = new URLSearchParams(params)
    next.set('step', String(i + 1))
    setParams(next, { replace: !push, state: push ? { crStep: at } : location.state })
  }

  function clearError(key: string) {
    setErrors((e) => {
      if (!e[key]) return e
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  const setAnswer = (key: string, value: Answer) => {
    setAnswers((a) => ({ ...a, [key]: value }))
    clearError(`answers.${key}`)
  }

  const setField = (key: keyof Contact, value: string) => {
    setContact((c) => ({ ...c, [key]: value }))
    clearError(key)
  }

  const toggleRole = (job: CareerJob) => {
    setRoles((r) => (r.includes(job.slug) ? r.filter((s) => s !== job.slug) : [...r, job.slug]))
    clearError('roles')
  }

  function next() {
    setFormError('')
    if (!practice) {
      const found = checkStep(careers!, step, form)
      if (Object.keys(found).length) {
        setErrors((e) => ({ ...e, ...found }))
        window.requestAnimationFrame(() => document.querySelector('.cr-step .cr-bad')?.scrollIntoView({ block: 'center' }))
        return
      }
    }
    if (!fromReview) return go(at + 1)
    // Back from a fix: the next step still marked by the server (or by Send), else the review.
    go(laterMarked > 0 ? laterMarked : steps.length - 1)
  }

  function back() {
    setFormError('')
    const inside = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
    if (at === 0) {
      if (inside) navigate(-1)
      else navigate('/careers')
      return
    }
    if ((location.state as NavState)?.crStep === at - 1) navigate(-1)
    else go(at - 1, false)
  }

  function jump(i: number) {
    setFromReview(true)
    go(i)
  }

  async function send() {
    setFormError('')
    const found = practice ? {} : checkAll(careers!, form)
    if (Object.keys(found).length) {
      setFormError('Please fill in the marked questions.')
      setErrors(found)
      const i = firstErrorStep(steps, found)
      if (i !== at) {
        scrollToError.current = true
        jump(i)
      }
      return
    }
    setSending(true)
    const data = buildForm(careers!, { contact, roles, answers, smsConsent, website, startedAt: startedAt.current })
    if (resume) data.append('resume', await shrinkPhoto(resume))
    const result = await submitApplication(data)
    setSending(false)
    if (result.ok) {
      clearDraft()
      setDoneName(result.first_name ?? '')
      setParams(new URLSearchParams(), { replace: true })
      return
    }
    setFormError(result.detail || 'Please fix the marked questions.')
    const marked = Object.fromEntries(Object.entries(result.errors ?? {}).filter(([, v]) => v))
    if (Object.keys(marked).length) {
      setErrors(marked)
      const i = firstErrorStep(steps, marked)
      if (i !== at) {
        scrollToError.current = true
        jump(i)
      }
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (sending) return
    if (step.kind === 'review') void send()
    else next()
  }

  const renderItem = ({ key, q }: Item) => (
    <QuestionField key={key} name={key} question={q} value={answers[key]} error={errors[`answers.${key}`]}
      onChange={(v) => setAnswer(key, v)} />
  )

  const isLast = step.kind === 'review'
  const pct = Math.round(((at + 1) / steps.length) * 100)

  return (
    <div className="cr-has-nav cr-has-msg">
      <PreviewBar on={careers.preview && !practice} />
      <PracticeBar on={practice}>
        Leave anything blank and press Send; blanks get placeholders. It shows in Dash with a Practice tag.
      </PracticeBar>
      <section className="cr-progress">
        <div className="lbl">Apply to Eco-Thrift</div>
        <div className="cr-prog-row tn">
          Step {at + 1} of {steps.length}
        </div>
        <div className="cr-prog" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </div>
      </section>

      <form className="cr-step" onSubmit={onSubmit} noValidate>
        {step.kind === 'roles' && (
          <>
            <h2 className="cr-step-h">Which role?</h2>
            <p className="cr-step-sub">Pick one or more.</p>
            <div className={`cr-rolepick${errors.roles ? ' cr-bad' : ''}`} data-field="roles">
              {careers.jobs.map((job) => {
                const on = roles.includes(job.slug)
                return (
                  <button type="button" key={job.slug} className="cr-rolebox" aria-pressed={on} onClick={() => toggleRole(job)}>
                    <span className="cr-ic">
                      <RoleIcon slug={job.slug} />
                    </span>
                    <span className="cr-role-t">
                      <b>{job.title}</b>
                      <span>{[job.tagline, job.schedule].filter(Boolean).join(' ')}</span>
                    </span>
                    <span className="cr-tickbox" aria-hidden="true">
                      {on && (
                        <svg className="i" viewBox="0 0 24 24">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      )}
                    </span>
                  </button>
                )
              })}
              <div className="cr-err" aria-live="polite">
                {errors.roles}
              </div>
            </div>
          </>
        )}

        {step.kind === 'name' && (
          <>
            <h2 className="cr-step-h">Your name</h2>
            <TextField name="first_name" label="First name" autoComplete="given-name" value={contact.first_name}
              error={errors.first_name} onChange={(v) => setField('first_name', v)} />
            <TextField name="last_name" label="Last name" autoComplete="family-name" value={contact.last_name}
              error={errors.last_name} onChange={(v) => setField('last_name', v)} />
          </>
        )}

        {step.kind === 'contact' && (
          <>
            <h2 className="cr-step-h">How we reach you</h2>
            <TextField name="phone" label="Mobile phone" type="tel" autoComplete="tel" value={contact.phone}
              error={errors.phone} onChange={(v) => setField('phone', v)} />
            <TextField name="email" label="Email" type="email" autoComplete="email" value={contact.email}
              error={errors.email} onChange={(v) => setField('email', v)} />
            {careers.sms_consent_text ? (
              <label className="cr-check">
                <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} />
                <span>{careers.sms_consent_text}</span>
              </label>
            ) : (
              <p className="cr-note">
                We&rsquo;ll email you about your application: interview times, reminders, and your first day if
                you&rsquo;re hired.
              </p>
            )}
          </>
        )}

        {step.kind === 'questions' && (
          <>
            {step.job && <div className="lbl cr-for">For {step.job.title}</div>}
            {step.items.map(renderItem)}
          </>
        )}

        {step.kind === 'resume' && (
          <>
            <h2 className="cr-step-h">
              Resume <span className="cr-opt">(optional)</span>
            </h2>
            <p className="cr-step-sub">A PDF, a Word file, or a photo of a paper resume. No resume? That&rsquo;s fine.</p>
            <div className={`cr-q${errors.resume ? ' cr-bad' : ''}`} data-field="resume">
              <div className="cr-file">
                <span className="cr-fname">{resume ? resume.name : lostResume ? `Add ${lostResume} again` : 'No file yet'}</span>
                <div className="cr-file-acts">
                  <button type="button" className="btn btn-ink" onClick={() => fileInput.current?.click()}>
                    {resume ? 'Choose a different file' : 'Add a resume'}
                  </button>
                  {resume && (
                    <button type="button" className="btn btn-line" onClick={() => setResume(null)}>
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept=".pdf,.doc,.docx,image/*"
                  onChange={(e) => {
                    setResume(e.target.files?.[0] ?? null)
                    setLostResume('')
                    clearError('resume')
                    e.target.value = ''
                  }}
                />
              </div>
              <div className="cr-err" aria-live="polite">
                {errors.resume}
              </div>
            </div>
            {step.items.map(renderItem)}
          </>
        )}

        {step.kind === 'review' && (
          <Review
            steps={steps}
            careers={careers}
            pickedJobs={pickedJobs}
            contact={contact}
            answers={answers}
            smsConsent={smsConsent}
            resume={resume}
            errors={errors}
            onChange={jump}
          />
        )}

        <div className="cr-hp" aria-hidden="true">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>

        <div className="cr-nav">
          <div className="cr-nav-msg" role="alert">
            {formError}
          </div>
          <div className="cr-nav-row">
            <button type="button" className="btn btn-line" onClick={back} disabled={sending}>
              Back
            </button>
            <button type="submit" className={`btn ${isLast ? 'btn-lime cr-send' : 'btn-ink'}`} disabled={sending}>
              {isLast ? (sending ? 'Sending…' : 'Send') : fromReview && laterMarked < 0 ? 'Review' : 'Next'}
            </button>
          </div>
        </div>
      </form>
      {isLast && (
        <p className="fine cr-foot">
          We use your answers only to consider you for a job at Eco-Thrift. See our{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
      )}
    </div>
  )
}

function Review({
  steps,
  careers,
  pickedJobs,
  contact,
  answers,
  smsConsent,
  resume,
  errors,
  onChange,
}: {
  steps: Step[]
  careers: NonNullable<ReturnType<typeof useCareers>['careers']>
  pickedJobs: CareerJob[]
  contact: Contact
  answers: Answers
  smsConsent: boolean
  resume: File | null
  errors: Record<string, string>
  onChange: (i: number) => void
}) {
  const blocks = steps.slice(0, -1).map((s, i) => {
    let title = ''
    let rows: Array<[string, string, string?]> = []
    switch (s.kind) {
      case 'roles':
        title = 'Role'
        rows = [['', pickedJobs.map((j) => j.title).join(', '), 'roles']]
        break
      case 'name':
        title = 'Name'
        rows = [['', `${contact.first_name} ${contact.last_name}`.trim(), errors.first_name ? 'first_name' : 'last_name']]
        break
      case 'contact':
        title = 'How we reach you'
        rows = [
          ['Phone', contact.phone, 'phone'],
          ['Email', contact.email, 'email'],
          ...(careers.sms_consent_text ? ([['Texts', smsConsent ? 'Yes' : 'No']] as Array<[string, string]>) : []),
        ]
        break
      case 'questions':
        title = s.job ? `For ${s.job.title}` : ''
        rows = s.items.map((it) => [it.q.label, answerText(it.q, answers[it.key]), `answers.${it.key}`])
        break
      case 'resume':
        title = 'Resume'
        rows = [
          ['', resume ? resume.name : 'None', 'resume'],
          ...s.items.map((it) => [it.q.label, answerText(it.q, answers[it.key]), `answers.${it.key}`] as [string, string, string]),
        ]
        break
    }
    return { i, title, rows }
  })
  return (
    <>
      <h2 className="cr-step-h">Check and send</h2>
      <div className="cr-review">
        {blocks.map(({ i, title, rows }) => (
          <div className="cr-rv" key={steps[i].id}>
            <button type="button" className="cr-rv-btn" onClick={() => onChange(i)} aria-label={`Change ${title || rows[0]?.[0] || 'this'}`}>
              <span className="cr-rv-body">
                {title && <b className="cr-rv-t">{title}</b>}
                {rows.map(([label, value, key], n) => (
                  <span className={`cr-rv-row${key && errors[key] ? ' cr-rv-bad' : value ? '' : ' cr-rv-none'}`} key={n}>
                    {label && <small>{label}</small>}
                    <span>{value || (key && errors[key]) || 'Skipped'}</span>
                  </span>
                ))}
              </span>
              <span className="cr-rv-go">Change</span>
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
