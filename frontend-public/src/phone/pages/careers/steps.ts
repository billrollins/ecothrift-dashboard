/**
 * The apply form as short steps (W4). The questions, which are required, the checks and the request are the live
 * form's (src/pages/careers/CareersApplyPage.tsx); only the order of screens is new:
 * role -> name -> how we reach you -> the shared questions (one or two a screen) -> each picked role's own questions
 * -> resume (+ the "after roles" questions) -> review -> Send.
 */
import type { CareerJob, Careers, Question } from '../../../careers/api'

export type Answer = string | string[]
export type Answers = Record<string, Answer>
export type Contact = { first_name: string; last_name: string; phone: string; email: string }

/** One question on a screen: its answer key (`days`, or `<role slug>.<key>` for a role's own) and the question. */
export type Item = { key: string; q: Question }

export type Step =
  | { kind: 'roles'; id: 'roles' }
  | { kind: 'name'; id: 'name' }
  | { kind: 'contact'; id: 'contact' }
  | { kind: 'questions'; id: string; items: Item[]; job?: CareerJob }
  | { kind: 'resume'; id: 'resume'; items: Item[] }
  | { kind: 'review'; id: 'review' }

export function isEmpty(value: Answer | undefined): boolean {
  return value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

/**
 * Pack questions into screens of one or two, in their order: a long answer has a screen to itself unless a pick-one
 * question comes just before it (lead_interest + led_before); yes/no questions pair with yes/no questions only.
 */
export function packQuestions(items: Item[]): Item[][] {
  const screens: Item[][] = []
  let cur: Item[] = []
  const fits = (a: Item, b: Item) => {
    const ta = a.q.type
    const tb = b.q.type
    if (ta === 'long_text') return false
    if (tb === 'long_text') return ta === 'choice'
    if (ta === 'yes_no' || tb === 'yes_no') return ta === tb
    return true
  }
  for (const item of items) {
    if (cur.length === 1 && fits(cur[0], item)) {
      cur.push(item)
      screens.push(cur)
      cur = []
      continue
    }
    if (cur.length) screens.push(cur)
    cur = [item]
  }
  if (cur.length) screens.push(cur)
  return screens
}

/** The screens for this careers file and the roles picked so far. */
export function buildSteps(careers: Careers, roles: string[]): Step[] {
  const questions = careers.questions ?? []
  const before = questions.filter((q) => !q.after_roles).map((q) => ({ key: q.key, q }))
  const after = questions.filter((q) => q.after_roles).map((q) => ({ key: q.key, q }))
  const picked = careers.jobs.filter((j) => roles.includes(j.slug))
  const steps: Step[] = [
    { kind: 'roles', id: 'roles' },
    { kind: 'name', id: 'name' },
    { kind: 'contact', id: 'contact' },
  ]
  packQuestions(before).forEach((items) => steps.push({ kind: 'questions', id: `q:${items[0].key}`, items }))
  for (const job of picked) {
    const own = (job.questions ?? []).map((q) => ({ key: `${job.slug}.${q.key}`, q }))
    packQuestions(own).forEach((items) => steps.push({ kind: 'questions', id: `q:${items[0].key}`, items, job }))
  }
  // The resume screen carries one "after roles" question with it; more get screens of their own after it.
  steps.push({ kind: 'resume', id: 'resume', items: after.length === 1 ? after : [] })
  if (after.length > 1) packQuestions(after).forEach((items) => steps.push({ kind: 'questions', id: `q:${items[0].key}`, items }))
  steps.push({ kind: 'review', id: 'review' })
  return steps
}

/** The error keys a screen owns (the same keys the server answers with). */
export function stepFields(step: Step): string[] {
  switch (step.kind) {
    case 'roles':
      return ['roles']
    case 'name':
      return ['first_name', 'last_name']
    case 'contact':
      return ['phone', 'email']
    case 'questions':
      return step.items.map((i) => `answers.${i.key}`)
    case 'resume':
      return ['resume', ...step.items.map((i) => `answers.${i.key}`)]
    default:
      return []
  }
}

/** The live form's own checks (checkLocally), word for word. */
export function checkAll(
  careers: Careers,
  form: { contact: Contact; roles: string[]; answers: Answers },
): Record<string, string> {
  const { contact, roles, answers } = form
  const found: Record<string, string> = {}
  if (!contact.first_name.trim()) found.first_name = 'Required.'
  if (!contact.last_name.trim()) found.last_name = 'Required.'
  if (contact.phone.replace(/\D/g, '').length < 10) found.phone = 'Enter a phone number with area code.'
  if (!/^\S+@\S+\.\S+$/.test(contact.email.trim())) found.email = 'Enter an email address.'
  if (roles.length === 0) found.roles = 'Pick at least one role.'
  for (const q of careers.questions ?? []) if (q.required && isEmpty(answers[q.key])) found[`answers.${q.key}`] = 'Required.'
  for (const job of careers.jobs.filter((j) => roles.includes(j.slug))) {
    for (const q of job.questions ?? []) {
      const key = `${job.slug}.${q.key}`
      if (q.required && isEmpty(answers[key])) found[`answers.${key}`] = 'Required.'
    }
  }
  return found
}

/** Only the errors that belong on this screen. */
export function checkStep(
  careers: Careers,
  step: Step,
  form: { contact: Contact; roles: string[]; answers: Answers },
): Record<string, string> {
  const all = checkAll(careers, form)
  const mine: Record<string, string> = {}
  for (const k of stepFields(step)) if (all[k]) mine[k] = all[k]
  return mine
}

/** The first screen holding one of these errors (the review screen when none of them has a home). */
export function firstErrorStep(steps: Step[], errors: Record<string, string>): number {
  const keys = Object.keys(errors).filter((k) => errors[k])
  for (let i = 0; i < steps.length; i++) {
    const own = stepFields(steps[i])
    if (keys.some((k) => own.includes(k))) return i
  }
  return steps.length - 1
}

/**
 * The request, exactly as the live form builds it: contact fields (trimmed), one `roles` per slug, `answers` as
 * JSON (only answered questions, the picked roles' own under `<slug>.<key>`), `sms_consent`, the honeypot `website`,
 * `started_at` (ms). The resume is added by the caller (after shrinkPhoto); the preview and practice keys are added
 * by submitApplication.
 */
export function buildForm(
  careers: Careers,
  form: { contact: Contact; roles: string[]; answers: Answers; smsConsent: boolean; website: string; startedAt: number },
): FormData {
  const data = new FormData()
  Object.entries(form.contact).forEach(([k, v]) => data.append(k, v.trim()))
  form.roles.forEach((slug) => data.append('roles', slug))
  const sent: Answers = {}
  for (const q of careers.questions ?? []) if (!isEmpty(form.answers[q.key])) sent[q.key] = form.answers[q.key]
  for (const job of careers.jobs.filter((j) => form.roles.includes(j.slug))) {
    for (const q of job.questions ?? []) {
      const key = `${job.slug}.${q.key}`
      if (!isEmpty(form.answers[key])) sent[key] = form.answers[key]
    }
  }
  data.append('answers', JSON.stringify(sent))
  data.append('sms_consent', form.smsConsent ? 'true' : 'false')
  data.append('website', form.website)
  data.append('started_at', String(form.startedAt))
  return data
}

/** How an answer reads on the review screen. */
export function answerText(q: Question, value: Answer | undefined): string {
  if (isEmpty(value)) return ''
  if (q.type === 'yes_no') return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : String(value)
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

// ── The draft: kept for this tab, so a reload (or a trip to another page) keeps every answer ─────────────────────

export const DRAFT_KEY = 'ecothrift.careers.apply.draft'

export type Draft = {
  contact: Contact
  roles: string[]
  answers: Answers
  smsConsent: boolean
  /** When the form was first opened (the server's "too fast" check reads it); a reload keeps the first time. */
  startedAt: number
  /** The resume cannot be kept across a reload; its name is, so the screen can ask for it again. */
  resumeName: string
}

export const EMPTY_CONTACT: Contact = { first_name: '', last_name: '', phone: '', email: '' }

export function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<Draft>
    if (!d || typeof d !== 'object') return null
    const contact = { ...EMPTY_CONTACT }
    for (const k of Object.keys(EMPTY_CONTACT) as (keyof Contact)[]) {
      if (typeof d.contact?.[k] === 'string') contact[k] = d.contact[k] as string
    }
    const answers: Answers = {}
    if (d.answers && typeof d.answers === 'object') {
      for (const [k, v] of Object.entries(d.answers)) {
        if (typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string'))) answers[k] = v
      }
    }
    return {
      contact,
      roles: Array.isArray(d.roles) ? d.roles.filter((r): r is string => typeof r === 'string') : [],
      answers,
      smsConsent: d.smsConsent === true,
      startedAt: typeof d.startedAt === 'number' && d.startedAt > 0 ? d.startedAt : Date.now(),
      resumeName: typeof d.resumeName === 'string' ? d.resumeName : '',
    }
  } catch {
    return null
  }
}

export function saveDraft(d: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d))
  } catch {
    /* private mode or full: the form still works, it just won't survive a reload */
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* nothing kept */
  }
}
