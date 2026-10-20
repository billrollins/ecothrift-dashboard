import { useEffect, useRef, useState } from 'react'

/**
 * "Continue with Google" on the website sign-in (Phase 3, owner 2026-10-20), the same Google Identity Services button the
 * Thrift+ app shows. Google hands back an ID token, which the server checks (`/api/thriftplus/public/google/`). Hidden
 * when Google's script can't load (offline, blocked), so nothing on screen is dead.
 */

const GSI_URL = 'https://accounts.google.com/gsi/client'

type GsiId = {
  initialize: (options: {
    client_id: string
    callback: (response: { credential?: string }) => void
    context?: 'signin' | 'signup'
    ux_mode?: 'popup'
    auto_select?: boolean
    itp_support?: boolean
  }) => void
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiId } }
  }
}

let loading: Promise<GsiId> | null = null

function loadGsi(): Promise<GsiId> {
  const ready = window.google?.accounts?.id
  if (ready) return Promise.resolve(ready)
  if (!loading) {
    loading = new Promise<GsiId>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = GSI_URL
      script.async = true
      script.onload = () => {
        const id = window.google?.accounts?.id
        if (id) resolve(id)
        else reject(new Error('gsi'))
      }
      script.onerror = () => reject(new Error('gsi'))
      document.head.appendChild(script)
    }).catch((e: unknown) => {
      loading = null // try again next time the page opens
      throw e
    })
  }
  return loading
}

export default function GoogleSignInButton({
  clientId,
  onCredential,
}: {
  clientId: string
  onCredential: (credential: string) => void
}) {
  const slot = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<'loading' | 'shown' | 'failed'>('loading')
  const latest = useRef(onCredential)
  latest.current = onCredential

  useEffect(() => {
    let live = true
    loadGsi()
      .then((id) => {
        const el = slot.current
        if (!live || !el) return
        id.initialize({
          client_id: clientId,
          callback: (r) => {
            if (r.credential) latest.current(r.credential)
          },
          context: 'signin',
          ux_mode: 'popup',
          auto_select: false,
          itp_support: true,
        })
        const width = Math.max(200, Math.min(400, Math.round(el.clientWidth || 320)))
        id.renderButton(el, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'center',
          width,
        })
        setState('shown')
      })
      .catch(() => live && setState('failed'))
    return () => {
      live = false
    }
  }, [clientId])

  if (state === 'failed') return null
  return (
    <div data-testid="google-sign-in" style={{ maxWidth: 420 }}>
      <div style={{ position: 'relative', minHeight: 44 }}>
        <div ref={slot} style={{ display: 'flex', justifyContent: 'center', width: '100%', minHeight: 44 }} />
        {state === 'loading' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 99,
              border: '1px solid #d6d9d0',
              background: '#fff',
              fontSize: 15,
            }}
          >
            Continue with Google
          </div>
        )}
      </div>
    </div>
  )
}
