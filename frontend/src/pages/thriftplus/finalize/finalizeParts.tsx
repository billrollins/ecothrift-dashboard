import { Box, Button, Dialog, Stack, Typography } from '@mui/material';
import { useEffect, useRef } from 'react';
import QrSvg from '../../../components/thriftplus/QrSvg';
// The terms the customer signs under, word for word from the public site's copy (one source, J5).
import { THRIFT_PLUS_TERMS_EN as TERMS } from '../../../../../frontend-public/src/data/thriftPlusTerms.en';

/** ecothrift.us/join: the customer starts on their own phone (J8), then a cashier finishes them here. */
export const JOIN_URL = 'https://ecothrift.us/join';
export const JOIN_SHOWN = 'ecothrift.us/join';

/**
 * The phone stays on this page while a customer holds it (owner 2026-10-16, J13): the phone's Back (a button or a
 * swipe) closes a popup or does nothing, a pull-down never reloads, a long press opens no menu, and a reload or a closed
 * tab asks first while someone is part way through.
 */
export function useStayOnPage({ onBack, midway }: { onBack: () => void; midway: boolean }) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const midwayRef = useRef(midway);
  midwayRef.current = midway;

  useEffect(() => {
    // A copy of this entry on top: Back lands on it, and it is put back at once.
    window.history.pushState(window.history.state, '');
    const onPop = () => {
      window.history.pushState(window.history.state, '');
      onBackRef.current();
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!midwayRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('beforeunload', onLeave);
    const html = document.documentElement.style;
    const body = document.body.style;
    const before = [html.overscrollBehavior, body.overscrollBehavior];
    html.overscrollBehavior = 'none';
    body.overscrollBehavior = 'none';
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('beforeunload', onLeave);
      [html.overscrollBehavior, body.overscrollBehavior] = before;
    };
  }, []);
}

const done = { minHeight: 64, fontSize: '1.2rem', fontWeight: 800, borderRadius: 2 } as const;

/** The Join QR, full screen, to show a customer (owner 2026-10-16): they scan it, join on their phone, and come back. */
export function JoinQrDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} fullScreen slotProps={{ paper: { sx: { bgcolor: '#fff' } } }}>
      <Stack
        data-testid="finalize-join-sheet"
        alignItems="center"
        justifyContent="center"
        spacing={2}
        sx={{ flex: 1, px: 2, py: 'calc(env(safe-area-inset-top, 0px) + 16px)', textAlign: 'center' }}
      >
        <Typography variant="h4" fontWeight={800}>Join Thrift+</Typography>
        <Typography fontSize="1.15rem" color="text.secondary">Scan this with your phone&apos;s camera.</Typography>
        <QrSvg text={JOIN_URL} label={`QR code for ${JOIN_SHOWN}`} testId="finalize-join-qr" sx={{ width: 'min(78vw, 46vh, 420px)' }} />
        <Typography fontSize="2rem" fontWeight={800} sx={{ letterSpacing: '0.01em' }} data-testid="finalize-join-url">
          {JOIN_SHOWN}
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 420 }}>
          Join with your name and email. Then we finish here: your phone number, a look at your photo ID, a photo and your
          signature.
        </Typography>
      </Stack>
      <Box sx={{ px: 2, pb: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        <Button variant="contained" fullWidth size="large" onClick={onClose} sx={done}>Done</Button>
      </Box>
    </Dialog>
  );
}

/**
 * The Thrift+ terms in a popup over the signature (owner 2026-10-16): the customer reads them on this screen, with no
 * link that leaves the page. The full terms, as on ecothrift.us/terms.
 */
export function TermsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <Box
        sx={{
          px: 2, pt: 'calc(env(safe-area-inset-top, 0px) + 12px)', pb: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0,
        }}
      >
        <Typography variant="h5" fontWeight={800}>Thrift+ terms</Typography>
      </Box>
      <Box data-testid="finalize-terms" sx={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', px: 2, py: 2 }}>
        <Typography variant="h6" fontWeight={800}>{TERMS.needToKnowTitle}</Typography>
        <Box component="ul" sx={{ pl: 2.5, mt: 1, mb: 3 }}>
          {TERMS.needToKnow.map((l) => (
            <Typography component="li" key={l.label} sx={{ mb: 0.75 }}>
              <strong>{l.label}</strong> {l.text}
            </Typography>
          ))}
        </Box>
        <Typography sx={{ mb: 2 }}>
          <strong>{TERMS.fullIntro.label}</strong> {TERMS.fullIntro.text} · {TERMS.fullIntro.version}
        </Typography>
        {TERMS.sections.map((s) => (
          <Box key={s.num} sx={{ mb: 2.5 }}>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 0.75 }}>{`${s.num}. ${s.title}`}</Typography>
            {s.clauses.map((c, i) => (
              <Box key={c.n ?? i} sx={{ mb: 1 }}>
                <Typography>
                  {c.n ? <Box component="span" sx={{ color: 'text.secondary', fontWeight: 700 }}>{`${c.n} `}</Box> : null}
                  {c.label ? <strong>{c.label}</strong> : null}
                  {c.label && c.text ? ' ' : null}
                  {c.text}
                </Typography>
                {c.steps ? (
                  <Box component="ol" sx={{ pl: 3, my: 0.5 }}>
                    {c.steps.map((step) => <Typography component="li" key={step}>{step}</Typography>)}
                  </Box>
                ) : null}
                {c.points ? (
                  <Box component="ul" sx={{ pl: 3, my: 0.5 }}>
                    {c.points.map((p) => (
                      <Typography component="li" key={p.label}><strong>{p.label}</strong> {p.text}</Typography>
                    ))}
                  </Box>
                ) : null}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
      <Box sx={{ px: 2, pt: 1.5, pb: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Button variant="contained" fullWidth size="large" onClick={onClose} sx={done} data-testid="finalize-terms-done">
          Back to signing
        </Button>
      </Box>
    </Dialog>
  );
}
