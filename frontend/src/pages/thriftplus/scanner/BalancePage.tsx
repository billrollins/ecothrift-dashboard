/**
 * Rewards Balance (owner, 2026-10-09): tap the tile to see everything, in the order it is used at the register:
 * Return $ first (store credit from returns, never expires), then saved rewards with the soonest use-by date first,
 * then today's instant rewards when the member chose them.
 */
import { Box, ButtonBase } from '@mui/material';
import { toCents, type ThriftPlusCart, type ThriftPlusMember } from '../../../api/thriftPlusMock';
import { money } from './scannerLogic';
import { art, sc, u } from './scannerTheme';
import { useMe } from './useThriftPlus';

function shortDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Row({ step, title, note, amount, muted }: { step: number; title: string; note: string; amount: string; muted?: boolean }) {
  return (
    <Box data-testid="balance-row" sx={{ display: 'flex', alignItems: 'center', gap: u(20), py: u(22), borderTop: `1px solid ${sc.line}` }}>
      <Box sx={{ width: u(54), height: u(54), borderRadius: 99, bgcolor: sc.greenTint, color: sc.priceGreen, fontWeight: 700,
        fontSize: u(28), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {step}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: u(31), fontWeight: 700, color: muted ? sc.ink3 : sc.ink }}>{title}</Box>
        <Box sx={{ fontSize: u(26), color: muted ? sc.ink3 : sc.ink2, lineHeight: 1.3 }}>{note}</Box>
      </Box>
      <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(44), color: muted ? sc.ink3 : sc.priceGreen, whiteSpace: 'nowrap' }}>
        {amount}
      </Box>
    </Box>
  );
}

export function BalancePage({ member, cart, onBack }: { member: ThriftPlusMember; cart: ThriftPlusCart | undefined; onBack: () => void }) {
  const me = useMe();
  const credit = me.data?.credit ?? member.credit_balance;
  const lots = me.data?.rewards ?? [];
  const instant = cart?.reward_choice === 'instant' ? cart.totals.instant_value ?? '0.00' : '0.00';
  let step = 0;

  return (
    <Box
      data-testid="balance-page"
      sx={{
        position: 'absolute', inset: 0, zIndex: 12, display: 'flex', flexDirection: 'column', fontFamily: sc.font,
        background: `radial-gradient(ellipse at 50% 30%, ${sc.pageLight} 0%, ${sc.page} 70%)`,
        animation: 'tpSlideIn 180ms ease-out',
        '@keyframes tpSlideIn': { from: { transform: 'translateX(30px)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: u(12), px: u(24), pt: `calc(env(safe-area-inset-top, 0px) + ${u(20)})`,
        pb: u(20), bgcolor: sc.card, boxShadow: '0 1px 0 #e7e8e3', flexShrink: 0 }}>
        <ButtonBase onClick={onBack} aria-label="Back to scanner" sx={{ borderRadius: 99, p: u(14) }}>
          <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: u(52), height: u(52) }}>
            <path d="M15.5 4 L7.5 12 L15.5 20" fill="none" stroke={sc.ink2} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </Box>
        </ButtonBase>
        <Box sx={{ flex: 1, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(50), color: sc.titleGreen }}>Rewards Balance</Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', px: u(30), pb: `calc(env(safe-area-inset-bottom, 0px) + ${u(50)})` }}>
        <Box sx={{ mt: u(30), p: u(40), bgcolor: sc.card, borderRadius: u(36), boxShadow: sc.tileShadow, display: 'flex',
          alignItems: 'center', gap: u(26) }}>
          <Box component="img" src={art.brick} alt="" sx={{ width: u(130), height: u(130), flexShrink: 0 }} />
          <Box>
            <Box sx={{ fontSize: u(30), color: sc.ink2 }}>Rewards Balance</Box>
            <Box data-testid="balance-total" sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(92), lineHeight: 1.05, color: sc.priceGreen }}>
              {money(member.banked_rewards)}
            </Box>
            {toCents(credit) > 0 && <Box sx={{ fontSize: u(28), color: sc.ink2 }}>plus {money(credit)} Return $</Box>}
          </Box>
        </Box>

        <Box sx={{ mt: u(30), p: u(34), pt: u(24), bgcolor: sc.card, borderRadius: u(36), boxShadow: sc.tileShadow }}>
          <Box sx={{ fontSize: u(30), fontWeight: 700, color: sc.titleGreen, mb: u(8) }}>In the order they're used</Box>
          {toCents(credit) > 0 && (
            <Row step={++step} title="Return $" note="Store credit from returns. Always used first. Never expires." amount={money(credit)} />
          )}
          {lots.map((lot) => (
            <Row
              key={`${lot.earned_on}-${lot.use_by}-${lot.amount}`}
              step={++step}
              title="Rewards"
              note={lot.past_due ? `Use by ${shortDay(lot.use_by)} (past its date)` : `Earned ${shortDay(lot.earned_on)}. Use by ${shortDay(lot.use_by)}`}
              amount={money(lot.amount)}
              muted={lot.past_due}
            />
          ))}
          {toCents(instant) > 0 && (
            <Row step={++step} title="Today's instant rewards" note="You chose Instant: 80% comes off today's price." amount={money(instant)} />
          )}
          {step === 0 && (
            <Box sx={{ fontSize: u(28), color: sc.ink2, lineHeight: 1.4, py: u(16) }}>
              {me.isLoading ? 'Loading your rewards…' : 'No rewards saved yet. Past this month\'s cover, the rewards on what you buy land here, good for 30 days.'}
            </Box>
          )}
        </Box>

        <Box sx={{ fontSize: u(25), color: sc.ink3, mt: u(24), lineHeight: 1.4, textAlign: 'center' }}>
          Rewards have no cash value. Each is good for 30 days after the receipt it was earned on.
        </Box>
      </Box>
    </Box>
  );
}
