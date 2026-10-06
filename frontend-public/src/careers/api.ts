// Careers API (/api/hiring/public/). The page stays hidden until the owner turns it on;
// a preview key from Dash (?preview=…) shows it early and rides along on every call.
import { useEffect, useState } from 'react'

const BASE = '/api/hiring/public'
const PREVIEW_KEY = 'ecothrift.careers.preview'

export type QuestionType = 'yes_no' | 'text' | 'long_text' | 'number' | 'choice' | 'multi' | 'date' | 'time'

export interface Question {
  key: string
  label: string
  type: QuestionType
  required: boolean
  options?: string[]
  must_be?: 'yes' | 'no'
  help?: string
  after_roles?: boolean
}

export interface CareerJob {
  slug: string
  title: string
  tagline: string
  summary: string
  duties: string[]
  success: string[]
  looking_for: string[]
  nice_to_have: string[]
  physical: string[]
  works_with: string
  schedule: string
  hours: string
  employment_type: 'full_time' | 'part_time' | 'full_or_part'
  pay_min: string | null
  pay_text: string
  questions: Question[]
  updated_at: string
}

export interface CareersPageText {
  headline: string
  roles_line: string
  intro: string[]
  hours_line: string
  pay: string
  what_we_ask: string
  apply_note: string
  growth: string
  photo_url: string
}

export interface Careers {
  public: boolean
  preview?: boolean
  page?: CareersPageText
  questions?: Question[]
  sms_consent_text?: string
  jobs: CareerJob[]
}

/** Remember a preview key from the URL for this tab, so moving between careers pages keeps it. */
export function previewKey(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('preview')
    if (fromUrl) {
      sessionStorage.setItem(PREVIEW_KEY, fromUrl)
      return fromUrl
    }
    return sessionStorage.getItem(PREVIEW_KEY) || ''
  } catch {
    return ''
  }
}

let cached: Promise<Careers> | null = null

export function fetchCareers(): Promise<Careers> {
  if (!cached) {
    const key = previewKey()
    const url = key ? `${BASE}/careers/?preview=${encodeURIComponent(key)}` : `${BASE}/careers/`
    cached = fetch(url, { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : { public: false, jobs: [] }))
      .catch(() => ({ public: false, jobs: [] }))
  }
  return cached
}

export function useCareers(): { careers: Careers | null; loading: boolean } {
  const [careers, setCareers] = useState<Careers | null>(null)
  useEffect(() => {
    let alive = true
    fetchCareers().then((data) => {
      if (alive) setCareers(data)
    })
    return () => {
      alive = false
    }
  }, [])
  return { careers, loading: careers === null }
}

export interface ApplyResult {
  ok: boolean
  first_name?: string
  detail?: string
  errors?: Record<string, string>
}

export async function submitApplication(form: FormData): Promise<ApplyResult> {
  const key = previewKey()
  if (key) form.append('preview', key)
  try {
    const res = await fetch(`${BASE}/apply/`, { method: 'POST', body: form, headers: { Accept: 'application/json' } })
    const data = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true, first_name: data.first_name }
    if (res.status === 429) {
      return { ok: false, detail: 'Too many tries from this connection. Please wait a bit and try again.' }
    }
    return { ok: false, detail: data.detail || 'Something went wrong. Please try again.', errors: data.errors || {} }
  } catch {
    return { ok: false, detail: 'We could not reach the server. Check your connection and try again.' }
  }
}

/** Shrink a phone photo before upload (max 2000 px, JPEG). PDFs and Word files pass through. */
export async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 1_500_000) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// ── The interview link (/careers/interview?t=…) ─────────────────────────────

export interface InterviewTimeOption {
  start: string
  end: string
  day: string
  date: string
  label: string
}

export interface InterviewState {
  ok: boolean
  detail?: string
  first_name?: string
  roles?: string[]
  length_minutes?: number
  place?: string
  interview?: { start: string; end: string; when: string; interviewer: string; place: string } | null
  times?: InterviewTimeOption[]
}

async function interviewCall(url: string, body?: unknown): Promise<InterviewState> {
  try {
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) return data as InterviewState
    const detail =
      data.detail ||
      (data.start ? String(Array.isArray(data.start) ? data.start[0] : data.start) : '') ||
      (res.status === 429 ? 'Too many tries. Please wait a minute.' : 'Something went wrong. Please try again.')
    return { ok: false, detail }
  } catch {
    return { ok: false, detail: 'We could not reach the server. Check your connection and try again.' }
  }
}

export const getInterview = (token: string) => interviewCall(`${BASE}/interview/?t=${encodeURIComponent(token)}`)
export const bookInterview = (token: string, start: string) => interviewCall(`${BASE}/interview/`, { t: token, start })
export const cancelInterview = (token: string) => interviewCall(`${BASE}/interview/cancel/`, { t: token })
