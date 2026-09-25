import { Box, ButtonBase } from '@mui/material';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import { toCents, type ThriftPlusCart, type ThriftPlusMember } from '../../../api/thriftPlusMock';
import { money } from './scannerLogic';
import { ThriftPlusLogo, art, sc, u } from './scannerTheme';

/** The field photo header. `tall` is the sign-in screen's bigger version. */
export function FieldBanner({ children, tall = false }: { children: React.ReactNode; tall?: boolean }) {
  return (
    <Box
      sx={{
        position: 'relative',
        flexShrink: 0,
        height: tall ? u(420) : u(158),
        pt: 'env(safe-area-inset-top, 0px)',
        boxSizing: 'content-box',
        backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.10)), url(${art.header})`,
        backgroundSize: 'cover',
        backgroundPosition: tall ? 'center 42%' : 'center 46%',
      }}
    >
      {children}
    </Box>
  );
}

export function ScannerTop({ cart, onOpenCart }: { cart: ThriftPlusCart | undefined; onOpenCart: () => void }) {
  const count = cart?.totals.item_count ?? 0;
  const rewards = cart?.totals.reward_total ?? '0.00';
  return (
    <FieldBanner>
      {/* The design column: full width on most phones, centered when a short screen scales it down. */}
      <Box sx={{ position: 'relative', width: u(900), height: '100%', mx: 'auto' }}>
        <Box sx={{ position: 'absolute', left: u(35), top: u(24) }}>
          <ThriftPlusLogo width={u(262)} />
        </Box>
        <ButtonBase
          onClick={onOpenCart}
          data-testid="cart-pill"
          aria-label={`Your cart: ${count} ${count === 1 ? 'item' : 'items'}, ${money(rewards)} in rewards`}
          sx={{
            position: 'absolute',
            right: u(30),
            top: u(40),
            height: u(82),
            px: u(30),
            gap: u(16),
            borderRadius: 99,
            bgcolor: '#fff',
            boxShadow: '0 4px 14px rgba(0,0,0,0.16)',
            fontFamily: sc.font,
            whiteSpace: 'nowrap',
          }}
        >
          <DescriptionRounded sx={{ fontSize: u(42), color: sc.greenDeep }} />
          <Box component="span" sx={{ fontSize: u(33), fontWeight: 500, color: sc.ink }}>
            {count} {count === 1 ? 'item' : 'items'}
          </Box>
          <Box component="span" sx={{ width: '2px', height: u(46), bgcolor: '#dadbd6' }} />
          <Box component="span" sx={{ fontSize: u(33), fontWeight: 700, color: sc.green }}>
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
      <Tile sx={{ mx: u(30), display: 'flex', alignItems: 'center', gap: u(24), px: u(34) }}>
        <Box component="img" src={art.coins} alt="" sx={{ width: u(100), height: u(100) }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: u(31), fontWeight: 700, color: sc.ink, lineHeight: 1.2 }}>Scanning as a guest</Box>
          <Box sx={{ fontSize: u(26), color: sc.ink2, lineHeight: 1.3, mt: u(4) }}>
            Members pay less. Cards are free at the register.
          </Box>
        </Box>
        <ButtonBase
          onClick={onSignIn}
          sx={{
            px: u(30),
            height: u(76),
            borderRadius: 99,
            bgcolor: sc.green,
            color: '#fff',
            fontWeight: 700,
            fontSize: u(28),
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
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
    <Box sx={{ display: 'grid', gridTemplateColumns: `${u(403)} ${u(413)}`, gap: u(24), mx: u(30) }}>
      <Tile sx={{ display: 'flex', alignItems: 'center', pl: u(25), pr: u(16) }}>
        <Box component="img" src={art.coins} alt="" sx={{ width: u(102), height: u(102), flexShrink: 0 }} />
        <Box sx={{ ml: u(20), whiteSpace: 'nowrap' }}>
          <Box sx={{ fontSize: u(27), color: sc.ink2, lineHeight: 1.2 }}>Banked rewards</Box>
          <Box
            sx={{
              fontFamily: sc.condensed,
              fontWeight: 700,
              fontSize: u(64),
              lineHeight: 1.05,
              color: sc.priceGreen,
              mt: u(6),
            }}
          >
            {money(member.banked_rewards)}
          </Box>
        </Box>
      </Tile>
      <Tile sx={{ display: 'flex', alignItems: 'center', pl: u(22), pr: u(26) }}>
        <Box component="img" src={art.cart} alt="" sx={{ width: u(72), height: u(72), flexShrink: 0 }} />
        <Box sx={{ ml: u(22), flex: 1, minWidth: 0, whiteSpace: 'nowrap' }}>
          <Box sx={{ fontSize: u(25), color: sc.ink2, lineHeight: 1.2 }}>
            {cover.is_covered ? 'Card covered' : "This month's cover"}
          </Box>
          <Box
            role="progressbar"
            aria-label="This month's cover"
            aria-valuemin={0}
            aria-valuemax={amount / 100}
            aria-valuenow={covered / 100}
            sx={{ position: 'relative', height: u(24), borderRadius: 99, bgcolor: '#e4e5e1', overflow: 'hidden', my: u(16) }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                width: `${((covered + pending) / amount) * 100}%`,
                borderRadius: 99,
                background: `repeating-linear-gradient(120deg, ${sc.greenBright} 0 ${u(8)}, #bfe3b2 ${u(8)} ${u(16)})`,
                transition: 'width 240ms ease',
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                width: `${(covered / amount) * 100}%`,
                borderRadius: 99,
                background: `linear-gradient(180deg, #6fcf52, ${sc.green})`,
                transition: 'width 240ms ease',
              }}
            />
          </Box>
          <Box sx={{ fontSize: u(27), color: sc.ink2, lineHeight: 1.2 }}>
            {money(cover.covered)} of {money(cover.amount)}
          </Box>
        </Box>
      </Tile>
    </Box>
  );
}

function Tile({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        height: u(184),
        bgcolor: sc.card,
        borderRadius: u(30),
        boxShadow: sc.tileShadow,
        border: '1px solid #ecede8',
        fontFamily: sc.font,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
