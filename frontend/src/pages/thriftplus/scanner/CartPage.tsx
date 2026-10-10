import { useMemo, useState } from 'react';
import { Box, ButtonBase, InputBase } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  toCents,
  type RewardChoice,
  type ThriftPlusCart,
  type ThriftPlusHistoryEntry,
  type ThriftPlusItemCard,
  type ThriftPlusMember,
} from '../../../api/thriftPlusMock';
import { TbAmount, tbText } from '../../../components/thriftplus/ThriftBucks';
import { money } from './scannerLogic';
import { useScannerLook } from './scannerLook';
import { CategoryBadge, art, sc, u } from './scannerTheme';
import { useCartActions, useThriftPlusHistory } from './useThriftPlus';

interface Props {
  cart: ThriftPlusCart | undefined;
  member: ThriftPlusMember | null;
  isGuest: boolean;
  onBack: () => void;
  /** Adds go through the scanner so the first one can ask bank-or-rebate. */
  onAdd: (item: ThriftPlusItemCard) => void;
  onExplain: (topic: 'bank' | 'cart', from: HTMLElement) => void;
  onTour: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  /** Members only: opens My account. */
  onAccount?: () => void;
}

const cents = (m: string) => toCents(m);

/** My list (owner 2026-10-10: simple): the ThriftBucks on it, the items, then everything you scanned. No $ totals. */
export function CartPage({ cart, member, isGuest, onBack, onAdd, onExplain, onTour, onSignIn, onSignOut, onAccount }: Props) {
  const actions = useCartActions();
  const history = useThriftPlusHistory();
  const lines = cart?.lines ?? [];
  const inCart = useMemo(() => new Set(lines.map((l) => l.item.sku)), [lines]);

  return (
    <Box
      data-testid="cart-page"
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        background: `radial-gradient(ellipse at 50% 30%, ${sc.pageLight} 0%, ${sc.page} 70%)`,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: sc.font,
        animation: 'tpSlideIn 180ms ease-out',
        '@keyframes tpSlideIn': { from: { transform: 'translateX(30px)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
      }}
    >
      {/* Top bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: u(12),
          px: u(24),
          pt: `calc(env(safe-area-inset-top, 0px) + ${u(20)})`,
          pb: u(20),
          bgcolor: sc.card,
          boxShadow: '0 1px 0 #e7e8e3',
          flexShrink: 0,
        }}
      >
        <ButtonBase onClick={onBack} aria-label="Back to scanner" sx={{ borderRadius: 99, p: u(14) }}>
          <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: u(52), height: u(52) }}>
            <path d="M15.5 4 L7.5 12 L15.5 20" fill="none" stroke={sc.ink2} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </Box>
        </ButtonBase>
        <Box sx={{ flex: 1, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(50), color: sc.titleGreen }}>My list</Box>
        {lines.length > 0 && (
          <ButtonBase onClick={() => actions.clear.mutate()} sx={{ px: u(24), py: u(12), borderRadius: 99, color: sc.ink2, fontSize: u(29) }}>
            Clear
          </ButtonBase>
        )}
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', px: u(30), pb: `calc(env(safe-area-inset-bottom, 0px) + ${u(50)})` }}>
        {lines.length === 0 ? (
          <Panel sx={{ mt: u(30), textAlign: 'center', py: u(60) }}>
            <Box component="img" src={art.cart} alt="" sx={{ width: u(120), height: u(120), opacity: 0.9 }} />
            <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(44), color: sc.titleGreen, mt: u(16) }}>Your list is empty</Box>
            <Box sx={{ fontSize: u(30), color: sc.ink2, mt: u(8) }}>Scan a tag and swipe right to add it.</Box>
          </Panel>
        ) : (
          cart && (
            <>
              <Summary cart={cart} isGuest={isGuest} onExplain={onExplain} onSignIn={onSignIn} />

              <SectionTitle>
                {cart.totals.item_count} {cart.totals.item_count === 1 ? 'item' : 'items'}
              </SectionTitle>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: u(16) }}>
                {lines.map((l) => (
                  <Panel key={l.item.sku} data-testid="cart-line" sx={{ p: u(24), display: 'flex', gap: u(20) }}>
                    <CategoryBadge category={l.item.category} size={u(84)} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: u(16) }}>
                        <Box sx={{ flex: 1, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(36), lineHeight: 1.15, color: sc.titleGreen }}>
                          {l.item.title}
                        </Box>
                        <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(38), lineHeight: 1.1, color: sc.ink, whiteSpace: 'nowrap' }}>
                          {money(cents(l.item.price) * l.qty)}
                        </Box>
                      </Box>
                      <Box data-testid="line-prices" sx={{ display: 'flex', gap: u(18), flexWrap: 'wrap', fontSize: u(26), color: sc.ink2, mt: u(6) }}>
                        {l.item.retail_price && (
                          <Box component="span">
                            MSRP <Box component="span" sx={{ textDecoration: 'line-through' }}>{money(l.item.retail_price)}</Box>
                          </Box>
                        )}
                        <Box component="span">Tag {money(l.item.price)}</Box>
                        {cents(l.item.reward) > 0 && (
                          <Box component="span" sx={{ color: sc.green, fontWeight: 700 }}>ThriftBucks <TbAmount value={l.item.reward} sign="+" bare /></Box>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: u(16), mt: u(14), flexWrap: 'wrap' }}>
                        <Stepper
                          qty={l.qty}
                          onMinus={() => actions.setQty.mutate({ sku: l.item.sku, qty: l.qty - 1 })}
                          onPlus={() => actions.setQty.mutate({ sku: l.item.sku, qty: l.qty + 1 })}
                        />
                        <Box sx={{ flex: 1 }} />
                        <ButtonBase
                          aria-label={`Remove ${l.item.title}`}
                          onClick={() => actions.remove.mutate(l.item.sku)}
                          sx={{ borderRadius: 99, p: u(10), color: sc.ink3 }}
                        >
                          <DeleteOutlineRounded sx={{ fontSize: u(44) }} />
                        </ButtonBase>
                      </Box>
                    </Box>
                  </Panel>
                ))}
              </Box>
            </>
          )
        )}

        <HistoryList entries={history.data ?? []} inCart={inCart} onAdd={onAdd} />

        <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: u(20), mt: u(40) }}>
          <ButtonBase onClick={onTour} sx={{ px: u(30), py: u(16), borderRadius: 99, color: sc.priceGreen, fontSize: u(28), fontWeight: 700 }}>
            How Thrift+ works
          </ButtonBase>
          {onAccount && (
            <ButtonBase onClick={onAccount} sx={{ px: u(30), py: u(16), borderRadius: 99, color: sc.priceGreen, fontSize: u(28), fontWeight: 700 }}>
              My account
            </ButtonBase>
          )}
          <ButtonBase onClick={onSignOut} sx={{ px: u(30), py: u(16), borderRadius: 99, color: sc.ink2, fontSize: u(28) }}>
            {member ? 'Sign out' : 'Sign in'}
          </ButtonBase>
        </Box>
      </Box>
    </Box>
  );
}

/** The top card: the estimate in big type, and what this trip's rewards do. */
/**
 * The top of My list (owner 2026-10-10: as simple as possible). The ThriftBucks the list collects, and one line: the
 * register uses ThriftBucks and Return $ itself and has the final price. No totals, tax, cover math or InstantBucks.
 */
function Summary({
  cart,
  isGuest,
  onExplain,
  onSignIn,
}: {
  cart: ThriftPlusCart;
  isGuest: boolean;
  onExplain: (topic: 'bank' | 'cart', from: HTMLElement) => void;
  onSignIn: () => void;
}) {
  const t = cart.totals;
  const hasTb = cents(t.reward_total) > 0;
  return (
    <Panel sx={{ mt: u(30), p: u(40) }}>
      {hasTb && (
        <ButtonBase
          onClick={(e) => onExplain('cart', e.currentTarget)}
          aria-label={`${isGuest ? 'Members collect' : 'ThriftBucks on this list,'} ${tbText(t.reward_total)}. What is this?`}
          sx={{ width: '100%', display: 'block', textAlign: 'left', borderRadius: u(12) }}
        >
          <Box sx={{ fontSize: u(30), color: sc.ink2, display: 'flex', alignItems: 'center', gap: u(10) }}>
            {isGuest ? 'Members collect on this list' : 'ThriftBucks on this list'} <InfoDot />
          </Box>
          <Box data-testid="list-tb" sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(96), lineHeight: 1.05, color: sc.green }}>
            <TbAmount value={t.reward_total} sign="+" />
          </Box>
        </ButtonBase>
      )}
      <Box data-testid="list-note" sx={{ fontSize: u(27), color: sc.ink3, mt: u(10), lineHeight: 1.4 }}>
        {isGuest
          ? 'Guests pay the tag price. Cards are free at the register.'
          : 'The register uses your ThriftBucks and Return $ automatically and has the final price.'}
      </Box>
      {isGuest && hasTb && (
        <ButtonBase onClick={onSignIn} sx={{ mt: u(16), fontWeight: 700, color: sc.priceGreen, fontSize: u(30), borderRadius: u(12) }}>
          I have a card. Sign in
        </ButtonBase>
      )}
    </Panel>
  );
}

function HistoryList({
  entries,
  inCart,
  onAdd,
}: {
  entries: ThriftPlusHistoryEntry[];
  inCart: Set<string>;
  onAdd: (item: ThriftPlusItemCard) => void;
}) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) => `${e.item.title} ${e.item.category_label} ${e.item.sku}`.toLowerCase().includes(needle));
  }, [entries, q]);

  // Day headers keep a long history easy to skim.
  const groups = useMemo(() => {
    const out: Array<{ day: string; rows: ThriftPlusHistoryEntry[] }> = [];
    for (const e of shown) {
      const day = dayLabel(e.scanned_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.rows.push(e);
      else out.push({ day, rows: [e] });
    }
    return out;
  }, [shown]);

  if (entries.length === 0) return null;

  return (
    <Box>
      <SectionTitle>Scanned</SectionTitle>
      {entries.length > 6 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: u(14),
            bgcolor: sc.card,
            borderRadius: 99,
            px: u(28),
            py: u(10),
            mb: u(18),
            border: `1px solid ${sc.line}`,
          }}
        >
          <SearchRounded sx={{ color: sc.ink3, fontSize: u(40) }} />
          <InputBase
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your scans"
            inputProps={{ 'aria-label': 'Search your scans' }}
            sx={{ flex: 1, fontSize: 16 }}
          />
        </Box>
      )}
      {groups.map((g) => (
        <Box key={g.day}>
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              bgcolor: sc.page,
              fontSize: u(25),
              fontWeight: 700,
              color: sc.ink3,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              py: u(12),
            }}
          >
            {g.day}
          </Box>
          {g.rows.map((e) => {
            const added = inCart.has(e.item.sku);
            return (
              <Panel
                key={e.item.sku}
                data-testid="history-row"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: u(20),
                  p: u(18),
                  pl: u(22),
                  mb: u(12),
                  contentVisibility: 'auto',
                  containIntrinsicSize: `auto ${u(120)}`,
                }}
              >
                <CategoryBadge category={e.item.category} size={u(76)} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(32), lineHeight: 1.15, color: sc.titleGreen }}>
                    {e.item.title}
                  </Box>
                  <Box sx={{ fontSize: u(26), color: sc.ink2, mt: u(4) }}>
                    {money(e.item.price)}
                    {cents(e.item.reward) > 0 && (
                      <Box component="span" sx={{ color: sc.green, fontWeight: 700 }}>
                        {'  '}<TbAmount value={e.item.reward} sign="+" />
                      </Box>
                    )}
                    {!e.item.available && (
                      <Box component="span" sx={{ color: sc.badText, fontWeight: 700 }}>
                        {'  '}Sold
                      </Box>
                    )}
                  </Box>
                </Box>
                <ButtonBase
                  disabled={added || !e.item.available}
                  onClick={() => onAdd(e.item)}
                  aria-label={added ? `${e.item.title} is in your cart` : `Add ${e.item.title}`}
                  sx={{
                    gap: u(6),
                    px: u(24),
                    height: u(68),
                    borderRadius: 99,
                    fontSize: u(27),
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    color: added ? sc.priceGreen : '#fff',
                    bgcolor: added ? sc.greenTint : sc.green,
                    opacity: !e.item.available ? 0.4 : 1,
                  }}
                >
                  {added ? <CheckRounded sx={{ fontSize: u(36) }} /> : <AddRounded sx={{ fontSize: u(36) }} />}
                  {added ? 'In cart' : 'Add'}
                </ButtonBase>
              </Panel>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

/** A small "i" that marks something you can tap to learn about. */
function InfoDot() {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: 'inline-grid',
        placeItems: 'center',
        width: u(34),
        height: u(34),
        borderRadius: '50%',
        border: `${u(3)} solid ${sc.ink3}`,
        color: sc.ink3,
        fontSize: u(22),
        fontWeight: 700,
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
        lineHeight: 1,
      }}
    >
      i
    </Box>
  );
}

