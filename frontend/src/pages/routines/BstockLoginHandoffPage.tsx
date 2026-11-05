import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { postBstockLogin } from '../../api/buying.api';
import { canAccess } from '../../auth/access';
import { useAuth } from '../../hooks/useAuth';
import {
  announceBstockLogin,
  bstockReturnPath,
  bstockRunnerOpenElsewhere,
  clearPendingBstockToken,
  minutesLeft,
  peekPendingBstockToken,
} from './runners/bstockHandoff';

type Phase =
  | { kind: 'confirm' }
  | { kind: 'sending' }
  | { kind: 'sent'; minutes: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'failed'; message: string };

function expiryLabel(token: string): string | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = Number(JSON.parse(atob(payload)).exp);
    if (!Number.isFinite(exp)) return null;
    return new Date(exp * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return null;
  }
}

/**
 * Where the Send-to-Eco-Thrift bookmarklet lands, in a new tab. The token was
 * moved out of the address bar into sessionStorage before the app rendered.
 *
 * One tap (Dash #76): when the owner is signed in here, the login is sent by
 * itself, then this tab closes (or shows the page he came from). Cost, stated:
 * any page that opens this link with a B-Stock login could swap in that login;
 * it only changes whose B-Stock account pulls manifests into our Dash and reads
 * nothing of ours. The server still takes only a clean, unexpired B-Stock JWT.
 * The tab the owner started from hears about it and refreshes.
 */
export default function BstockLoginHandoffPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [token] = useState(() => peekPendingBstockToken());
  const [phase, setPhase] = useState<Phase>({ kind: 'confirm' });
  const [closeFailed, setCloseFailed] = useState(false);
  const expires = useMemo(() => (token ? expiryLabel(token) : null), [token]);
  const isOwner = canAccess(user, ['buying.purchase', 'buying:full']);
  // Sent once by itself; StrictMode's second effect run keeps this ref.
  const autoSent = useRef(false);

  useEffect(() => {
    // Someone else's session: the owner's login must not linger in this tab.
    if (token && user && !isOwner) clearPendingBstockToken();
  }, [token, user, isOwner]);

  // The routine is usually still open in the tab the owner came from: go back to it rather
  // than open a second copy here. Browsers only close tabs a script opened; if this one
  // stays open, show the routine in it instead.
  function openHere() {
    navigate(bstockReturnPath(), { replace: true });
  }

  function closeTab() {
    window.close();
    // Still here: the browser would not close a tab it did not open by script.
    window.setTimeout(() => setCloseFailed(true), 400);
  }

  function back() {
    if (bstockRunnerOpenElsewhere()) closeTab();
    else openHere();
  }

  async function send(auto = false) {
    if (!token) return;
    setPhase({ kind: 'sending' });
    try {
      const status = await postBstockLogin(token);
      clearPendingBstockToken();
      announceBstockLogin();
      setPhase({ kind: 'sent', minutes: minutesLeft(status.seconds_left) });
      // Sent by itself: go back without a second tap, after a moment to read it.
      if (auto) window.setTimeout(back, 900);
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } };
      if (e.response?.status === 400) {
        clearPendingBstockToken();
        setPhase({ kind: 'rejected', message: e.response.data?.detail || 'The app did not accept that login.' });
      } else {
        // Network trouble or a server hiccup: keep the token so Retry sends the same one.
        setPhase({ kind: 'failed', message: 'Could not reach the app. Check the connection and try again.' });
      }
    }
  }

  useEffect(() => {
    if (!token || !user || !isOwner || autoSent.current) return;
    autoSent.current = true;
    void send(true);
    // send reads the latest state; it must run once per page, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, isOwner]);

  function cancel() {
    clearPendingBstockToken();
    back();
  }

  let body;
  if (closeFailed) {
    body = (
      <>
        <Alert severity="info">
          This tab could not close itself. Switch back to the routine tab, or open the routine here.
        </Alert>
        <Button variant="contained" onClick={openHere}>Open the routine here</Button>
      </>
    );
  } else if (!token && phase.kind !== 'sent') {
    body = (
      <>
        <Alert severity="info">Nothing to send. Open B-Stock, then tap the Send to Eco-Thrift bookmark.</Alert>
        <Button variant="contained" onClick={back}>Back to the routine</Button>
      </>
    );
  } else if (!isOwner) {
    body = (
      <>
        <Alert severity="warning">
          Only the owner&apos;s account can send the B-Stock login. Sign in as the owner, then tap the bookmark again.
        </Alert>
        <Button variant="contained" onClick={() => navigate('/dashboard', { replace: true })}>OK</Button>
      </>
    );
  } else if (phase.kind === 'confirm' || phase.kind === 'sending') {
    body = (
      <>
        <Typography variant="h6">
          {phase.kind === 'sending' ? 'Sending your B-Stock login…' : 'Send this B-Stock login?'}
        </Typography>
        <Typography color="text.secondary">
          The app uses it to pull manifests for you{expires ? ` until about ${expires}` : ''}. Only send one you just
          took from B-Stock yourself.
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="center">
          <Button variant="outlined" onClick={cancel} disabled={phase.kind === 'sending'}>Cancel</Button>
          <Button variant="contained" onClick={() => void send()} disabled={phase.kind === 'sending'}>
            {phase.kind === 'sending' ? <CircularProgress size={18} color="inherit" /> : 'Send'}
          </Button>
        </Stack>
      </>
    );
  } else if (phase.kind === 'sent') {
    body = (
      <>
        <Alert severity="success" role="status">B-Stock connected · {phase.minutes}.</Alert>
        <Typography color="text.secondary">
          Close this tab and go back to the routine. It already knows.
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="center">
          <Button variant="contained" onClick={closeTab}>Close this tab</Button>
          <Button variant="outlined" onClick={openHere}>Open the routine here</Button>
        </Stack>
      </>
    );
  } else if (phase.kind === 'rejected') {
    body = (
      <>
        <Alert severity="error">{phase.message}</Alert>
        <Button variant="contained" onClick={back}>Back to the routine</Button>
      </>
    );
  } else {
    body = (
      <>
        <Alert severity="error">{phase.message}</Alert>
        <Stack direction="row" spacing={1} justifyContent="center">
          <Button variant="outlined" onClick={cancel}>Cancel</Button>
          <Button variant="contained" onClick={() => void send()}>Retry</Button>
        </Stack>
      </>
    );
  }

  return (
    <Box sx={{ maxWidth: 440, mx: 'auto', mt: 6, px: 2, textAlign: 'center' }}>
      <Stack spacing={2}>{body}</Stack>
    </Box>
  );
}
