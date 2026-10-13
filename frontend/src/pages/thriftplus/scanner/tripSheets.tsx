/**
 * The trip scanner's header and the sheets it opens (owner 2026-10-12 and 10-13):
 * - the header: tap anywhere on it for what Thrift+ is (the terms page's words and a link to the full terms), except the
 *   Your ThriftBucks pill, which shows Thrift+ credit and every ThriftBuck in the order the register uses them (B3);
 * - the information sheets (retail prices, 3-day returns or AS IS);
 * - "Price feel off?": what feels off, what they'd pay, then thanks with a little information.
 */
import { addDays, format, parseISO } from 'date-fns';
import { Box, ButtonBase, CircularProgress } from '@mui/material';
import AssignmentReturnRounded from '@mui/icons-material/AssignmentReturnRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import SavingsRounded from '@mui/icons-material/SavingsRounded';
import VolunteerActivismRounded from '@mui/icons-material/VolunteerActivismRounded';
import { toCents, type PriceFeelReason, type ThriftPlusItemCard, type ThriftPlusMember } from '../../../api/thriftPlusMock';
import { tbNumber } from '../../../components/thriftplus/ThriftBucks';
import { FieldBanner } from './ScannerTop';
import { money, wouldPayChoices } from './scannerLogic';
import { ThriftPlusLogo, art, sc, u } from './scannerTheme';
import { BigButton, Sheet } from './tripUi';
import { useMe } from './useThriftPlus';

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
  text: 'Pricing used items is tricky. We start at a discount from retail, and ThriftBucks grow as an item sits, so what it really '
    + 'costs you keeps coming down. That way every price gets to just right in time.',
};
export const RETURNS_INFO: Record<'yes' | 'no', Info> = {
  yes: {
    title: 'Thrift+ 3-day returns',
    text: 'This item qualifies. Bring it back within 3 days, for any reason: 80% of what you paid comes back as Thrift+ credit. '
      + 'Your receipt marks each item that qualifies.',
  },
  no: {
    title: 'Sold AS IS',
    text: "This item can't be returned. It's marked AS IS, or it doesn't qualify for 3-day returns (like clothing, parts and small "
      + 'items). AS IS sales are final.',
  },
};
const FEEL_DONE: Record<PriceFeelReason, { title: string; text: string; info?: Info }> = {
  too_high: { title: "Thanks, we'll review it", text: 'We recorded your answer.', info: PRICING_INFO },
  retail_wrong: { title: 'Thanks for letting us know', text: 'We recorded your comment and will review it.', info: RETAIL_INFO },
  too_low: { title: 'Thanks for looking out!', text: "We'll review it to make sure it wasn't a mistake." },
  wrong_info: { title: 'Thanks for letting us know', text: "We'll check the item's details and fix the tag if it's wrong." },
  other: { title: 'Thanks for letting us know', text: 'We recorded your comment and will review it.' },
};

/** The field header: tap it for what Thrift+ is; the pill (members) shows their ThriftBucks, (guests) signs in. */
export function TripHeader({ member, onAbout, onWallet, onSignIn }: {
  member: ThriftPlusMember | null;
  onAbout: () => void;
  onWallet: () => void;
  onSignIn: () => void;
}) {
  return (
    <FieldBanner>
      <Box sx={{ position: 'relative', width: u(900), height: '100%', mx: 'auto' }}>
        <ButtonBase onClick={onAbout} aria-label="What is Thrift+?" data-testid="about-thriftplus"
          sx={{ position: 'absolute', inset: 0, display: 'block', textAlign: 'left' }}>
          <Box sx={{ position: 'absolute', left: u(35), top: u(40) }}>
            <ThriftPlusLogo width={u(290)} />
          </Box>
        </ButtonBase>
        <ButtonBase
          onClick={member ? onWallet : onSignIn}
          aria-label={member ? `Your ThriftBucks: ${tbNumber(member.banked_rewards)}. See them all` : 'Sign in'}
          data-testid="wallet-pill"
          sx={{ position: 'absolute', right: u(30), top: u(42), height: u(116), px: u(30), gap: u(16), borderRadius: 99, bgcolor: '#fff',
            boxShadow: '0 4px 14px rgba(0,0,0,0.16)', fontFamily: sc.font, whiteSpace: 'nowrap' }}
        >
          <Box component="img" src={art.brick} alt="" sx={{ width: u(92), height: u(92), display: 'block' }} />
          {member ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.05, color: sc.priceGreen }}>
              <Box component="span" data-rain="balance" sx={{ fontFamily: sc.condensed, fontSize: u(46), fontWeight: 700 }}>{tbNumber(member.banked_rewards)}</Box>
              <Box component="span" sx={{ fontSize: u(24), fontWeight: 600, color: sc.ink2 }}>Your ThriftBucks</Box>
            </Box>
          ) : (
            <Box sx={{ fontSize: u(34), fontWeight: 800, color: sc.priceGreen }}>Sign in</Box>
          )}
        </ButtonBase>
      </Box>
    </FieldBanner>
  );
}