function Stepper({ qty, onMinus, onPlus }: { qty: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#f3f4f0', borderRadius: 99 }}>
      <ButtonBase onClick={onMinus} aria-label={qty === 1 ? 'Remove' : 'One less'} sx={{ p: u(12), borderRadius: 99 }}>
        <RemoveRounded sx={{ fontSize: u(36), color: sc.ink2 }} />
      </ButtonBase>
      <Box data-testid="qty" sx={{ minWidth: u(36), textAlign: 'center', fontWeight: 700, fontSize: u(30) }}>
        {qty}
      </Box>
      <ButtonBase onClick={onPlus} aria-label="One more" sx={{ p: u(12), borderRadius: 99 }}>
        <AddRounded sx={{ fontSize: u(36), color: sc.ink2 }} />
      </ButtonBase>
    </Box>
  );
}

function Panel({ children, sx, ...rest }: { children: React.ReactNode; sx?: object; 'data-testid'?: string }) {
  return (
    <Box {...rest} sx={{ bgcolor: sc.card, borderRadius: u(32), boxShadow: sc.tileShadow, border: '1px solid #ecede8', ...sx }}>
      {children}
    </Box>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Box sx={{ fontSize: u(30), fontWeight: 700, color: sc.ink2, mt: u(44), mb: u(16) }}>{children}</Box>;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
