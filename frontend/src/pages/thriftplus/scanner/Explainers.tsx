/**
 * "Camera not working?" help with iPhone and Android steps, in a popup that zooms out of whatever was
 * tapped. (The older topic popups and the first-run walkthrough were retired with the 10-12 policy; the
 * trip scanner explains Thrift+ in its own sheets.)
 */
import { useState, type ReactNode } from 'react';
import { Box, ButtonBase } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import NoPhotographyRounded from '@mui/icons-material/NoPhotographyRounded';
import type { ThriftPlusCart, ThriftPlusMember } from '../../../api/thriftPlusMock';
import { sc, u } from './scannerTheme';

export type Topic = 'camera';

/** Where the popup grows from, in page coordinates relative to the scanner shell. */
export interface Origin {
  x: number;
  y: number;
}

/** A zoom-from-the-tap popup over a dimmed page. */
function Popup({
  origin,
  label,
  onClose,
  children,
}: {
  origin: Origin | null;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Box role="dialog" aria-modal="true" aria-label={label} sx={{ position: 'absolute', inset: 0, zIndex: 40 }}>
      <Box
        onClick={onClose}
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: 'rgba(20,26,20,0.45)',
          animation: 'tpDim 180ms ease both',
          '@keyframes tpDim': { from: { opacity: 0 } },
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          px: u(40),
          pointerEvents: 'none',
          transformOrigin: origin ? `${origin.x}px ${origin.y}px` : '50% 60%',
          animation: 'tpZoom 320ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both',
          '@keyframes tpZoom': {
            from: { transform: 'scale(0.15)', opacity: 0 },
            '60%': { opacity: 1 },
            to: { transform: 'scale(1)', opacity: 1 },
          },
        }}
      >
        <Box
          sx={{
            pointerEvents: 'auto',
            position: 'relative',
            width: '100%',
            maxHeight: '88%',
            overflowY: 'auto',
            bgcolor: sc.card,
            borderRadius: u(44),
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            p: u(44),
            pt: u(36),
            fontFamily: sc.font,
          }}
        >
          <ButtonBase onClick={onClose} aria-label="Close" sx={{ position: 'absolute', top: u(18), right: u(18), borderRadius: 99, p: u(12), color: sc.ink3 }}>
            <CloseRounded sx={{ fontSize: u(50) }} />
          </ButtonBase>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <Box component="h2" sx={{ m: 0, mt: u(10), fontFamily: sc.condensed, fontWeight: 700, fontSize: u(56), lineHeight: 1.1, color: sc.titleGreen, textAlign: 'center' }}>
      {children}
    </Box>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <Box sx={{ fontSize: u(31), color: sc.ink2, lineHeight: 1.45, mt: u(14), textAlign: 'center' }}>{children}</Box>;
}

function Primary({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        mt: u(34),
        width: '100%',
        minHeight: u(100),
        borderRadius: 99,
        background: `linear-gradient(180deg, #62c64a, ${sc.green})`,
        boxShadow: '0 4px 12px rgba(63,159,53,0.35), inset 0 2px 0 rgba(255,255,255,0.35)',
        color: '#fff',
        fontSize: u(34),
        fontWeight: 700,
      }}
    >
      {label}
    </ButtonBase>
  );
}

const stage = { position: 'relative', height: u(300), mx: 'auto', width: '100%', overflow: 'hidden' } as const;

function CameraArt() {
  return (
    <Box sx={{ ...stage, height: u(200) }} aria-hidden>
      <NoPhotographyRounded
        sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          fontSize: u(140),
          color: sc.ink2,
          transform: 'translate(-50%, -50%)',
          animation: 'tpWobble 2s ease-in-out infinite',
          '@keyframes tpWobble': {
            '0%, 100%': { transform: 'translate(-50%, -50%) rotate(0deg)' },
            '25%': { transform: 'translate(-50%, -50%) rotate(-6deg)' },
            '75%': { transform: 'translate(-50%, -50%) rotate(6deg)' },
          },
        }}
      />
    </Box>
  );
}

/* ---------------------------------------------------------- camera help */

type Platform = 'iphone' | 'android';

