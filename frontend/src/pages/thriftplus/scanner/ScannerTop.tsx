import { Box, ButtonBase, Typography } from '@mui/material';
import PaidRounded from '@mui/icons-material/PaidRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import { toCents, type ThriftPlusCart, type ThriftPlusMember } from '../../../api/thriftPlusMock';
import { money } from './scannerLogic';
import { ThriftPlusLogo, sc } from './scannerTheme';

/** Sky over a field, drawn in CSS so the page needs no photo. */
export function FieldBanner({ children, tall = false }: { children: React.ReactNode; tall?: boolean }) {
  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: tall ? 220 : 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        pt: 'env(safe-area-inset-top, 0px)',
        background: [
          'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.18) 100%)',
          'repeating-linear-gradient(97deg, rgba(38,72,22,0.30) 0 2px, rgba(0,0,0,0) 2px 6px) bottom / 100% 42% no-repeat',
          'linear-gradient(180deg, #aebfcb 0%, #d7e0dc 34%, #c9d7a9 50%, #86ad55 64%, #5d8a36 82%, #416b25 100%)',
        ].join(', '),
      }}
    >
      {children}
    </Box>
  );
}

export function ScannerTop({
  cart,
  onOpenCart,
}: {
  cart: ThriftPlusCart | undefined;
  onOpenCart: () => void;
}) {
  const count = cart?.totals.item_count ?? 0;
  const rewards = cart?.totals.reward_total ?? '0.00';
  return (
    <FieldBanner>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pt: 1.25, pb: 1.5, gap: 0.75 }}>
        <ThriftPlusLogo size={38} />
        <Box
          sx={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(255,255,255,0.6)',
            borderRadius: 1,
            px: 0.6,
            alignSelf: 'flex-start',
            mt: 0.5,
          }}
        >
          MOCK
        </Box>
        <Box sx={{ flex: 1 }} />
        <ButtonBase
          onClick={onOpenCart}
          data-testid="cart-pill"
          aria-label={`Your cart: ${count} ${count === 1 ? 'item' : 'items'}, ${money(rewards)} in rewards`}
          sx={{
            bgcolor: '#fff',
            borderRadius: 99,
            px: 1.5,
            py: 0.9,
            gap: 1,
            boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
            fontSize: 16,
            fontWeight: 700,
            color: sc.ink,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <ReceiptLongRounded sx={{ color: sc.greenDeep, fontSize: 20 }} />
          <span>
            {count} {count === 1 ? 'item' : 'items'}
          </span>
          <Box component="span" sx={{ width: '1px', alignSelf: 'stretch', bgcolor: sc.line }} />
          <Box component="span" sx={{ color: sc.green, fontWeight: 800 }}>
            +{money(rewards)}
          </Box>
        </ButtonBase>
      </Box>
    </FieldBanner>
  );
}

export function ScannerTiles({
  member,
  cart,
  onSignIn,
}: {
  member: ThriftPlusMember | null;
  cart: ThriftPlusCart | undefined;
  onSignIn: () => void;
}) {
  if (!member) {
    return (
      <Tile sx={{ mx: 2, mt: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 800, color: sc.ink }}>Scanning as a guest</Typography>
          <Typography sx={{ fontSize: 14, color: sc.ink2 }}>Members pay less. Cards are free at the register.</Typography>
        </Box>
        <ButtonBase
          onClick={onSignIn}
          sx={{ px: 2, py: 1, borderRadius: 99, bgcolor: sc.green, color: '#fff', fontWeight: 800, fontSize: 15 }}
        >
          Sign in
        </ButtonBase>
      </Tile>
    );
  }

  const cover = member.cover;
  const amount = toCents(cover.amount) || 1;
  const covered = toCents(cover.covered);
  const pending = Math.min(toCents(cart?.totals.to_cover ?? '0'), amount - covered);

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 1.5, mx: 2, mt: 1.5 }}>
      <Tile sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PaidRounded sx={{ fontSize: 42, color: sc.gold, filter: 'drop-shadow(0 2px 2px rgba(183,134,12,0.35))' }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, color: sc.ink2 }} noWrap>
            Banked rewards
          </Typography>
          <Typography sx={{ fontSize: 'clamp(22px, 7vw, 30px)', fontWeight: 800, color: sc.greenDeep, lineHeight: 1.1 }}>
            {money(member.banked_rewards)}
          </Typography>
        </Box>
      </Tile>
      <Tile sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ShoppingCartRounded sx={{ fontSize: 34, color: sc.ink2 }} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 13, color: sc.ink2 }} noWrap>
            {cover.is_covered ? 'Card covered' : "This month's cover"}
          </Typography>
          <Box
            role="progressbar"
            aria-label="This month's cover"
            aria-valuemin={0}
            aria-valuemax={amount / 100}
            aria-valuenow={covered / 100}
            sx={{ position: 'relative', height: 10, borderRadius: 99, bgcolor: sc.track, overflow: 'hidden', my: 0.6 }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                width: `${((covered + pending) / amount) * 100}%`,
                borderRadius: 99,
                background: `repeating-linear-gradient(135deg, ${sc.greenBright} 0 4px, ${sc.greenTint} 4px 8px)`,
                transition: 'width 240ms ease',
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                width: `${(covered / amount) * 100}%`,
                borderRadius: 99,
                background: `linear-gradient(180deg, ${sc.greenBright}, ${sc.green})`,
                transition: 'width 240ms ease',
              }}
            />
          </Box>
          <Typography sx={{ fontSize: 13, color: sc.ink2 }} noWrap>
            {money(cover.covered)} of {money(cover.amount)}
          </Typography>
        </Box>
      </Tile>
    </Box>
  );
}

function Tile({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Box sx={{ bgcolor: sc.card, borderRadius: 4, boxShadow: sc.shadow, px: 1.5, py: 1.25, ...sx }}>{children}</Box>
  );
}
