import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useOnlineSalesConfig } from './onlineSalesConfig'

/**
 * Is Thrift+ open? (owner 10-15, website spec 11-website.md). The home band, the Visit "Bring your phone" block, the
 * Thrift+ nav link, the Price check button, the /terms line and the /thriftplus page show only while it is, on the
 * same switch the app (/scan) uses, so nothing sends shoppers to a closed app before launch.
 *
 * 1. Open for customers: the site config's `thrift_plus_open` (/api/webstore/config/), the `thrift_plus_enabled`
 *    setting that the app's gate reads.
 * 2. While it is off, the owner can preview: ask the app's own gate, GET /api/thriftplus/public/session/, the way the
 *    app's isOpen() does. It lets in a phone that keeps the staff preview code (from /scan?preview=<code>, sent as
 *    X-ThriftPlus-Preview) or is signed in to the app as a staff or practice member (its cookie), and answers
 *    403 THRIFT_PLUS_OFF to everyone else. Unlike the app, an error here counts as closed.
 *
 * Dev only: VITE_THRIFT_PLUS_DEV_OPEN=1 shows it open (0: closed) on the Vite dev server, which has no API behind it.
 * A production build ignores it.
 */

const PREVIEW_KEY = 'thriftPlus.preview' // the app's key (dashboard frontend, thriftPlusScanner.api.ts)
const SESSION_URL = '/api/thriftplus/public/session/'

const DEV_OVERRIDE: boolean | null = import.meta.env.DEV
  ? import.meta.env.VITE_THRIFT_PLUS_DEV_OPEN === '1'
    ? true
    : import.meta.env.VITE_THRIFT_PLUS_DEV_OPEN === '0'
      ? false
      : null
  : null

function previewCode(): string {
  try {
    return (window.localStorage.getItem(PREVIEW_KEY) || '').trim()
  } catch {
    return ''
  }
}

/** True only when the app's gate lets this phone in (the preview code or a staff sign-in). */
async function appLetsThisPhoneIn(): Promise<boolean> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const code = previewCode()
  if (code) headers['X-ThriftPlus-Preview'] = code
  try {
    const res = await fetch(SESSION_URL, { headers, credentials: 'same-origin' })
    return res.ok
  } catch {
    return false
  }
}

interface ThriftPlusOpenState {
  /** Show the Thrift+ pieces. */
  open: boolean
  /** Still finding out: show nothing yet (and /thriftplus waits). */
  loading: boolean
}

const ThriftPlusOpenContext = createContext<ThriftPlusOpenState>({ open: false, loading: true })

export function ThriftPlusOpenProvider({ children }: { children: ReactNode }) {
  const { config, loading: configLoading } = useOnlineSalesConfig()
  const forCustomers = config.thrift_plus_open === true
  const [preview, setPreview] = useState<{ open: boolean; loading: boolean }>({ open: false, loading: true })

  useEffect(() => {
    if (DEV_OVERRIDE !== null || configLoading || forCustomers) return
    let live = true
    setPreview((p) => ({ ...p, loading: true }))
    appLetsThisPhoneIn().then((open) => {
      if (live) setPreview({ open, loading: false })
    })
    return () => {
      live = false
    }
  }, [configLoading, forCustomers])

  let state: ThriftPlusOpenState
  if (DEV_OVERRIDE !== null) state = { open: DEV_OVERRIDE, loading: false }
  else if (configLoading) state = { open: false, loading: true }
  else if (forCustomers) state = { open: true, loading: false }
  else state = preview

  return <ThriftPlusOpenContext.Provider value={state}>{children}</ThriftPlusOpenContext.Provider>
}

export function useThriftPlusOpen(): ThriftPlusOpenState {
  return useContext(ThriftPlusOpenContext)
}
