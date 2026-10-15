/**
 * Thrift+ price scanner (customer web app). Route: /scan.
 *
 * Sign in, then the trip scanner (TripScanner.tsx, owner 2026-10-13): This trip on top, the camera or the scanned tag
 * or the trip's lines in the middle, every action on the bottom buttons. While Thrift+ is off, customers see Coming
 * soon and staff sign in to test it (a yellow test bar). /scan?type=1 tests without a camera (test tags to pick).
 * Data: ../../../api/thriftPlusScanner.api.ts (the real API).
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, ButtonBase, CircularProgress } from '@mui/material';
import { isOpen, setPreviewCode } from '../../../api/thriftPlusScanner.api';
import { ResetPasswordScreen } from './AccountScreens';
import { SignInScreen } from './SignInScreen';
import { TripScanner } from './TripScanner';
import { UNIT_CSS, sc, useScannerFonts } from './scannerTheme';
import { installScannerHead } from './installApp';
import { loadDetector } from './useQrCamera';
import { useThriftPlusSession } from './useThriftPlus';

const TYPE_ONLY_KEY = 'tp-type-only';

export default function ThriftPlusScannerPage() {
  useScannerFonts();
  const [pageParams, setPageParams] = useSearchParams();
  const resetToken = pageParams.get('reset');
  // A staff phone before launch: /scan?preview=<code> (owner, 2026-10-07). Kept on the phone, then off the address.
  const preview = pageParams.get('preview');
  if (preview) setPreviewCode(preview);
  useEffect(() => {
    if (!preview) return;
    const next = new URLSearchParams(pageParams);
    next.delete('preview');
    setPageParams(next, { replace: true });
  }, [preview]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = useQuery({ queryKey: ['thriftPlus', 'open'], queryFn: isOpen, staleTime: 60_000 });
  const [staffSignIn, setStaffSignIn] = useState(false);
  // Testing without a camera (owner, 2026-10-10): /scan?type=1 skips the camera for this browser tab; ?type=0 turns it back on.
  const typeParam = pageParams.get('type');
  if (typeParam !== null) {
    try {
      if (typeParam === '0') sessionStorage.removeItem(TYPE_ONLY_KEY);
      else sessionStorage.setItem(TYPE_ONLY_KEY, '1');
    } catch {
      /* private mode: the flag lasts for this page only */
    }
  }
  const session = useThriftPlusSession();

  useEffect(() => {
    const prev = document.title;
    document.title = 'Thrift+ price scanner';
    // Warm the decoder while they sign in, so the first scan is instant.
    loadDetector().catch(() => undefined);
    // The home-screen app (owner 2026-10-14, APP D5): the manifest and the iPhone tags, only on the scanner.
    const removeHead = installScannerHead();
    return () => {
      document.title = prev;
      removeHead();
    };
  }, []);

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bgcolor: '#e6e7e1',
        display: 'flex',
        justifyContent: 'center',
        '--u': UNIT_CSS,
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          height: '100dvh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: sc.ink,
          fontFamily: sc.font,
          background: `radial-gradient(ellipse at 50% 45%, ${sc.pageLight} 0%, ${sc.page} 75%)`,
          '& button, & input': { fontFamily: 'inherit' },
        }}
      >
        {open.data === false ? (
          staffSignIn ? (
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              <SignInScreen />
            </Box>
          ) : (
            <ComingSoon onStaff={() => setStaffSignIn(true)} />
          )
        ) : resetToken ? (
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <ResetPasswordScreen token={resetToken} onDone={() => setPageParams({}, { replace: true })} />
          </Box>
        ) : !session.data ? (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <CircularProgress sx={{ color: sc.green }} />
          </Box>
        ) : session.data.status === 'signed_out' ? (
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <SignInScreen />
          </Box>
        ) : (
          <TripScanner session={session.data} />
        )}
      </Box>
    </Box>
  );
}

/** Thrift+ is off: what a customer sees at /scan until launch. Staff can sign in to test it (2026-10-10). */
function ComingSoon({ onStaff }: { onStaff: () => void }) {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 4, textAlign: 'center' }}>
      <Box>
        <Box sx={{ fontSize: 34, fontWeight: 900, color: sc.green, mb: 1 }}>Thrift+</Box>
        <Box sx={{ fontSize: 20, fontWeight: 800, mb: 1 }}>Coming soon</Box>
        <Box sx={{ fontSize: 16, color: sc.ink, opacity: 0.75 }}>Ask at the register.</Box>
        <ButtonBase onClick={onStaff} sx={{ mt: 4, fontSize: 14, color: sc.ink2, textDecoration: 'underline', borderRadius: 1 }}>
          Staff sign in
        </ButtonBase>
      </Box>
    </Box>
  );
}
