import { useMemo, useState } from 'react';
import { Box, ButtonBase, InputBase } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  thriftPlusMockControls,
  toCents,
  type RewardChoice,
  type ThriftPlusCart,
  type ThriftPlusHistoryEntry,
  type ThriftPlusItemCard,
  type ThriftPlusMember,
} from '../../../api/thriftPlusMock';
import { money } from './scannerLogic';
import { CategoryBadge, art, sc, u } from './scannerTheme';
import { useCartActions, useThriftPlusHistory } from './useThriftPlus';

interface Props {
  cart: ThriftPlusCart | undefined;
  member: ThriftPlusMember | null;
  isGuest: boolean;
  onBack: () => void;
  /** Adds go through the scanner so the first one can ask bank-or-rebate. */
  onAdd: (item: ThriftPlusItemCard) => void;
  onChoose: (choice: RewardChoice) => void;
  onExplain: (topic: 'bank' | 'cart', from: HTMLElement) => void;
  onTour: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

const cents = (m: string) => toCents(m);

/** The cart: what you'll pay, what your rewards do, the items, then everything you scanned. */
export function CartPage({ cart, member, isGuest, onBack, onAdd, onChoose, onExplain, onTour, onSignIn, onSignOut }: Props) {
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
        <Box sx={{ flex: 1, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(50), color: sc.titleGreen }}>Your cart</Box>
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
            <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(44), color: sc.titleGreen, mt: u(16) }}>Your cart is empty</Box>
            <Box sx={{ fontSize: u(30), color: sc.ink2, mt: u(8) }}>Scan a tag and swipe right to add it.</Box>
          </Panel>
        ) : (
          cart && (
            <>
              <Summary cart={cart} member={member} isGuest={isGuest} onChoose={onChoose} onExplain={onExplain} onSignIn={onSignIn} />

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
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: u(16), mt: u(14), flexWrap: 'wrap' }}>
                        <Stepper
                          qty={l.qty}
                          onMinus={() => actions.setQty.mutate({ sku: l.item.sku, qty: l.qty - 1 })}
                          onPlus={() => actions.setQty.mutate({ sku: l.item.sku, qty: l.qty + 1 })}
                        />
                        {cents(l.item.reward) > 0 && (
                          <Box sx={{ fontSize: u(28), fontWeight: 700, color: sc.green, whiteSpace: 'nowrap' }}>
                            +{money(cents(l.item.reward) * l.qty)} reward
                          </Box>
                        )}
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
          <ButtonBase onClick={onSignOut} sx={{ px: u(30), py: u(16), borderRadius: 99, color: sc.ink2, fontSize: u(28) }}>
            {member ? 'Sign out' : 'Sign in'}
          </ButtonBase>
          <ButtonBase
            onClick={() => {
              thriftPlusMockControls.reset();
              try {
                window.localStorage.removeItem('thriftPlus.introSeen');
              } catch {
                // Blocked storage: nothing to forget.
              }
              window.location.reload();
            }}
            sx={{ px: u(30), py: u(16), borderRadius: 99, color: sc.ink3, fontSize: u(28) }}
          >
            Start over (mock)
          </ButtonBase>
        </Box>
      </Box>
    </Box>
  );
}

