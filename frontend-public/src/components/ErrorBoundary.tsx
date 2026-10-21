import { Component, type ErrorInfo, type ReactNode } from 'react'
import { getAccessToken } from '../auth'
import { APP_VERSION } from '../appVersion'

/**
 * The site's safety net (critic review 2026-10-21, point 8). A crash shows "Something went wrong" with Reload instead of
 * a blank page and goes to the owner's error alerts (Dash). A deploy that replaced the site's files (an old tab asks
 * for page files that are gone) shows "This page was updated" with Reload, and is not reported.
 */
const NEW_VERSION_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i

export function isNewVersionError(error: unknown): boolean {
  if (!error) return false
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return NEW_VERSION_PATTERN.test(text)
}

function report(error: unknown, info: ErrorInfo) {
  const err = error instanceof Error ? error : new Error(String(error))
  const token = getAccessToken()
  fetch('/api/core/errors/report/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      message: `${err.name}: ${err.message}`,
      stack: err.stack ?? '',
      component_stack: info.componentStack ?? '',
      path: `ecothrift.us${window.location.pathname}`,
      version: APP_VERSION.replace(/^v/, ''),
    }),
  }).catch(() => {
    /* the screen already says what to do */
  })
}

interface State {
  error: unknown
  newVersion: boolean
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, newVersion: false }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error ?? new Error('Unknown error'), newVersion: isNewVersionError(error) }
  }

  componentDidMount() {
    window.addEventListener('vite:preloadError', this.onPreloadError)
  }

  componentWillUnmount() {
    window.removeEventListener('vite:preloadError', this.onPreloadError)
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (!isNewVersionError(error)) report(error, info)
  }

  private onPreloadError = (event: Event) => {
    event.preventDefault()
    this.setState({ error: (event as Event & { payload?: unknown }).payload ?? event, newVersion: true })
  }

  render() {
    if (!this.state.error) return this.props.children
    const { newVersion } = this.state
    return (
      <main
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: '0 24px',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 26 }}>{newVersion ? 'This page was updated' : 'Something went wrong'}</h1>
        <p style={{ margin: 0, maxWidth: 420, color: 'var(--slate)' }}>
          {newVersion ? 'We updated the site while you had it open. Reload to see the latest.' : 'Reload the page to keep going.'}
        </p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    )
  }
}
