/**
 * Tap-to-explain popups (bank, cover, cart, scan), the first-run walkthrough
 * (Scan > Bank > Cart > Done) and "Camera not working?" help with iPhone and
 * Android steps. Each popup zooms out of whatever was tapped and plays a small
 * looping illustration. Copy avoids the program's banned words.
 */
import { useState, type ReactNode } from 'react';
import { Box, ButtonBase } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import NoPhotographyRounded from '@mui/icons-material/NoPhotographyRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import { BANK_EXTRA_PCT, type ThriftPlusCart, type ThriftPlusMember } from '../../../api/thriftPlusMock';
import { money, shortDate } from './scannerLogic';
import { art, sc, u } from './scannerTheme';

export type Topic = 'scan' | 'bank' | 'cover' | 'cart' | 'camera';

/** Where the popup grows from, in page coordinates relative to the scanner shell. */
export interface Origin {
  x: number;
  y: number;
}

const INTRO_KEY = 'thriftPlus.introSeen';

export function introSeen(): boolean {
  try {
    return window.localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return true;
  }
}

export function markIntroSeen(): void {
  try {
    window.localStorage.setItem(INTRO_KEY, '1');
  } catch {
    // Blocked storage: the walkthrough shows again next time, which is fine.
  }
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

function Stat({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ mt: u(22), mx: 'auto', width: 'fit-content', px: u(28), py: u(12), borderRadius: 99, bgcolor: sc.greenTint, color: sc.priceGreen, fontWeight: 700, fontSize: u(30) }}>
      {children}
    </Box>
  );
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

/* ------------------------------------------------------------------ art */

const stage = { position: 'relative', height: u(300), mx: 'auto', width: '100%', overflow: 'hidden' } as const;

function ScanArt() {
  return (
    <Box sx={stage} aria-hidden>
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: u(230),
          height: u(230),
          transform: 'translate(-50%, -50%)',
          borderRadius: u(30),
          bgcolor: '#fff',
          boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <QrCode2Rounded sx={{ fontSize: u(170), color: sc.ink }} />
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
          <Box
            key={c}
            sx={{
              position: 'absolute',
              width: u(56),
              height: u(56),
              borderColor: sc.green,
              borderStyle: 'solid',
              borderWidth: 0,
              ...(c[0] === 't' ? { top: u(-18), borderTopWidth: u(8) } : { bottom: u(-18), borderBottomWidth: u(8) }),
              ...(c[1] === 'l' ? { left: u(-18), borderLeftWidth: u(8) } : { right: u(-18), borderRightWidth: u(8) }),
              borderRadius: u(14),
            }}
          />
        ))}
        <Box
          sx={{
            position: 'absolute',
            left: u(-10),
            right: u(-10),
            height: u(6),
            borderRadius: 99,
            bgcolor: sc.greenBright,
            boxShadow: `0 0 ${u(18)} ${sc.greenBright}`,
            animation: 'tpSweep 1.6s ease-in-out infinite alternate',
            '@keyframes tpSweep': { from: { top: '8%' }, to: { top: '90%' } },
          }}
        />
      </Box>
    </Box>
  );
}

function BankArt() {
  return (
    <Box sx={stage} aria-hidden>
      <Box component="img" src={art.coins} alt="" sx={{ position: 'absolute', left: '50%', bottom: u(10), width: u(190), transform: 'translateX(-50%)' }} />
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          component="img"
          src={art.coin}
          alt=""
          sx={{
            position: 'absolute',
            left: `calc(50% - ${u(48)} + ${u((i - 1) * 34)})`,
            top: u(-90),
            width: u(96),
            animation: `tpDrop 2.4s ${i * 0.35}s cubic-bezier(0.4, 0, 0.6, 1) infinite backwards`,
            '@keyframes tpDrop': {
              '0%': { transform: 'translateY(0) rotate(-20deg)', opacity: 0 },
              '12%': { opacity: 1 },
              '45%': { transform: `translateY(${u(170)}) rotate(10deg)`, opacity: 1 },
              '55%': { transform: `translateY(${u(150)}) rotate(0deg)`, opacity: 1 },
              '70%, 100%': { transform: `translateY(${u(175)}) rotate(0deg)`, opacity: 0 },
            },
          }}
        />
      ))}
      <Box
        sx={{
          position: 'absolute',
          right: '14%',
          top: u(40),
          px: u(22),
          py: u(10),
          borderRadius: 99,
          bgcolor: '#fff4cf',
          color: '#8a6200',
          fontWeight: 800,
          fontSize: u(34),
          boxShadow: '0 4px 10px rgba(180,130,10,0.25)',
          animation: 'tpPop 2.4s ease-in-out infinite',
          '@keyframes tpPop': {
            '0%, 40%': { transform: 'scale(0.6)', opacity: 0 },
            '55%': { transform: 'scale(1.15)', opacity: 1 },
            '65%, 90%': { transform: 'scale(1)', opacity: 1 },
            '100%': { transform: 'scale(1)', opacity: 0 },
          },
        }}
      >
        +{BANK_EXTRA_PCT}%
      </Box>
    </Box>
  );
}

