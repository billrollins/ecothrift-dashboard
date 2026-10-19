/**
 * "Continue with Google" (Join v2, owner 2026-10-19): Google's own button (Google Identity Services), full width, then
 * the quiet "or". Google hands back an ID token, which the server checks (`google/`). Shown only when the server has a
 * Google client id; hidden as well when Google's script can't load (offline, blocked), so nothing on screen is dead.
 */
import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { OrLine } from './signInParts';
import { sc, u } from './scannerTheme';

const GSI_URL = 'https://accounts.google.com/gsi/client';

interface GsiButtonOptions {
  type: 'standard';
  theme: 'outline';
  size: 'large';
  text: 'continue_with';
  shape: 'pill';
  logo_alignment: 'center';
  width: number;
}

interface GsiId {
  initialize: (options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    context?: 'signin' | 'signup';
    ux_mode?: 'popup';
    auto_select?: boolean;
    itp_support?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: GsiButtonOptions) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiId } };
  }
}

let loading: Promise<GsiId> | null = null;

/** Google's script, loaded once for the page. */
function loadGsi(): Promise<GsiId> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  if (!loading) {
    loading = new Promise<GsiId>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GSI_URL;
      script.async = true;
      script.onload = () => {
        const id = window.google?.accounts?.id;
        if (id) resolve(id);
        else reject(new Error('gsi'));
      };
      script.onerror = () => reject(new Error('gsi'));
      document.head.appendChild(script);
    }).catch((e: unknown) => {
      loading = null; // try again next time the screen opens
      throw e;
    });
  }
  return loading;
}

export function GoogleButton({ clientId, joining, onCredential }: {
  clientId: string;
  /** Join or sign in: Google words its own popup to match. */
  joining: boolean;
  onCredential: (credential: string) => void;
}) {
  const slot = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'loading' | 'shown' | 'failed'>('loading');
  const latest = useRef(onCredential);
  latest.current = onCredential;

  useEffect(() => {
    let live = true;
    loadGsi()
      .then((id) => {
        const el = slot.current;
        if (!live || !el) return;
        id.initialize({
          client_id: clientId,
          callback: (r) => {
            if (r.credential) latest.current(r.credential);
          },
          context: joining ? 'signup' : 'signin',
          ux_mode: 'popup',
          auto_select: false,
          itp_support: true,
        });
        // Google draws 200 to 400 px wide.
        const width = Math.max(200, Math.min(400, Math.round(el.clientWidth || 320)));
        id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'center', width });
        setState('shown');
      })
      .catch(() => live && setState('failed'));
    return () => {
      live = false;
    };
  }, [clientId, joining]);

  if (state === 'failed') return null;
  return (
    <Box data-testid="google-sign-in">
      <Box sx={{ position: 'relative', minHeight: 44 }}>
        <Box ref={slot} sx={{ display: 'flex', justifyContent: 'center', width: '100%', minHeight: 44 }} />
        {/* Until Google's button is drawn: the same pill, so the screen doesn't jump. */}
        {state === 'loading' && (
          <Box
            sx={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', borderRadius: 99, border: `1px solid ${sc.line}`,
              bgcolor: sc.card, fontSize: u(30), fontWeight: 500, color: sc.ink,
            }}
          >
            Continue with Google
          </Box>
        )}
      </Box>
      <OrLine />
    </Box>
  );
}
