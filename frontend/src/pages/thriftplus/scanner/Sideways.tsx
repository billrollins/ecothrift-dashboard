/**
 * The scanner on a phone held sideways (owner 2026-10-15, APP D16 v2), and the "Lock upright" button (screenLock.ts).
 * Sizes are plain pixels here: the app's design unit is sized for an upright phone.
 */
import { Box, ButtonBase } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ScreenLockPortraitRounded from '@mui/icons-material/ScreenLockPortraitRounded';
import ScreenRotationRounded from '@mui/icons-material/ScreenRotationRounded';
import StayCurrentPortraitRounded from '@mui/icons-material/StayCurrentPortraitRounded';
import { sc } from './scannerTheme';

export interface UprightLock {
  locked: boolean;
  toggle: () => void;
}

/**
 * "Lock upright" / "Locked": full screen with the screen locked in portrait, like the phone's rotation lock. Shown only
 * where the browser can do it. `dark` sits on the camera; otherwise it sits on the page.
 */
export function LockUprightButton({ lock, dark = true, size = 'small' }: { lock: UprightLock; dark?: boolean; size?: 'small' | 'large' }) {
  const big = size === 'large';
  const on = lock.locked;
  return (
    <ButtonBase
      onClick={(e) => {
        e.stopPropagation();
        lock.toggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="lock-upright"
      aria-pressed={on}
      aria-label={on ? 'Screen locked upright. Tap to let it turn again' : 'Lock the screen upright'}
      sx={{
        gap: big ? '10px' : '6px',
        px: big ? '22px' : '12px',
        height: big ? 52 : 34,
        borderRadius: 99,
        fontFamily: sc.font,
        fontWeight: 700,
        fontSize: big ? 17 : 13,
        whiteSpace: 'nowrap',
        ...(on
          ? { bgcolor: '#fff', color: sc.titleGreen }
          : dark
            ? { bgcolor: 'rgba(16,21,17,0.55)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(6px)' }
            : { bgcolor: sc.green, color: '#fff', boxShadow: '0 6px 16px rgba(46,122,38,0.32)' }),
      }}
    >
      <ScreenLockPortraitRounded sx={{ fontSize: big ? 24 : 18 }} />
      {on ? 'Locked upright' : 'Lock upright'}
    </ButtonBase>
  );
}

/** Anything but the camera, sideways: one clean screen. Whatever was open is still there when the phone turns back. */
export function TurnUprightScreen({ lock }: { lock: UprightLock | null }) {
  return (
    <Box
      data-testid="turn-upright"
      sx={{ position: 'fixed', inset: 0, zIndex: 80, bgcolor: sc.page, display: 'grid', placeItems: 'center', p: '20px', textAlign: 'center',
        fontFamily: sc.font, color: sc.ink }}
    >
      <Box>
        <StayCurrentPortraitRounded sx={{ fontSize: 56, color: sc.green }} />
        <Box sx={{ mt: '6px', fontFamily: sc.condensed, fontWeight: 700, fontSize: 26, color: sc.titleGreen }}>Turn your phone upright</Box>
        <Box sx={{ mt: '4px', fontSize: 16, color: sc.ink2 }}>The scanner works best held upright.</Box>
        {lock && (
          <Box sx={{ mt: '18px' }}>
            <LockUprightButton lock={lock} dark={false} size="large" />
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** Scanning sideways: the camera fills the screen and keeps reading; this pill sits on top of it. */
export function SidewaysScanPill({ lock }: { lock: UprightLock | null }) {
  return (
    <Box sx={{ position: 'fixed', top: 12, left: 0, right: 0, zIndex: 80, display: 'flex', justifyContent: 'center', gap: '8px',
      pointerEvents: 'none', fontFamily: sc.font }}>
      <Box data-testid="sideways-pill" sx={{ display: 'inline-flex', alignItems: 'center', gap: '8px', px: '16px', py: '8px', borderRadius: 99,
        bgcolor: 'rgba(16,21,17,0.72)', color: '#fff', fontSize: 15, fontWeight: 600 }}>
        <ScreenRotationRounded sx={{ fontSize: 18 }} />
        Turn your phone upright for the full app
      </Box>
      {lock && (
        <Box sx={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center' }}>
          <LockUprightButton lock={lock} />
        </Box>
      )}
    </Box>
  );
}

/** A code read while sideways: the app handles it as usual underneath; this asks to turn the phone to see it. */
export function SidewaysGotIt() {
  return (
    <Box data-testid="sideways-got-it"
      sx={{ position: 'fixed', inset: 0, zIndex: 80, bgcolor: 'rgba(16,21,17,0.86)', display: 'grid', placeItems: 'center', p: '20px',
        fontFamily: sc.font }}>
      <Box sx={{ width: 300, maxWidth: '100%', bgcolor: '#fff', borderRadius: '24px', p: '20px', textAlign: 'center', boxShadow: sc.cardShadow }}>
        <CheckCircleRounded sx={{ fontSize: 44, color: sc.green }} />
        <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: 24, color: sc.titleGreen }}>Got it!</Box>
        <Box sx={{ mt: '2px', fontSize: 16, color: sc.ink2 }}>Turn your phone upright to see it.</Box>
      </Box>
    </Box>
  );
}
