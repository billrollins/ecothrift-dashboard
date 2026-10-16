/**
 * The trip scanner's header and the sheets it opens (owner 2026-10-12 and 10-13):
 * - the header: tap anywhere on it for what Thrift+ is (the terms page's words and a link to the full terms), except the
 *   Your ThriftBucks pill, which opens the Member QR (owner 2026-10-14, APP D1 and D6): the QR to show at the register, then
 *   Thrift+ credit and every ThriftBuck in the order the register uses them (B3);
 * - the information sheets (retail prices, 3-day returns or AS IS);
 * - "Price feel off?": what feels off, what they'd pay, then thanks with a little information.
 */
import { addDays, format, parseISO } from 'date-fns';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useQuery } from '@tanstack/react-query';
import { Box, ButtonBase, CircularProgress } from '@mui/material';
import AssignmentReturnRounded from '@mui/icons-material/AssignmentReturnRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import SavingsRounded from '@mui/icons-material/SavingsRounded';
import SellRounded from '@mui/icons-material/SellRounded';
import VolunteerActivismRounded from '@mui/icons-material/VolunteerActivismRounded';
import { toCents, type PriceFeelReason, type ThriftPlusItemCard, type ThriftPlusMember } from '../../../api/thriftPlusMock';
import { getMyCard, type MyCard } from '../../../api/thriftPlusScanner.api';
import { tbNumber } from '../../../components/thriftplus/ThriftBucks';
import { FieldBanner } from './ScannerTop';
import { bucksReady, money, wouldPayChoices } from './scannerLogic';
import { ThriftPlusLogo, art, sc, u } from './scannerTheme';
import { canInstall, installPrompt, isStandalone } from './installApp';
import { BigButton, Sheet } from './tripUi';
import { MY_CARD_KEY, thriftPlusKeys, useMe } from './useThriftPlus';

const TERMS_URL = 'https://ecothrift.us/terms';

export interface Info {
  title: string;
  text: string;
}

// The owner's words (2026-10-13), tidied.
export const RETAIL_INFO: Info = {
  title: 'About retail prices',
  text: "Retail prices come straight from the retailer; we don't set them. If you've seen it for less, it may be on clearance or an "
    + 'online sale, or the retailer may have changed its price recently. One store can also charge a different price than another '
    + 'store of the same retailer.',
};
const PRICING_INFO: Info = {
  title: 'How we price',
  text: 'Pricing used items is tricky. We start well below retail, and ThriftBucks grow as an item sits. That way every price gets '
    + 'to just right in time.',
};
export const RETURNS_INFO: Record<'yes' | 'no', Info> = {
  yes: {
    title: 'Thrift+ 3-day returns',
    text: 'This item qualifies. Bring it back within 3 days, for any reason: 80% of what you paid comes back as Thrift+ credit. '
      + 'Your receipt marks each item that qualifies.',
  },
  no: {
    title: 'Sold AS IS',
    text: "This item can't be returned. It's marked AS IS, or it doesn't qualify for 3-day returns (like clothing, parts and "
      + 'low-priced items). AS IS sales are final.',
  },
};
const FEEL_DONE: Record<PriceFeelReason, { title: string; text: string; info?: Info }> = {
  too_high: { title: "Thanks, we'll review it", text: 'We recorded your answer.', info: PRICING_INFO },
  retail_wrong: { title: 'Thanks for letting us know', text: 'We recorded your comment and will review it.', info: RETAIL_INFO },
  too_low: { title: 'Thanks for looking out!', text: "We'll review it to make sure it wasn't a mistake." },
  wrong_info: { title: 'Thanks for letting us know', text: "We'll check the item's details and fix the tag if it's wrong." },
  other: { title: 'Thanks for letting us know', text: 'We recorded your comment and will review it.' },
};

/**
 * The field header: tap it for what Thrift+ is. The pill, top right on every screen: members get two buttons in one pill
 * (owner 2026-10-15, APP D11), their balance (the balance sheet) and the QR (the Member QR sheet); non-members sign in.
 */