/** The top card: the estimate in big type, and what this trip's rewards do. */
function Summary({
  cart,
  member,
  isGuest,
  onChoose,
  onExplain,
  onSignIn,
}: {
  cart: ThriftPlusCart;
  member: ThriftPlusMember | null;
  isGuest: boolean;
  onChoose: (c: RewardChoice) => void;
  onExplain: (topic: 'bank' | 'cart', from: HTMLElement) => void;
  onSignIn: () => void;
}) {
  const t = cart.totals;
  const banking = cart.reward_choice === 'bank';
  const total = isGuest ? t.price_total : t.member_total;
  const hasRewards = cents(t.reward_total) > 0;
  const rebate = cents(t.bank_value) - cents(t.bank_extra);

  return (
    <Panel sx={{ mt: u(30), p: u(40) }}>
      <Box sx={{ fontSize: u(30), color: sc.ink2 }}>{isGuest ? 'Guest total' : 'Estimated total'}</Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: u(20), flexWrap: 'wrap' }}>
        <Box data-testid="cart-total" sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(96), lineHeight: 1.05, color: sc.priceGreen }}>
          {money(total)}
        </Box>
        {!isGuest && cents(t.savings) > 0 && (
          <Box sx={{ fontSize: u(30), color: sc.ink3, textDecoration: 'line-through' }}>{money(t.price_total)}</Box>
        )}
      </Box>
      <Box sx={{ fontSize: u(27), color: sc.ink3, mt: u(4) }}>Before tax. The register has the final price.</Box>

      {hasRewards && member && (
        <>
          <Box sx={{ height: '1px', bgcolor: sc.line, my: u(30) }} />
          <ButtonBase
            onClick={(e) => onExplain('cart', e.currentTarget)}
            aria-label={`Rewards on this cart, ${money(t.reward_total)}. What is this?`}
            sx={{ width: '100%', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: u(20), borderRadius: u(12) }}
          >
            <Box sx={{ fontSize: u(32), color: sc.ink, display: 'flex', alignItems: 'center', gap: u(10) }}>
              Rewards on this cart <InfoDot />
            </Box>
            <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(46), color: sc.green, whiteSpace: 'nowrap' }}>
              +{money(t.reward_total)}
            </Box>
          </ButtonBase>
          {cents(t.to_cover) > 0 && (
            <Box sx={{ fontSize: u(27), color: sc.ink2, mt: u(6), lineHeight: 1.35 }}>
              The first {money(t.to_cover)} finishes this month's card cover.
            </Box>
          )}

          {cents(t.bank_value) > 0 && (
            <>
              <Box role="radiogroup" aria-label="Your rewards this trip" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: u(18), mt: u(28) }}>
                <ChoiceCard
                  selected={banking}
                  onClick={() => onChoose('bank')}
                  label="Bank them"
                  amount={`+${money(t.bank_value)}`}
                  note="for your next trip"
                  tag={`${t.bank_extra_pct}% more`}
                />
                <ChoiceCard
                  selected={cart.reward_choice === 'instant'}
                  onClick={() => onChoose('instant')}
                  label="Instant rebate"
                  amount={`-${money(rebate)}`}
                  note="off today's price"
                />
              </Box>
              <Box sx={{ fontSize: u(26), color: sc.ink3, mt: u(16), lineHeight: 1.35 }}>
                {banking ? 'Banking adds' : 'Banking would add'} {money(t.bank_extra)} more. The register gets your choice; tell the
                cashier too.{' '}
                <ButtonBase
                  onClick={(e) => onExplain('bank', e.currentTarget)}
                  sx={{ fontSize: 'inherit', color: sc.priceGreen, fontWeight: 700, verticalAlign: 'baseline', borderRadius: u(8) }}
                >
                  What's banking?
                </ButtonBase>
              </Box>
            </>
          )}
        </>
      )}

      {isGuest && hasRewards && (
        <Box sx={{ mt: u(30), p: u(30), borderRadius: u(28), bgcolor: sc.greenTint }}>
          <Box sx={{ fontSize: u(32), fontWeight: 700, color: sc.priceGreen }}>With a Thrift+ card: {money(t.member_total)}</Box>
          <Box sx={{ fontSize: u(28), color: sc.ink2, mt: u(6), lineHeight: 1.35 }}>
            Members earn {money(t.reward_total)} on this cart. Cards are free at the register.
          </Box>
          <ButtonBase onClick={onSignIn} sx={{ mt: u(16), fontWeight: 700, color: sc.priceGreen, fontSize: u(30), borderRadius: u(12) }}>
            I have a card. Sign in
          </ButtonBase>
        </Box>
      )}
    </Panel>
  );
}

function ChoiceCard({
  selected,
  onClick,
  label,
  amount,
  note,
  tag,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  amount: string;
  note: string;
  tag?: string;
}) {
  return (
    <ButtonBase
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onClick}
      sx={{
        position: 'relative',
        display: 'block',
        textAlign: 'left',
        p: u(24),
        pt: u(28),
        borderRadius: u(28),
        border: `${u(4)} solid ${selected ? sc.green : sc.line}`,
        bgcolor: selected ? '#f3faef' : '#fff',
        transition: 'border-color 120ms, background-color 120ms',
      }}
    >
      {selected && <CheckCircleRounded sx={{ position: 'absolute', top: u(16), right: u(16), fontSize: u(44), color: sc.green }} />}
      <Box sx={{ fontSize: u(29), fontWeight: 700, color: sc.ink, pr: u(40) }}>{label}</Box>
      <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(50), color: sc.priceGreen, lineHeight: 1.15, mt: u(6) }}>{amount}</Box>
      <Box sx={{ fontSize: u(25), color: sc.ink2, lineHeight: 1.3 }}>{note}</Box>
      {tag && (
        <Box
          sx={{
            display: 'inline-block',
            mt: u(12),
            px: u(16),
            py: u(4),
            borderRadius: 99,
            bgcolor: '#fff4cf',
            color: '#8a6200',
            fontSize: u(24),
            fontWeight: 700,
          }}
        >
          {tag}
        </Box>
      )}
    </ButtonBase>
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
                        {'  '}+{money(e.item.reward)}
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