function CoverArt({ pct, done }: { pct: number; done: boolean }) {
  return (
    <Box sx={{ ...stage, height: u(240) }} aria-hidden>
      <Box sx={{ position: 'absolute', left: '8%', right: '8%', top: u(90) }}>
        <Box sx={{ position: 'relative', height: u(44), borderRadius: 99, bgcolor: '#e4e5e1', overflow: 'hidden' }}>
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              width: `${Math.max(6, pct)}%`,
              borderRadius: 99,
              background: `linear-gradient(180deg, #6fcf52, ${sc.green})`,
              animation: 'tpFill 1.4s cubic-bezier(0.3, 0.8, 0.3, 1) both',
              '@keyframes tpFill': { from: { width: '0%' } },
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)',
              animation: 'tpShine 2.2s 1.2s ease-in-out infinite',
              '@keyframes tpShine': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(100%)' } },
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: u(14), fontSize: u(26), color: sc.ink3 }}>
          <span>$0</span>
          <span>$10 covers your card</span>
        </Box>
      </Box>
      <CheckCircleRounded
        sx={{
          position: 'absolute',
          right: '6%',
          top: u(22),
          fontSize: u(70),
          color: done ? sc.green : '#cfd2cb',
          animation: 'tpPop2 600ms 1.2s ease-out both',
          '@keyframes tpPop2': { from: { transform: 'scale(0)' }, '70%': { transform: 'scale(1.2)' }, to: { transform: 'scale(1)' } },
        }}
      />
    </Box>
  );
}

function CartArt() {
  return (
    <Box sx={stage} aria-hidden>
      <Box component="img" src={art.cart} alt="" sx={{ position: 'absolute', left: '50%', bottom: u(20), width: u(200), transform: 'translateX(-50%)' }} />
      {[0, 1].map((i) => (
        <Box
          key={i}
          component="img"
          src={art.coin}
          alt=""
          sx={{
            position: 'absolute',
            left: i === 0 ? '12%' : '72%',
            top: u(40),
            width: u(80),
            animation: `${i === 0 ? 'tpHopL' : 'tpHopR'} 2.2s ${i * 0.5}s ease-in-out infinite backwards`,
            '@keyframes tpHopL': {
              '0%': { transform: 'translate(0, 0) scale(1)', opacity: 0 },
              '15%': { opacity: 1 },
              '60%': { transform: `translate(${u(150)}, ${u(90)}) scale(0.7)`, opacity: 1 },
              '75%, 100%': { transform: `translate(${u(170)}, ${u(120)}) scale(0.5)`, opacity: 0 },
            },
            '@keyframes tpHopR': {
              '0%': { transform: 'translate(0, 0) scale(1)', opacity: 0 },
              '15%': { opacity: 1 },
              '60%': { transform: `translate(${u(-150)}, ${u(90)}) scale(0.7)`, opacity: 1 },
              '75%, 100%': { transform: `translate(${u(-170)}, ${u(120)}) scale(0.5)`, opacity: 0 },
            },
          }}
        />
      ))}
    </Box>
  );
}

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

/* ------------------------------------------------------------ topics */