/** What Thrift+ is: the terms page's "All you need to know", then the full terms. */
export function ThriftPlusSheet({ onClose }: { onClose: () => void }) {
  const facts: Array<{ icon: React.ReactNode; title: string; text: string }> = [
    { icon: <VolunteerActivismRounded />, title: 'Free to join.', text: 'Nothing owed, ever.' },
    { icon: <Box component="img" src={art.brick} alt="" sx={{ width: '1.25em' }} />, title: 'ThriftBucks on most items.', text: "They grow as an item sits, up to 95% of the tag. Scan any tag to see today's ThriftBucks." },
    { icon: <SavingsRounded />, title: 'Kept for next time.', text: 'Your ThriftBucks are saved to your account automatically. Use them from the next day, for 30 days, at full value.' },
    { icon: <BoltRounded />, title: 'Or redeem them instantly.', text: "At 50% of their value, off today's price. Just tell the cashier." },
    { icon: <AssignmentReturnRounded />, title: '3-day returns.', text: 'Bring a qualifying item back within 3 days, for any reason: 80% of what you paid comes back as Thrift+ credit.' },
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

/** Thrift+ credit, then each ThriftBuck by use-by date: the order the register uses them (B3). */
export function WalletSheet({ member, tripTotal, onClose, onAccount, onSignOut }: {
  member: ThriftPlusMember;
  tripTotal: number;
  onClose: () => void;
  onAccount: () => void;
  onSignOut: () => void;
}) {
  const me = useMe();
  const lots = me.data?.rewards ?? [];
  const credit = me.data?.credit ?? member.credit_balance;
  const rows = [
    ...(toCents(credit) > 0
      ? [{ what: 'Thrift+ credit', amount: money(credit), note: 'From a return. Used first, automatically. Never expires.', credit: true }]
      : []),
    ...lots.map((l) => ({
      what: 'ThriftBucks', amount: tbNumber(l.amount), credit: false,
      note: l.past_due ? `Use by ${day(l.use_by)} (past its date)` : `Collected ${day(l.earned_on)} · use by ${day(l.use_by)}`,
    })),
  ];
  const link = { fontSize: u(28), color: sc.ink2, textDecoration: 'underline', px: u(16), py: u(10), borderRadius: u(12), fontFamily: sc.font } as const;
  return (
    <Sheet onClose={onClose} testId="wallet-sheet">
      <Box sx={{ fontSize: u(26), color: sc.ink2, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Your ThriftBucks</Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: u(14), mt: u(6) }}>
        <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(110), lineHeight: 1, color: sc.priceGreen }}>{tbNumber(member.banked_rewards)}</Box>
        <Box sx={{ fontSize: u(30), color: sc.ink2 }}>ready to use</Box>
      </Box>
      {toCents(credit) > 0 && (
        <Box sx={{ fontSize: u(28), color: sc.ink2, mt: u(8) }}>
          Plus <Box component="span" sx={{ fontWeight: 800, color: sc.ink }}>{money(credit)}</Box> Thrift+ credit.
        </Box>
      )}

      <Box sx={{ mt: u(34), fontFamily: sc.condensed, fontWeight: 700, fontSize: u(38), color: sc.titleGreen }}>Used in this order at the register</Box>
      {me.isLoading ? (
        <Box sx={{ py: u(30), textAlign: 'center' }}><CircularProgress size={28} sx={{ color: sc.green }} /></Box>
      ) : rows.length === 0 ? (
        <Box sx={{ mt: u(16), fontSize: u(28), color: sc.ink3 }}>Nothing yet. ThriftBucks you collect show up here the next day.</Box>
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

      <Box sx={{ mt: u(28), fontSize: u(24), color: sc.ink3, lineHeight: 1.4 }}>
        ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value.
      </Box>
      <Box sx={{ mt: u(20), display: 'flex', justifyContent: 'center', gap: u(20) }}>
        <ButtonBase onClick={onAccount} data-testid="my-account" sx={link}>My account</ButtonBase>
        <ButtonBase onClick={onSignOut} data-testid="sign-out" sx={link}>Sign out</ButtonBase>
      </Box>
    </Sheet>
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
