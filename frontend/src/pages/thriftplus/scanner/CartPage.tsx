import { useMemo, useState } from 'react';
import { Box, ButtonBase, InputBase, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { thriftPlusMockControls, toCents, type ThriftPlusCart, type ThriftPlusHistoryEntry, type ThriftPlusMember } from '../../../api/thriftPlusMock';
import { money } from './scannerLogic';
import { CategoryBadge, sc } from './scannerTheme';
import { useCartActions, useThriftPlusHistory } from './useThriftPlus';

interface Props {
  cart: ThriftPlusCart | undefined;
  member: ThriftPlusMember | null;
  isGuest: boolean;
  onBack: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

/** The cart as a checkout receipt, then everything they scanned. */
export function CartPage({ cart, member, isGuest, onBack, onSignIn, onSignOut }: Props) {
  const actions = useCartActions();
  const history = useThriftPlusHistory();
  const lines = cart?.lines ?? [];
  const t = cart?.totals;
  const inCart = useMemo(() => new Set(lines.map((l) => l.item.sku)), [lines]);
  const now = new Date();

  return (
    <Box
      data-testid="cart-page"
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        bgcolor: sc.page,
        display: 'flex',
        flexDirection: 'column',
        animation: 'tpSlideIn 180ms ease-out',
        '@keyframes tpSlideIn': { from: { transform: 'translateX(30px)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          pt: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          pb: 1,
          bgcolor: sc.card,
          borderBottom: `1px solid ${sc.line}`,
        }}
      >
        <ButtonBase onClick={onBack} aria-label="Back to scanner" sx={{ borderRadius: 99, p: 1 }}>
          <ArrowBackRounded />
        </ButtonBase>
        <Typography sx={{ flex: 1, fontSize: 20, fontWeight: 800 }}>Your cart</Typography>
        {lines.length > 0 && (
          <ButtonBase onClick={() => actions.clear.mutate()} sx={{ px: 1.5, py: 0.75, borderRadius: 99, color: sc.ink2, fontSize: 14 }}>
            Clear
          </ButtonBase>
        )}
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', pb: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
        {/* Receipt */}
        <Box sx={{ px: 2, pt: 2 }}>
          <Box
            sx={{
              bgcolor: sc.card,
              borderRadius: '14px 14px 0 0',
              boxShadow: sc.shadow,
              px: 2,
              pt: 2,
              pb: 3,
              fontFamily: sc.mono,
              // Torn-paper bottom edge.
              WebkitMask:
                'linear-gradient(#000 0 0) top / 100% calc(100% - 10px) no-repeat, conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom / 20px 10px repeat-x',
              mask: 'linear-gradient(#000 0 0) top / 100% calc(100% - 10px) no-repeat, conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom / 20px 10px repeat-x',
            }}
          >
            <Box sx={{ textAlign: 'center', mb: 1.5 }}>
              <Typography sx={{ fontFamily: sc.mono, fontWeight: 700, fontSize: 16, letterSpacing: '0.12em' }}>
                ECO-THRIFT · THRIFT+
              </Typography>
              <Typography sx={{ fontFamily: sc.mono, fontSize: 12, color: sc.ink3 }}>
                {now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                {member ? `  ·  Member ${member.card_last4 ? `card ${member.card_last4}` : `phone ${member.phone_last4}`}` : '  ·  Guest'}
              </Typography>
            </Box>
            <Dashed />

            {lines.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography sx={{ fontFamily: sc.font, fontSize: 17, fontWeight: 700 }}>Your cart is empty</Typography>
                <Typography sx={{ fontFamily: sc.font, fontSize: 15, color: sc.ink2, mt: 0.5 }}>
                  Scan a tag and swipe right to add it.
                </Typography>
              </Box>
            ) : (
              lines.map((l) => (
                <Box key={l.item.sku} data-testid="cart-line" sx={{ py: 1.25, borderBottom: `1px dotted ${sc.line}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                    <Typography sx={{ fontFamily: sc.font, fontWeight: 700, fontSize: 16, flex: 1, minWidth: 0 }} noWrap>
                      {l.item.title}
                    </Typography>
                    <Typography sx={{ fontFamily: sc.mono, fontSize: 16, fontWeight: 600 }}>
                      {money(toCents(l.item.price) * l.qty)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
                    <Stepper
                      qty={l.qty}
                      onMinus={() => actions.setQty.mutate({ sku: l.item.sku, qty: l.qty - 1 })}
                      onPlus={() => actions.setQty.mutate({ sku: l.item.sku, qty: l.qty + 1 })}
                    />
                    <Typography sx={{ fontFamily: sc.mono, fontSize: 13, color: sc.ink3 }}>
                      {l.qty > 1 ? `${l.qty} x ${money(l.item.price)}` : `tag ${money(l.item.price)}`}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    {Number.parseFloat(l.item.reward) > 0 && (
                      <Typography sx={{ fontFamily: sc.mono, fontSize: 14, color: sc.green, fontWeight: 600 }}>
                        +{money(toCents(l.item.reward) * l.qty)}
                      </Typography>
                    )}
                    <ButtonBase
                      aria-label={`Remove ${l.item.title}`}
                      onClick={() => actions.remove.mutate(l.item.sku)}
                      sx={{ borderRadius: 99, p: 0.5, color: sc.ink3 }}
                    >
                      <DeleteOutlineRounded fontSize="small" />
                    </ButtonBase>
                  </Box>
                </Box>
              ))
            )}

            {t && lines.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Line label={`Subtotal (${t.item_count} ${t.item_count === 1 ? 'item' : 'items'})`} value={money(t.price_total)} />
                {isGuest ? (
                  <>
                    <Dashed />
                    <Line label="Guest total" value={money(t.price_total)} strong />
                    <Box
                      sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: sc.greenTint, fontFamily: sc.font }}
                    >
                      <Typography sx={{ fontSize: 15, fontWeight: 700, color: sc.greenDeep }}>
                        With a Thrift+ card: {money(t.member_total)}
                      </Typography>
                      <Typography sx={{ fontSize: 14, color: sc.ink2, mt: 0.25 }}>
                        Members earn {money(t.reward_total)} on this cart. Cards are free at the register.
                      </Typography>
                      <ButtonBase onClick={onSignIn} sx={{ mt: 1, fontWeight: 800, color: sc.greenDeep, fontSize: 15 }}>
                        I have a card. Sign in
                      </ButtonBase>
                    </Box>
                  </>
                ) : (
                  <>
                    <Line label="Rewards off your price" value={`-${money(t.savings)}`} tone="green" />
                    <Dashed />
                    <Line label="Estimated total" value={money(t.member_total)} strong />
                    <Typography sx={{ fontFamily: sc.font, fontSize: 13, color: sc.ink2, mt: 1 }}>
                      You earn {money(t.reward_total)} in rewards on this cart
                      {Number.parseFloat(t.to_cover) > 0
                        ? `. The first ${money(t.to_cover)} finishes this month's cover.`
                        : '.'}
                    </Typography>
                  </>
                )}
                <Typography sx={{ fontFamily: sc.font, fontSize: 12, color: sc.ink3, mt: 1 }}>
                  An estimate before tax. The register has the final price.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        <HistoryList
          entries={history.data ?? []}
          inCart={inCart}
          onAdd={(item) => actions.add.mutate(item)}
        />

        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 3 }}>
          <ButtonBase onClick={onSignOut} sx={{ px: 2, py: 1, borderRadius: 99, color: sc.ink2, fontSize: 14 }}>
            {member ? 'Sign out' : 'Sign in'}
          </ButtonBase>
          <ButtonBase
            onClick={() => {
              thriftPlusMockControls.reset();
              window.location.reload();
            }}
            sx={{ px: 2, py: 1, borderRadius: 99, color: sc.ink3, fontSize: 14 }}
          >
            Start over (mock)
          </ButtonBase>
        </Box>
      </Box>
    </Box>
  );
}

function HistoryList({
  entries,
  inCart,
  onAdd,
}: {
  entries: ThriftPlusHistoryEntry[];
  inCart: Set<string>;
  onAdd: (item: ThriftPlusHistoryEntry['item']) => void;
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

  return (
    <Box sx={{ px: 2, pt: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 1 }}>
        <Typography sx={{ flex: 1, fontSize: 18, fontWeight: 800 }}>Scan history</Typography>
        <Typography sx={{ fontSize: 13, color: sc.ink3 }}>{entries.length} scanned</Typography>
      </Box>
      {entries.length > 6 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: sc.card, borderRadius: 99, px: 1.5, py: 0.5, mb: 1.5, border: `1px solid ${sc.line}` }}>
          <SearchRounded sx={{ color: sc.ink3 }} fontSize="small" />
          <InputBase
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your scans"
            inputProps={{ 'aria-label': 'Search your scans' }}
            sx={{ flex: 1, fontSize: 16 }}
          />
        </Box>
      )}
      {entries.length === 0 && (
        <Typography sx={{ fontSize: 15, color: sc.ink2 }}>Tags you scan show up here, so you can add them later.</Typography>
      )}
      {groups.map((g) => (
        <Box key={g.day}>
          <Typography
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              bgcolor: sc.page,
              fontSize: 13,
              fontWeight: 700,
              color: sc.ink3,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              py: 0.75,
            }}
          >
            {g.day}
          </Typography>
          {g.rows.map((e) => {
            const added = inCart.has(e.item.sku);
            return (
              <Box
                key={e.item.sku}
                data-testid="history-row"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  py: 1,
                  px: 1.25,
                  mb: 0.75,
                  bgcolor: sc.card,
                  borderRadius: 3,
                  border: `1px solid ${sc.line}`,
                  contentVisibility: 'auto',
                  containIntrinsicSize: '64px',
                }}
              >
                <CategoryBadge category={e.item.category} size={40} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 700 }} noWrap>
                    {e.item.title}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: sc.ink2 }} noWrap>
                    {money(e.item.price)}
                    {Number.parseFloat(e.item.reward) > 0 && (
                      <Box component="span" sx={{ color: sc.green, fontWeight: 700 }}>
                        {'  '}+{money(e.item.reward)}
                      </Box>
                    )}
                    {e.decision === 'passed' && !added && (
                      <Box component="span" sx={{ color: sc.ink3 }}>
                        {'  '}passed
                      </Box>
                    )}
                    {!e.item.available && (
                      <Box component="span" sx={{ color: sc.badText }}>
                        {'  '}sold
                      </Box>
                    )}
                  </Typography>
                </Box>
                <ButtonBase
                  disabled={added || !e.item.available}
                  onClick={() => onAdd(e.item)}
                  aria-label={added ? `${e.item.title} is in your cart` : `Add ${e.item.title}`}
                  sx={{
                    gap: 0.5,
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 99,
                    fontSize: 14,
                    fontWeight: 800,
                    color: added ? sc.greenDeep : '#fff',
                    bgcolor: added ? sc.greenTint : sc.green,
                    opacity: !e.item.available ? 0.4 : 1,
                  }}
                >
                  {added ? <CheckRounded fontSize="small" /> : <AddRounded fontSize="small" />}
                  {added ? 'In cart' : 'Add'}
                </ButtonBase>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

function Stepper({ qty, onMinus, onPlus }: { qty: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', border: `1px solid ${sc.line}`, borderRadius: 99, fontFamily: sc.font }}>
      <ButtonBase onClick={onMinus} aria-label={qty === 1 ? 'Remove' : 'One less'} sx={{ p: 0.6, borderRadius: 99 }}>
        {qty === 1 ? <DeleteOutlineRounded sx={{ fontSize: 18, color: sc.ink3 }} /> : <RemoveRounded sx={{ fontSize: 18 }} />}
      </ButtonBase>
      <Typography data-testid="qty" sx={{ minWidth: 22, textAlign: 'center', fontWeight: 700, fontSize: 15 }}>
        {qty}
      </Typography>
      <ButtonBase onClick={onPlus} aria-label="One more" sx={{ p: 0.6, borderRadius: 99 }}>
        <AddRounded sx={{ fontSize: 18 }} />
      </ButtonBase>
    </Box>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'green' }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.4 }}>
      <Typography sx={{ fontFamily: sc.mono, fontSize: strong ? 17 : 15, fontWeight: strong ? 700 : 400 }}>{label}</Typography>
      <Typography
        sx={{ fontFamily: sc.mono, fontSize: strong ? 19 : 15, fontWeight: strong ? 700 : 500, color: tone === 'green' ? sc.green : sc.ink }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function Dashed() {
  return <Box sx={{ borderTop: `2px dashed ${sc.line}`, my: 1 }} />;
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