function guessPlatform(): Platform {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /android/i.test(ua) ? 'android' : 'iphone';
}

const STEPS: Record<Platform, { main: string[]; more: string[] }> = {
  iphone: {
    main: [
      'In Safari, tap the aA button at the left of the address bar.',
      'Tap Website Settings, then set Camera to Allow.',
      'Come back here and tap Try the camera again.',
    ],
    more: [
      'Still blocked? Open the Settings app > Safari > Camera, and choose Allow or Ask.',
      'Using Chrome on iPhone? Open the Settings app > Chrome, and turn on Camera.',
    ],
  },
  android: {
    main: [
      'In Chrome, tap the icon just left of the web address (two sliders or a lock).',
      'Tap Permissions, then turn Camera on (or Allow).',
      'Come back here and tap Try the camera again.',
    ],
    more: [
      'Samsung Internet: tap the menu > Settings > Sites and downloads > Site permissions > Camera.',
      'Still blocked? Open the Settings app > Apps > Chrome > Permissions > Camera > Allow.',
    ],
  },
};

function CameraHelp({ onRetry }: { onRetry: () => void }) {
  const [platform, setPlatform] = useState<Platform>(guessPlatform);
  const steps = STEPS[platform];
  return (
    <Box>
      <CameraArt />
      <Title>Camera not working?</Title>
      <Body>The scanner needs your permission to use the camera. Here's how to turn it on.</Body>
      <Box role="tablist" aria-label="Your phone" sx={{ display: 'flex', gap: u(10), mt: u(26), p: u(8), bgcolor: '#f0f1ed', borderRadius: 99 }}>
        {(['iphone', 'android'] as const).map((p) => (
          <ButtonBase
            key={p}
            role="tab"
            aria-selected={platform === p}
            onClick={() => setPlatform(p)}
            sx={{
              flex: 1,
              py: u(14),
              borderRadius: 99,
              fontSize: u(30),
              fontWeight: 700,
              bgcolor: platform === p ? '#fff' : 'transparent',
              color: platform === p ? sc.priceGreen : sc.ink2,
              boxShadow: platform === p ? '0 2px 6px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {p === 'iphone' ? 'iPhone' : 'Android'}
          </ButtonBase>
        ))}
      </Box>
      <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, mt: u(26) }}>
        {steps.main.map((s, k) => (
          <Box component="li" key={s} sx={{ display: 'flex', gap: u(20), alignItems: 'flex-start', mb: u(18) }}>
            <Box
              sx={{
                flexShrink: 0,
                width: u(52),
                height: u(52),
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                bgcolor: sc.green,
                color: '#fff',
                fontWeight: 700,
                fontSize: u(28),
              }}
            >
              {k + 1}
            </Box>
            <Box sx={{ fontSize: u(30), color: sc.ink, lineHeight: 1.4, pt: u(4) }}>{s}</Box>
          </Box>
        ))}
      </Box>
      {steps.more.map((s) => (
        <Box key={s} sx={{ fontSize: u(26), color: sc.ink2, lineHeight: 1.4, mt: u(10) }}>
          {s}
        </Box>
      ))}
      <Box sx={{ fontSize: u(26), color: sc.ink3, lineHeight: 1.4, mt: u(16) }}>
        Also close other apps that use the camera. You can always type the tag number instead.
      </Box>
      <Primary label="Try the camera again" onClick={onRetry} />
    </Box>
  );
}

/* ------------------------------------------------------------ the popup */

export function InfoPopup({
  topic,
  origin,
  onClose,
  onRetryCamera,
}: {
  topic: Topic;
  origin: Origin | null;
  /** Not used by the camera help; accepted so older callers still fit. */
  member?: ThriftPlusMember | null;
  cart?: ThriftPlusCart;
  onClose: () => void;
  onRetryCamera: () => void;
}) {
  return (
    <Popup origin={origin} label={topic === 'camera' ? 'Camera not working?' : ''} onClose={onClose}>
      <CameraHelp
        onRetry={() => {
          onClose();
          onRetryCamera();
        }}
      />
    </Popup>
  );
}