export function InfoPopup({
  topic,
  origin,
  member,
  cart,
  onClose,
  onRetryCamera,
}: {
  topic: Topic;
  origin: Origin | null;
  member: ThriftPlusMember | null;
  cart: ThriftPlusCart | undefined;
  onClose: () => void;
  onRetryCamera: () => void;
}) {
  if (topic === 'camera') {
    return (
      <Popup origin={origin} label="Camera not working?" onClose={onClose}>
        <CameraHelp
          onRetry={() => {
            onClose();
            onRetryCamera();
          }}
        />
      </Popup>
    );
  }
  const cover = member?.cover;
  return (
    <Popup origin={origin} label={TITLES[topic]} onClose={onClose}>
      {topic === 'scan' && <ScanArt />}
      {topic === 'bank' && <BankArt />}
      {topic === 'cover' && cover && (
        <CoverArt pct={(Number.parseFloat(cover.covered) / (Number.parseFloat(cover.amount) || 10)) * 100} done={cover.is_covered} />
      )}
      {topic === 'cart' && <CartArt />}
      <Title>{TITLES[topic]}</Title>
      {topic === 'scan' && (
        <Body>
          Point your camera at the QR code on any price tag. You'll see our price and what you'd earn right away. Swipe right to add
          it to your cart, left to pass.
        </Body>
      )}
      {topic === 'bank' && (
        <>
          <Body>
            Rewards you save for a later trip instead of taking them off today's price. Banked rewards are worth {BANK_EXTRA_PCT}% more.
            Use them at the register any time.
          </Body>
          {member && <Stat>Your bank: {money(member.banked_rewards)}</Stat>}
        </>
      )}
      {topic === 'cover' && cover && (
        <>
          <Body>
            Thrift+ is free. The first {money(cover.amount, true)} of rewards each month covers your card. After that, every reward is
            yours to take off your price or bank. It starts over on {shortDate(cover.resets_on)}.
          </Body>
          <Stat>
            {cover.is_covered ? 'Covered for this month' : `${money(cover.covered)} of ${money(cover.amount)} covered so far`}
          </Stat>
        </>
      )}
      {topic === 'cart' && (
        <>
          <Body>
            What you'd earn on the items in your cart today. At checkout they finish this month's cover first, then come off your price
            or go to your bank with {BANK_EXTRA_PCT}% more.
          </Body>
          {cart && <Stat>This cart: +{money(cart.totals.reward_total)}</Stat>}
        </>
      )}
      <Primary label="Got it" onClick={onClose} />
    </Popup>
  );
}

const TITLES: Record<Exclude<Topic, 'camera'>, string> = {
  scan: 'Scan any tag',
  bank: 'Banked rewards',
  cover: "This month's cover",
  cart: 'Your cart rewards',
};

/* ---------------------------------------------------------- walkthrough */

export function IntroTour({ isGuest, onDone, onCameraHelp }: { isGuest: boolean; onDone: () => void; onCameraHelp: () => void }) {
  const steps = [
    { key: 'scan', art: <ScanArt />, title: 'Scan', body: "Point at any price tag. See our price and what you'd earn." },
    isGuest
      ? { key: 'bank', art: <BankArt />, title: 'Get a card', body: 'Members pay less the longer an item has been here. Cards are free at the register.' }
      : {
          key: 'bank',
          art: <BankArt />,
          title: 'Bank',
          body: `Bank your rewards for a later trip and they're worth ${BANK_EXTRA_PCT}% more. Or take them off today's price.`,
        },
    { key: 'cart', art: <CartArt />, title: 'Cart', body: 'Swipe right to add. Tap the pill up top to see your cart and total.' },
  ];
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;
  return (
    <Popup origin={null} label="How Thrift+ works" onClose={onDone}>
      <Box key={step.key} sx={{ animation: 'tpStep 260ms ease-out both', '@keyframes tpStep': { from: { opacity: 0, transform: `translateX(${u(40)})` } } }}>
        {step.art}
        <Title>{step.title}</Title>
        <Body>{step.body}</Body>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: u(14), mt: u(28) }}>
        {steps.map((s, k) => (
          <Box
            key={s.key}
            sx={{ width: k === i ? u(40) : u(14), height: u(14), borderRadius: 99, bgcolor: k === i ? sc.green : '#d6d8d2', transition: 'width 200ms' }}
          />
        ))}
      </Box>
      <Primary
        label={last ? 'Done' : 'Next'}
        onClick={() => {
          if (last) onDone();
          else setI(i + 1);
        }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: u(18) }}>
        <ButtonBase onClick={onDone} sx={{ fontSize: u(28), color: sc.ink3, px: u(12), py: u(10), borderRadius: u(12) }}>
          Skip
        </ButtonBase>
        <ButtonBase onClick={onCameraHelp} sx={{ fontSize: u(28), color: sc.ink2, px: u(12), py: u(10), borderRadius: u(12) }}>
          Camera not working?
        </ButtonBase>
      </Box>
    </Popup>
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
