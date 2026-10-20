/**
 * "Scan the store's sign-in QR" (owner 2026-10-20): a cashier shows a one-use sign-in QR on the Thrift+ Staff app, and
 * the member scans it with this app's own camera. On an iPhone the Camera app would open Safari, not the installed app,
 * so the app reads it itself. The QR holds ecothrift.us/scan?signin=<token>; `onToken` gets the token.
 */
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { Box, ButtonBase, CircularProgress } from '@mui/material';
import { useState } from 'react';
import { SmallLink } from './signInParts';
import { sc, u } from './scannerTheme';
import { useQrCamera } from './useQrCamera';

/** The sign-in token in a scanned QR, or '' when it is some other code. */
export function signInTokenOf(raw: string): string {
  try {
    const url = new URL(raw.trim());
    if (!/(^|\.)ecothrift\.us$/.test(url.hostname) && url.hostname !== window.location.hostname) return '';
    return url.searchParams.get('signin') ?? '';
  } catch {
    return '';
  }
}

export function StoreQrScan({ onToken, onClose }: { onToken: (token: string) => void; onClose: () => void }) {
  const [note, setNote] = useState('');
  const { videoRef, status, restart } = useQrCamera({
    enabled: true,
    paused: false,
    onDecode: (raw) => {
      const token = signInTokenOf(raw);
      if (token) onToken(token);
      else setNote("That's not the store's sign-in QR. Ask the cashier to show it again.");
    },
  });
  return (
    <Box data-testid="store-qr-scan">
      <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(46), color: sc.titleGreen }}>Scan the store&apos;s sign-in QR</Box>
      <Box sx={{ fontSize: u(28), color: sc.ink2, mt: u(8), mb: u(20), lineHeight: 1.4 }}>
        A cashier shows it on their phone. Point your camera at it.
      </Box>
      <Box sx={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', bgcolor: '#000', borderRadius: u(24), overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <Box aria-hidden sx={{ position: 'absolute', inset: '18%', border: '3px solid rgba(255,255,255,0.85)', borderRadius: u(18) }} />
        {status === 'starting' ? (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <CircularProgress sx={{ color: '#fff' }} />
          </Box>
        ) : null}
        {status === 'stalled' || status === 'resting' ? (
          <ButtonBase onClick={restart} sx={{ position: 'absolute', inset: 0, color: '#fff', flexDirection: 'column', gap: 1, fontWeight: 700 }}>
            <RefreshRounded sx={{ fontSize: 48 }} />
            Tap to start the camera
          </ButtonBase>
        ) : null}
      </Box>
      {status === 'blocked' || status === 'unsupported' ? (
        <Box sx={{ mt: u(16), fontSize: u(28), color: sc.badText }}>
          The camera didn&apos;t start. Ask the cashier, or sign in with your mobile number.
        </Box>
      ) : null}
      {note ? <Box role="alert" sx={{ mt: u(16), fontSize: u(28), color: sc.badText }}>{note}</Box> : null}
      <Box sx={{ textAlign: 'center', mt: u(20) }}>
        <SmallLink label="Back to sign in" onClick={onClose} />
      </Box>
    </Box>
  );
}
