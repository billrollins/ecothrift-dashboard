/**
 * "Put Thrift+ on your home screen" (owner 2026-10-20): "It stays signed in and opens faster." On mobile web only, never
 * inside the installed app (`display-mode: standalone`, `navigator.standalone`) or where the phone can't add it.
 * Android: the browser's own Install button. iPhone: three picture steps (Share, Add to Home Screen, Add).
 * - `banner`: under the header on the Scan tab after sign-in; × hides it for two weeks (installApp.ts).
 * - `account`: always in Account, as a card with a big button; nothing hides it.
 */
import { useEffect, useState } from 'react';
import { Box, ButtonBase } from '@mui/material';
import AddBoxOutlined from '@mui/icons-material/AddBoxOutlined';
import CloseRounded from '@mui/icons-material/CloseRounded';
import IosShareRounded from '@mui/icons-material/IosShareRounded';
import { canInstall, dismissHomeCard, homeCardDismissed, installPrompt, isStandalone } from './installApp';
import { sc, u } from './scannerTheme';
import { BigButton, Sheet } from './tripUi';

const ICON = '/scan/icons/apple-touch-icon.png';
const TITLE = 'Put Thrift+ on your home screen';
const WHY = 'It stays signed in and opens faster.';

/** The three iPhone steps, each with a small picture of what to tap. */
function HowSheet({ onClose }: { onClose: () => void }) {
  const tile = { flexShrink: 0, width: u(250), minHeight: u(120), borderRadius: u(24), bgcolor: '#fff', border: `${u(3)} solid ${sc.line}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: u(14), fontSize: u(34), color: sc.ink, px: u(16) } as const;
  const blue = '#0a74e6';
  const steps = [
    { n: 1, tile: <IosShareRounded sx={{ fontSize: u(84), color: blue }} />, text: <>Tap <b>Share</b> at the bottom of Safari.</> },
    { n: 2, tile: <><Box component="span" sx={{ fontWeight: 600 }}>Add to Home Screen</Box><AddBoxOutlined sx={{ fontSize: u(52), flexShrink: 0 }} /></>,
      text: <>Tap <b>Add to Home Screen</b>. Scroll down if you don&apos;t see it.</> },
    { n: 3, tile: <Box component="span" sx={{ fontWeight: 700, fontSize: u(42), color: blue }}>Add</Box>, text: <>Tap <b>Add</b> at the top right.</> },
  ];
  return (
    <Sheet onClose={onClose} testId="home-steps">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: u(24), pr: u(90) }}>
        <Box component="img" src={ICON} alt="" sx={{ width: u(120), height: u(120), borderRadius: u(28), flexShrink: 0 }} />
        <Box component="h2" sx={{ m: 0, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(50), lineHeight: 1.1, color: sc.titleGreen }}>{TITLE}</Box>
      </Box>
      <Box sx={{ mt: u(28), display: 'flex', flexDirection: 'column', gap: u(22) }}>
        {steps.map((s) => (
          <Box key={s.n} data-testid={`home-step-${s.n}`} sx={{ display: 'flex', alignItems: 'center', gap: u(20) }}>
            <Box sx={{ flexShrink: 0, width: u(60), height: u(60), borderRadius: '50%', bgcolor: sc.green, color: '#fff', display: 'grid', placeItems: 'center',
              fontWeight: 800, fontSize: u(34) }}>{s.n}</Box>
            <Box sx={tile}>{s.tile}</Box>
            <Box sx={{ fontSize: u(31), lineHeight: 1.35, color: sc.ink }}>{s.text}</Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: u(34), display: 'flex' }}>
        <BigButton primary onClick={onClose} testId="home-steps-done">Got it</BigButton>
      </Box>
    </Sheet>
  );
}

export function HomeScreenCard({ variant }: { variant: 'banner' | 'account' }) {
  const [how, setHow] = useState(false);
  const [dismissed, setDismissed] = useState(() => variant === 'banner' && homeCardDismissed());
  const [, bump] = useState(0);
  useEffect(() => installPrompt.listen(() => bump((n) => n + 1)), []);
  const way = canInstall();
  if (isStandalone() || !way || dismissed) return null;
  const go = () => (way === 'prompt' ? void installPrompt.show() : setHow(true));
  const label = way === 'prompt' ? 'Install' : 'Show me';
  const banner = variant === 'banner';
  return (
    <>
      <Box
        data-testid={banner ? 'home-banner' : 'home-card'}
        sx={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: banner ? u(20) : u(24), p: banner ? u(18) : u(30), pr: banner ? u(10) : u(30),
          bgcolor: '#fff', borderRadius: u(banner ? 34 : 36), border: `${u(3)} solid ${sc.cardEdge}`, boxShadow: sc.tileShadow, fontFamily: sc.font,
          flexWrap: banner ? 'nowrap' : 'wrap',
        }}
      >
        <Box component="img" src={ICON} alt="" sx={{ width: u(banner ? 100 : 130), height: u(banner ? 100 : 130), borderRadius: u(banner ? 24 : 30), flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontWeight: 800, fontSize: u(banner ? 31 : 38), lineHeight: 1.15, color: sc.ink }}>{TITLE}</Box>
          <Box sx={{ mt: u(4), fontSize: u(banner ? 26 : 31), lineHeight: 1.3, color: sc.ink2 }}>{WHY}</Box>
        </Box>
        {banner ? (
          <>
            <ButtonBase onClick={go} data-testid="home-go"
              sx={{ flexShrink: 0, px: u(30), height: u(90), borderRadius: 99, bgcolor: sc.green, color: '#fff', fontWeight: 800, fontSize: u(31), whiteSpace: 'nowrap', fontFamily: sc.font }}>
              {label}
            </ButtonBase>
            <ButtonBase onClick={() => { dismissHomeCard(); setDismissed(true); }} aria-label="Not now" data-testid="home-dismiss"
              sx={{ flexShrink: 0, width: u(80), height: u(80), borderRadius: '50%', color: sc.ink3 }}>
              <CloseRounded sx={{ fontSize: u(44) }} />
            </ButtonBase>
          </>
        ) : (
          <Box sx={{ width: '100%', display: 'flex' }}>
            <BigButton primary onClick={go} testId="home-go">{label}</BigButton>
          </Box>
        )}
      </Box>
      {how && <HowSheet onClose={() => setHow(false)} />}
    </>
  );
}
