/**
 * Thrift+ price scanner (customer web app). Route: /scan.
 *
 * Sign in, then the trip scanner (TripScanner.tsx, owner 2026-10-13): This trip on top, the camera or the scanned tag
 * or the trip's lines in the middle, every action on the bottom buttons. While Thrift+ is off, customers see Coming
 * soon and staff sign in to test it (a yellow test bar). /scan?type=1 tests without a camera (test tags to pick).
 * Email sign-in (owner 2026-10-15, APP D9): the email's link opens /scan?signin=<token>; a join lands on the Member QR,
 * a sign-in on the scanner. ecothrift.us/join opens /scan?view=join: Join, or the Member QR when already signed in.
 * Data: ../../../api/thriftPlusScanner.api.ts (the real API).
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, ButtonBase, CircularProgress } from '@mui/material';
import { isOpen, setPreviewCode, type SignInPurpose } from '../../../api/thriftPlusScanner.api';
import { ResetPasswordScreen } from './AccountScreens';
import { SignInScreen } from './SignInScreen';
import { TripScanner } from './TripScanner';
import { UNIT_CSS, sc, useScannerFonts } from './scannerTheme';
import { installScannerHead } from './installApp';
import { TurnUprightScreen } from './Sideways';
import { useSideways, useStandaloneLock, useUprightLock } from './screenLock';
import { loadDetector } from './useQrCamera';
import { useSignIn, useThriftPlusSession } from './useThriftPlus';

const TYPE_ONLY_KEY = 'tp-type-only';

export default function ThriftPlusScannerPage() {
  // A phone held sideways gets its own screens; "Lock upright" where the browser can (owner 2026-10-15, APP D16 v2).
  const sideways = useSideways();
  const lock = useUprightLock();
  useStandaloneLock();
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
  // The email's link (owner 2026-10-15, APP D9): /scan?signin=<token> signs this browser in, once. The token comes off
  // the address either way; a join opens the Member QR (view=qr), a sign-in the scanner. A used or expired link shows
  // its words on the sign-in screen (unless this phone is signed in already).
  const signinToken = pageParams.get('signin');
  const joinAsked = pageParams.get('view') === 'join';
  const auth = useSignIn();
  const [linkError, setLinkError] = useState('');
  const linkTried = useRef<string | null>(null);
  useEffect(() => {
    if (!signinToken || linkTried.current === signinToken) return;
    linkTried.current = signinToken;
    void (async () => {
      let purpose: SignInPurpose | null = null;
      try {
        purpose = (await auth.link.mutateAsync(signinToken)).purpose;
        setLinkError('');
      } catch (e) {
        setLinkError(e instanceof Error && e.message ? e.message : "That link didn't work. Send a new one.");
      }
      setPageParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('signin');
        if (purpose === 'join') next.set('view', 'qr');
        return next;
      }, { replace: true });
    })();
  }, [signinToken]); // eslint-disable-line react-hooks/exhaustive-deps
  // Held while the link signs in, so an answer from before it can't sign the phone back out.
  const session = useThriftPlusSession(!signinToken);
  // ecothrift.us/join: the Join screen when signed out or scanning without signing in; signed in, TripScanner opens
  // the Member QR instead.
  const joinShown = joinAsked && session.data?.status === 'guest';

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

  const tripShown = open.data !== false && !resetToken && !signinToken && !!session.data && session.data.status !== 'signed_out' && !joinShown;

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bgcolor: '#e6e7e1',
        display: 'flex',
        justifyContent: 'center',
        overflow: 'hidden',
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
              <SignInScreen start="staff" />
            </Box>
          ) : (
            <ComingSoon onStaff={() => setStaffSignIn(true)} />
          )
        ) : resetToken ? (
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <ResetPasswordScreen token={resetToken} onDone={() => setPageParams({}, { replace: true })} />
          </Box>
        ) : signinToken || !session.data ? (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <CircularProgress sx={{ color: sc.green }} />
          </Box>
        ) : session.data.status === 'signed_out' || joinShown ? (
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <SignInScreen start={joinAsked ? 'join' : 'email'} notice={linkError} />
          </Box>
        ) : (
          <TripScanner session={session.data} />
        )}
      </Box>
      {/* The trip scanner has its own sideways screens (the camera keeps scanning); every other screen asks to turn upright. */}
      {sideways && !tripShown && <TurnUprightScreen lock={lock} />}
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