export function TripHeader({ member, onAbout, onWallet, onBalance, onSignIn }: {
  member: ThriftPlusMember | null;
  onAbout: () => void;
  onWallet: () => void;
  onBalance: () => void;
  onSignIn: () => void;
}) {
  const shell = { position: 'absolute', right: u(30), top: u(42), height: u(116), borderRadius: 99, bgcolor: '#fff',
    boxShadow: '0 4px 14px rgba(0,0,0,0.16)', fontFamily: sc.font, whiteSpace: 'nowrap' } as const;
  const ready = bucksReady(member?.banked_rewards, member?.bucks_available);
  return (
    <FieldBanner>
      <Box sx={{ position: 'relative', width: u(900), height: '100%', mx: 'auto' }}>
        <ButtonBase onClick={onAbout} aria-label="What is Thrift+?" data-testid="about-thriftplus"
          sx={{ position: 'absolute', inset: 0, display: 'block', textAlign: 'left' }}>
          <Box sx={{ position: 'absolute', left: u(35), top: u(40) }}>
            <ThriftPlusLogo width={u(290)} />
          </Box>
        </ButtonBase>
        {member ? (
          <Box sx={{ ...shell, display: 'flex', alignItems: 'stretch', overflow: 'hidden' }}>
            <ButtonBase onClick={onBalance} data-testid="wallet-pill"
              aria-label={`Your ThriftBucks: ${tbNumber(ready.now)} ready to use${ready.tomorrow ? `, ${tbNumber(ready.tomorrow)} more tomorrow morning` : ''}. See your balance`}
              sx={{ pl: u(30), pr: u(18), display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
              <Box component="span" sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(46), lineHeight: 1.05, color: '#1f6b27' }}>
                {tbNumber(ready.now)}
              </Box>
              {/* Today's ThriftBucks wait for the morning (B5): the pill counts only what works now. */}
              <Box component="span" data-testid="wallet-pill-label" sx={{ fontWeight: 600, fontSize: u(24), color: '#5d605a' }}>
                {ready.tomorrow ? `+${tbNumber(ready.tomorrow)} tomorrow` : 'ThriftBucks'}
              </Box>
            </ButtonBase>
            {/* The QR's hit area is the pill's whole right end, about 54 x 50 px (APP D11). */}
            <ButtonBase onClick={onWallet} data-testid="qr-pill" aria-label="Member QR: show it at the register"
              sx={{ width: u(124), display: 'grid', placeItems: 'center', justifyItems: 'end', pr: u(6) }}>
              <Box sx={{ width: u(104), height: u(104), borderRadius: '50%', bgcolor: '#3f9f35', color: '#fff', display: 'grid', placeItems: 'center' }}>
                <QrCode2Rounded sx={{ fontSize: u(60) }} />
              </Box>
            </ButtonBase>
          </Box>
        ) : (
          <ButtonBase onClick={onSignIn} aria-label="Sign in" data-testid="wallet-pill" sx={{ ...shell, pl: u(16), pr: u(34), gap: u(16) }}>
            <Box sx={{ width: u(84), height: u(84), borderRadius: '50%', bgcolor: '#3f9f35', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <PersonRounded sx={{ fontSize: u(54) }} />
            </Box>
            <Box sx={{ fontSize: u(38), fontWeight: 800, color: '#1f6b27' }}>Sign in</Box>
          </ButtonBase>
        )}
      </Box>
    </FieldBanner>
  );
}

/** What Thrift+ is: the terms page's "All you need to know", then the full terms. */
export function ThriftPlusSheet({ onClose }: { onClose: () => void }) {
  const facts: Array<{ icon: React.ReactNode; title: string; text: string }> = [
    { icon: <VolunteerActivismRounded />, title: 'Free to join.', text: 'Nothing owed.' },
    { icon: <TrendingUpRounded />, title: 'ThriftBucks on most items.', text: "They grow as an item sits, up to 95% of the tag. Scan any tag to see today's ThriftBucks." },
    { icon: <SavingsRounded />, title: 'Kept for next time, the Default.', text: 'Your ThriftBucks stay on your account. Use them from the next day, for 30 days, at full value.' },
    { icon: <BoltRounded />, title: 'Or redeem them instantly.', text: "At 50% of their value, off today's price. Just tell the cashier." },
    { icon: <AssignmentReturnRounded />, title: '3-day returns.', text: 'Bring a qualifying item back within 3 days, for any reason: 80% of what you paid comes back as Thrift+ credit.' },
    // "Non-member", never "guest", in customer words (owner 2026-10-15, APP D10).
    { icon: <SellRounded />, title: 'Non-members pay the tag.', text: 'Everything a non-member buys is sold AS IS. All sales final.' },
  ];
  return (
    <Sheet
      onClose={onClose}
      testId="thriftplus-sheet"
      top={
        <Box sx={{ flexShrink: 0, height: u(190), backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.18)), url(${art.header})`,
          backgroundSize: 'cover', backgroundPosition: 'center 46%', display: 'flex', alignItems: 'center', pl: u(40) }}>
          <ThriftPlusLogo width={u(300)} />
        </Box>
      }
    >
      <Box component="h2" sx={{ m: 0, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(50), color: sc.titleGreen, lineHeight: 1.1 }}>
        ThriftBucks, 3-day returns and more!
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: u(22), mt: u(28) }}>
        {facts.map((p) => (
          <Box key={p.title} sx={{ display: 'flex', gap: u(22), alignItems: 'flex-start' }}>
            <Box sx={{ flexShrink: 0, width: u(70), height: u(70), borderRadius: '50%', bgcolor: sc.greenTint, color: sc.greenDeep,
              display: 'grid', placeItems: 'center', fontSize: u(40), '& svg': { fontSize: u(40) } }}>
              {p.icon}
            </Box>
            <Box sx={{ fontSize: u(30), lineHeight: 1.4, color: sc.ink }}>
              <Box component="span" sx={{ fontWeight: 800 }}>{p.title}</Box> {p.text}
            </Box>
          </Box>
        ))}
      </Box>
      <ButtonBase component="a" href={TERMS_URL} target="_blank" rel="noopener" data-testid="terms-link"
        sx={{ mt: u(36), width: '100%', height: u(112), borderRadius: 99, gap: u(12), bgcolor: sc.green, color: '#fff', fontSize: u(34), fontWeight: 700 }}>
        Read the full terms
        <OpenInNewRounded sx={{ fontSize: u(38) }} />
      </ButtonBase>
      <Box sx={{ textAlign: 'center', mt: u(14), fontSize: u(26), color: sc.ink3 }}>ecothrift.us/terms · English and Español</Box>
    </Sheet>
  );
}

const day = (iso: string) => format(parseISO(iso), 'MMM d');

const CARD_TERMS = 'ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value.';

function cachedCard(): MyCard | undefined {
  try {
    const raw = localStorage.getItem(MY_CARD_KEY);
    return raw ? (JSON.parse(raw) as MyCard) : undefined;
  } catch {
    return undefined;
  }
}

/** The QR, crisp: an SVG with a 4-module quiet zone, error correction M (APP D1). `size` overrides the sheet's size. */
function CardQr({ text, size }: { text: string; size?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, color: { dark: '#000000', light: '#ffffff' } })
      .then((out) => live && setSvg(out))
      .catch(() => live && setSvg(''));
    return () => {
      live = false;
    };
  }, [text]);
  return (
    <Box data-testid="my-card-qr" role="img" aria-label="Your member QR"
      sx={{ width: size ?? u(560), height: size ?? u(560), maxWidth: '100%', mx: 'auto', '& svg': { width: '100%', height: '100%', display: 'block', shapeRendering: 'crispEdges' } }}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

/**
 * The Member QR on a phone held sideways (APP D16 v2: a member turning the phone to show the cashier): the QR alone, as
 * large as fits, with the code under it. Plain pixels: the design unit is sized for an upright phone.
 */
export function SidewaysQr() {
  const card = useQuery({ queryKey: thriftPlusKeys.myCard, queryFn: getMyCard, initialData: cachedCard, staleTime: 60_000 });
  const c = card.data;
  return (
    <Box data-testid="sideways-qr"
      sx={{ position: 'fixed', inset: 0, zIndex: 80, bgcolor: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '6px', fontFamily: sc.font }}>
      {c ? (
        <>
          <CardQr text={c.qr} size="min(74vh, 74vw)" />
          <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: 18, letterSpacing: '0.12em', color: sc.ink }}>{c.display}</Box>
          <Box sx={{ fontSize: 14, color: sc.ink2 }}>
            {c.ready ? 'Show this at the register.' : 'Finish joining at any register. Show them this code.'}
          </Box>
        </>
      ) : (
        <CircularProgress sx={{ color: sc.green }} />
      )}
    </Box>
  );
}

/**
 * Member QR (owner 2026-10-14, APP D1, D6 and D11): the member's QR to show at the register (there is no card), kept on
 * the phone so it shows with no signal, with the screen kept awake while it's open, and the home-screen link. Nothing else.
 */
export function WalletSheet({ member, onClose }: { member: ThriftPlusMember; onClose: () => void }) {
  const card = useQuery({ queryKey: thriftPlusKeys.myCard, queryFn: getMyCard, initialData: cachedCard, staleTime: 60_000 });
  useEffect(() => {
    if (!card.data) return;
    try {
      localStorage.setItem(MY_CARD_KEY, JSON.stringify(card.data));
    } catch {
      /* private mode: it just won't be there offline */
    }
  }, [card.data]);
  // Keep the screen awake while the cashier scans (where the phone allows it).
  useEffect(() => {
    let lock: { release?: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (kind: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => {
      lock = l;
    }).catch(() => undefined);
    return () => {
      lock?.release?.().catch(() => undefined);
    };
  }, []);
  const c = card.data;
  return (
    <Sheet onClose={onClose} testId="wallet-sheet">
      <Box component="h2" sx={{ m: 0, pr: u(90), fontFamily: sc.condensed, fontWeight: 700, fontSize: u(52), color: sc.titleGreen }}>Member QR</Box>
      <Box data-testid="my-card" sx={{ mt: u(22), borderRadius: u(40), px: u(36), py: u(34), color: '#fff',
        background: 'linear-gradient(165deg, #3f9f35 0%, #2e8a2c 55%, #237a26 100%)', boxShadow: `0 ${u(10)} ${u(28)} rgba(35,122,38,0.30)` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: u(20) }}>
          <ThriftPlusLogo width={u(230)} />
          <Box sx={{ fontWeight: 700, fontSize: u(40), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c?.first_name ?? member.first_name}</Box>
        </Box>
        <Box sx={{ mt: u(24), bgcolor: '#fff', borderRadius: u(28), px: u(24), pt: u(24), pb: u(20), textAlign: 'center' }}>
          {c ? (
            <>
              <CardQr text={c.qr} />
              <Box data-testid="my-card-code" sx={{ mt: u(12), fontFamily: sc.condensed, fontWeight: 700, fontSize: u(34), letterSpacing: '0.12em', color: sc.ink }}>
                {c.display}
              </Box>
            </>
          ) : card.isError ? (
            <Box sx={{ py: u(60), fontSize: u(28), color: sc.ink2 }}>Your code needs a connection the first time. Try again in a moment.</Box>
          ) : (
            <Box sx={{ py: u(120) }}><CircularProgress size={28} sx={{ color: sc.green }} /></Box>
          )}
        </Box>
        {/* Not joined at a register yet (J2): the bold line says so; the card's B12 line stays on every card (APP D1). */}
        <Box sx={{ mt: u(24), textAlign: 'center', fontWeight: 700, fontSize: u(32) }}>
          {c && !c.ready ? 'Finish joining at any register. Show them this code.' : 'Show this at the register.'}
        </Box>
        <Box sx={{ mt: u(10), textAlign: 'center', fontSize: u(24), lineHeight: 1.4, opacity: 0.92 }}>
          {CARD_TERMS} Terms:{' '}
          <Box component="a" href={TERMS_URL} target="_blank" rel="noopener" sx={{ color: 'inherit' }}>ecothrift.us/terms</Box>
        </Box>
      </Box>

      <AddToHome />
    </Sheet>
  );
}

/**
 * The balance (owner 2026-10-15, APP D11): the left half of the header pill. Thrift+ credit and every ThriftBuck in the
 * order the register uses them (B3), the B12 line, My account, Sign out, and a way back to the Member QR.
 */
export function BalanceSheet({ member, tripTotal, onClose, onAccount, onSignOut, onShowQr }: {
  member: ThriftPlusMember;
  tripTotal: number;
  onClose: () => void;
  onAccount: () => void;
  onSignOut: () => void;
  onShowQr: () => void;
}) {
  const me = useMe();
  const lots = me.data?.rewards ?? [];
  const credit = me.data?.credit ?? member.credit_balance;
  const ready = bucksReady(me.data?.banked ?? member.banked_rewards, me.data ? me.data.available : member.bucks_available);
  const rows = [
    ...(toCents(credit) > 0
      ? [{ what: 'Thrift+ credit', amount: money(credit), note: 'From a return. Always used first. Never expires.', credit: true }]
      : []),
    ...lots.map((l) => ({
      what: 'ThriftBucks', amount: tbNumber(l.amount), credit: false,
      note: l.past_due
        ? `Use by ${day(l.use_by)} (past its date)`
        : l.usable === false
          ? `Collected ${day(l.earned_on)} · ready tomorrow morning · use by ${day(l.use_by)}`
          : `Collected ${day(l.earned_on)} · use by ${day(l.use_by)}`,
    })),
  ];
  const link = { fontSize: u(28), color: sc.ink2, textDecoration: 'underline', px: u(16), py: u(10), borderRadius: u(12), fontFamily: sc.font } as const;
  return (
    <Sheet onClose={onClose} testId="balance-sheet">
      <Box sx={{ fontSize: u(26), color: sc.ink2, letterSpacing: '0.14em', textTransform: 'uppercase', pr: u(90) }}>Your ThriftBucks</Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: u(14), mt: u(6) }}>
        <Box data-testid="balance-ready" sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(110), lineHeight: 1, color: sc.priceGreen }}>{tbNumber(ready.now)}</Box>
        <Box sx={{ fontSize: u(30), color: sc.ink2 }}>ready to use</Box>
      </Box>
      {ready.tomorrow > 0 && (
        <Box data-testid="balance-tomorrow" sx={{ fontSize: u(30), color: sc.ink2, mt: u(8) }}>
          Plus <Box component="span" sx={{ fontWeight: 800, color: sc.priceGreen }}>{tbNumber(ready.tomorrow)}</Box> ThriftBucks from today, ready tomorrow morning.
        </Box>
      )}
      {toCents(credit) > 0 && (
        <Box sx={{ fontSize: u(28), color: sc.ink2, mt: u(8) }}>
          Plus <Box component="span" sx={{ fontWeight: 800, color: sc.ink }}>{money(credit)}</Box> Thrift+ credit.
        </Box>
      )}

      <Box sx={{ mt: u(34), fontFamily: sc.condensed, fontWeight: 700, fontSize: u(38), color: sc.titleGreen }}>Used in this order at the register</Box>
      {me.isLoading ? (
        <Box sx={{ py: u(30), textAlign: 'center' }}><CircularProgress size={28} sx={{ color: sc.green }} /></Box>
      ) : rows.length === 0 ? (
        <Box sx={{ mt: u(16), fontSize: u(28), color: sc.ink3 }}>Nothing yet. ThriftBucks you collect are ready the next morning.</Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: u(14), mt: u(16) }}>
          {rows.map((r, i) => (
            <Box key={`${r.what}${i}`} data-testid="wallet-row"
              sx={{ display: 'flex', alignItems: 'center', gap: u(20), p: u(22), bgcolor: sc.card, borderRadius: u(26), border: '1px solid #ecede8' }}>
              <Box sx={{ flexShrink: 0, width: u(56), height: u(56), borderRadius: '50%', bgcolor: r.credit ? sc.ink : sc.green, color: '#fff',
                display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: u(30) }}>{i + 1}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontWeight: 700, fontSize: u(31) }}>{r.what}</Box>
                <Box sx={{ fontSize: u(25), color: sc.ink2, lineHeight: 1.3 }}>{r.note}</Box>
              </Box>
              <Box sx={{ flexShrink: 0, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(46), color: r.credit ? sc.ink : sc.priceGreen }}>{r.amount}</Box>
            </Box>
          ))}
        </Box>
      )}

      {tripTotal > 0 && (
        <Box data-testid="wallet-trip" sx={{ mt: u(26), p: u(24), borderRadius: u(26), bgcolor: sc.greenTint, display: 'flex', alignItems: 'center', gap: u(20) }}>
          <Box sx={{ flex: 1, fontSize: u(27), color: sc.greenDeep, lineHeight: 1.35 }}>
            <Box component="span" sx={{ fontWeight: 800 }}>When you buy this trip:</Box> ready tomorrow, use by {format(addDays(new Date(), 30), 'MMM d')}.
          </Box>
          <Box sx={{ flexShrink: 0, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(46), color: sc.green }}>+{tbNumber(tripTotal)}</Box>
        </Box>
      )}

      <Box sx={{ mt: u(26), fontSize: u(24), lineHeight: 1.4, color: sc.ink3 }}>{CARD_TERMS}</Box>

      <Box sx={{ mt: u(28), display: 'flex', justifyContent: 'center', gap: u(20) }}>
        <ButtonBase onClick={onAccount} data-testid="my-account" sx={link}>My account</ButtonBase>
        <ButtonBase onClick={onSignOut} data-testid="sign-out" sx={link}>Sign out</ButtonBase>
      </Box>
      <ButtonBase onClick={onShowQr} data-testid="show-qr"
        sx={{ mt: u(18), width: '100%', py: u(18), gap: u(12), borderRadius: u(16), fontSize: u(30), color: sc.ink2, fontFamily: sc.font }}>
        <QrCode2Rounded sx={{ fontSize: u(40), color: '#3f9f35' }} />
        Show my member QR
      </ButtonBase>
    </Sheet>
  );
}

/**
 * "Add your member QR to your home screen" (owner 2026-10-14, APP D5 and D6): hidden in the home-screen app and where adding isn't
 * possible. Android: the browser's own Install prompt. iPhone Safari: how to do it (Share, then Add to Home Screen).
 */
function AddToHome() {
  const [how, setHow] = useState(false);
  const [, bump] = useState(0);
  useEffect(() => installPrompt.listen(() => bump((n) => n + 1)), []);
  const way = canInstall();
  if (isStandalone() || !way) return null;
  return (
    <>
      <Box sx={{ mt: u(22), textAlign: 'center' }}>
        <ButtonBase
          data-testid="add-to-home"
          onClick={() => (way === 'prompt' ? void installPrompt.show() : setHow(true))}
          sx={{ fontFamily: sc.font, fontWeight: 700, fontSize: u(28), color: '#237a26', textDecoration: 'underline', px: u(12), py: u(8), borderRadius: u(12) }}
        >
          Add your member QR to your home screen
        </ButtonBase>
      </Box>
      {how && (
        <Sheet onClose={() => setHow(false)} testId="add-to-home-sheet">
          <Box component="h2" sx={{ m: 0, pr: u(90), fontFamily: sc.condensed, fontWeight: 700, fontSize: u(52), color: sc.titleGreen }}>
            Add it to your home screen
          </Box>
          <Box sx={{ mt: u(24), display: 'flex', alignItems: 'center', gap: u(24) }}>
            <Box component="img" src="/scan/icons/apple-touch-icon.png" alt="" sx={{ width: u(150), height: u(150), borderRadius: u(34), flexShrink: 0 }} />
            <Box sx={{ fontSize: u(31), lineHeight: 1.4, color: sc.ink }}>Then one tap opens your member QR at the register.</Box>
          </Box>
          <Box sx={{ mt: u(28), fontSize: u(31), lineHeight: 1.5, color: sc.ink }}>
            <Box>1. Tap <b>Share</b> at the bottom of Safari (the square with the arrow).</Box>
            <Box sx={{ mt: u(10) }}>2. Tap <b>Add to Home Screen</b>, then <b>Add</b>.</Box>
          </Box>
          <Box sx={{ mt: u(34), display: 'flex' }}>
            <BigButton primary onClick={() => setHow(false)} testId="add-to-home-done">Got it</BigButton>
          </Box>
        </Sheet>
      )}
    </>
  );
}

/** A short piece of information (retail prices, returns). */
export function InfoSheet({ info, onClose }: { info: Info; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} testId="info-sheet">
      <Box component="h2" sx={{ m: 0, pr: u(90), fontFamily: sc.condensed, fontWeight: 700, fontSize: u(52), color: sc.titleGreen }}>{info.title}</Box>
      <Box sx={{ mt: u(14), fontSize: u(31), lineHeight: 1.5, color: sc.ink }}>{info.text}</Box>
    </Sheet>
  );
}

export type Feel = { step: 'reasons' | 'too_high' } | { step: 'done'; reason: PriceFeelReason };

const FEEL_REASONS: Array<{ reason: PriceFeelReason; label: string }> = [
  { reason: 'too_high', label: 'Price is too high' },
  { reason: 'retail_wrong', label: 'Retail price is wrong' },
  { reason: 'wrong_info', label: 'Wrong item info' },
  { reason: 'too_low', label: 'Price is too low' },
  { reason: 'other', label: 'Something else' },
];

/**
 * What feels off, and for "too high", what they'd pay (the live scanner's questions, sent as before); then thanks,
 * we'll review it, with a little information for too high and for retail (owner 2026-10-13).
 */
export function FeelSheet({ item, feel, onFeel, onSend, onClose }: {
  item: ThriftPlusItemCard;
  feel: Feel;
  onFeel: (feel: Feel) => void;
  onSend: (reason: PriceFeelReason, wouldPay: string | null) => void;
  onClose: () => void;
}) {
  if (feel.step === 'done') {
    const done = FEEL_DONE[feel.reason];
    return (
      <Sheet onClose={onClose} testId="feel-sheet">
        <Box data-testid="feel-done" sx={{ textAlign: 'center', pt: u(10) }}>
          <CheckCircleRounded sx={{ fontSize: u(110), color: sc.green }} />
          <Box component="h2" sx={{ m: 0, mt: u(8), fontFamily: sc.condensed, fontWeight: 700, fontSize: u(54), color: sc.titleGreen }}>{done.title}</Box>
          <Box sx={{ mt: u(6), fontSize: u(30), color: sc.ink2 }}>{done.text}</Box>
        </Box>
        {done.info && (
          <Box sx={{ mt: u(30), p: u(28), borderRadius: u(26), bgcolor: '#fff', border: '1px solid #ecede8' }}>
            <Box sx={{ fontWeight: 800, fontSize: u(31), color: sc.ink }}>{done.info.title}</Box>
            <Box sx={{ mt: u(8), fontSize: u(29), lineHeight: 1.5, color: sc.ink2 }}>{done.info.text}</Box>
          </Box>
        )}
        <Box sx={{ mt: u(30), display: 'flex' }}>
          <BigButton primary onClick={onClose} testId="feel-close">Done</BigButton>
        </Box>
      </Sheet>
    );
  }
  const send = (reason: PriceFeelReason, wouldPay: string | null = null) => {
    onSend(reason, wouldPay);
    onFeel({ step: 'done', reason });
  };
  const choice = { justifyContent: 'flex-start', px: u(32), minHeight: u(96), borderRadius: u(24), border: `1px solid ${sc.line}`, bgcolor: '#fff',
    fontSize: u(32), fontWeight: 500, color: sc.ink, textAlign: 'left', fontFamily: sc.font, '&:active': { bgcolor: sc.greenTint } } as const;
  return (
    <Sheet onClose={onClose} testId="feel-sheet">
      <Box component="h2" sx={{ m: 0, pr: u(90), fontFamily: sc.condensed, fontWeight: 700, fontSize: u(52), color: sc.titleGreen }}>
        {feel.step === 'reasons' ? 'What feels off?' : "I'd buy it at"}
      </Box>
      <Box sx={{ fontSize: u(28), color: sc.ink2, mt: u(4), mb: u(26) }}>{item.title} · {money(item.price)}</Box>
      {feel.step === 'reasons' ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: u(14) }}>
          {FEEL_REASONS.map((r) => (
            <ButtonBase key={r.reason} sx={choice} onClick={() => (r.reason === 'too_high' ? onFeel({ step: 'too_high' }) : send(r.reason))}>{r.label}</ButtonBase>
          ))}
        </Box>
      ) : (
        <Box>
          <Box sx={{ display: 'flex', gap: u(16), mb: u(20) }}>
            {wouldPayChoices(item.price).map((c) => (
              <ButtonBase key={c.under_pct} onClick={() => send('too_high', c.would_pay)}
                sx={{ flex: 1, height: u(116), borderRadius: u(24), border: `${u(3)} solid ${sc.cardEdge}`, bgcolor: sc.greenTint, fontFamily: sc.condensed,
                  fontSize: u(48), fontWeight: 700, color: sc.priceGreen }}>
                {money(c.would_pay, true)}
              </ButtonBase>
            ))}
          </Box>
          <ButtonBase sx={{ ...choice, width: '100%' }} onClick={() => send('too_high')}>Just too high</ButtonBase>
        </Box>
      )}
    </Sheet>
  );
}
