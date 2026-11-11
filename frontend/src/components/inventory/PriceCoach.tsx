/**
 * Price coach (Dash Updates #89): plain facts at the check-in price box, from our own sales. "This same product:
 * 8 sold, all for $6.29, typically in 21 days. 109 on the shelf now at $6.29 to $9.74, 11 of them over 90 days."
 * Open it for the items it rests on. Facts only: it never changes or blocks a price, and on an error, a slow answer
 * or the owner's switch `inventory_price_coach` off it shows nothing. Server: `apps/inventory/services/price_coach.py`.
 *
 * It always names the group it speaks about. When that group is wider than this product it gives this product's
 * own record first, then one short line about the other products (they never count this product again, so the
 * parts add up to the count under them).
 *
 * Nothing moves: room is held from the moment the window opens, a short answer leaves that room plain (no grey
 * panel), and an error keeps the room and shows nothing.
 *
 * The store-wide estimate beside it (`RecoveryHint`) speaks in percent of retail and suggests a band; this speaks
 * in dollars and days and suggests nothing.
 */
import { useEffect, useState } from 'react';
import { Box, ButtonBase, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  getPriceCoach,
  type PriceCoach as Coach,
  type PriceCoachGroup,
  type PriceCoachShelf,
  type PriceCoachSold,
} from '../../api/priceCoach.api';
import { IconClose } from '../../icons/ecoIcons';

const DEBOUNCE_MS = 400;
/** How near is "near" the typed price (the server's NEAR_SHARE). */
const NEAR_SHARE = 0.15;
/** Room held for the coach from the moment the window opens, sized for its tallest common answer. */
export const COACH_HELD = { xs: 204, sm: 120 } as const;

function useDebounced<T>(value: T): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [value]);
  return v;
}

/** Always dollars and cents, like the Price box: $12.00, $12.50. */
export function coachMoney(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('price coach: not a price');
  return `$${value.toFixed(2)}`;
}

/** Always days, the one unit the coach uses: "the same day", "1 day", "14 days". */
export function coachDays(days: number): string {
  if (typeof days !== 'number' || !Number.isFinite(days)) throw new Error('price coach: not a number of days');
  if (days <= 0) return 'the same day';
  return days === 1 ? '1 day' : `${days.toLocaleString()} days`;
}

function priceRange(low: number, high: number): string {
  return low === high ? coachMoney(low) : `${coachMoney(low)} to ${coachMoney(high)}`;
}

/** How fast: "in 12 days" for one or two sales, "typically in 21 days" for three or more. Same words in the list. */
function speed(n: number, days: number): string {
  const when = days <= 0 ? 'the same day' : `in ${coachDays(days)}`;
  return n >= 3 ? `typically ${when}` : when;
}

/** "8 sold, all for $6.29, typically in 21 days." */
export function soldWords(sold: PriceCoachSold | null, { withSpeed = true } = {}): string {
  if (!sold) return 'None sold yet.';
  const tail = withSpeed ? `, ${speed(sold.n, sold.median_days)}` : '';
  if (sold.n < 3) return `${sold.n.toLocaleString()} sold for ${priceRange(sold.min ?? sold.low, sold.max ?? sold.high)}${tail}.`;
  // "most" only when the middle half is a narrower band than all of them.
  const all = sold.min != null && sold.max != null && sold.min === sold.max;
  return all
    ? `${sold.n.toLocaleString()} sold, all for ${coachMoney(sold.min!)}${tail}.`
    : `${sold.n.toLocaleString()} sold, most for ${priceRange(sold.low, sold.high)}${tail}.`;
}

/** "109 on the shelf now, 98 from this truck, 11 of them over 90 days." The tags go in when nothing sold. */
export function shelfWords(shelf: PriceCoachShelf | null, { tags = true }: { tags?: boolean } = {}): string {
  if (!shelf || !shelf.n) return 'None on the shelf now.';
  const truck = shelf.this_truck ? (shelf.this_truck === shelf.n ? ', all from this truck' : `, ${shelf.this_truck.toLocaleString()} from this truck`) : '';
  const at = tags && shelf.min_price != null && shelf.max_price != null ? ` at ${priceRange(shelf.min_price, shelf.max_price)}` : '';
  if (shelf.n === 1) {
    return `1 on the shelf now${at}${shelf.this_truck ? ', from this truck' : ''}, there ${shelf.sitting > 0 ? `over ${shelf.sitting_days} days` : coachDays(shelf.oldest_days)}.`;
  }
  const age = shelf.sitting > 0
    ? (shelf.sitting === shelf.n
      ? `, all over ${shelf.sitting_days} days`
      : `, ${shelf.sitting.toLocaleString()} of them over ${shelf.sitting_days} days`)
    : `, the oldest ${coachDays(shelf.oldest_days)}`;
  return `${shelf.n.toLocaleString()} on the shelf now${at}${truck}${age}.`;
}

/** The group the line speaks about, said in the line itself. A wider group never includes this product. */
export function coachGroup(c: Pick<Coach, 'basis' | 'label'>): string {
  return c.basis === 'product' ? 'This same product'
    : c.basis === 'similar' ? 'Other products like it'
      : c.basis === 'category_brand' ? `Other ${c.label}`
        : '';
}

/**
 * The main line. For this same product: what sold, then the shelf. For a wider group, one short fact about the
 * other products (the product's own record comes first, in `coachOwn`).
 */
export function coachLine(c: Coach): string {
  if (!c.enough) return 'Not enough like this yet.';
  // Fewer numbers in the line: the shelf's tags only when nothing has sold (they are in the list).
  if (c.basis === 'product') return `${coachGroup(c)}: ${soldWords(c.sold)} ${shelfWords(c.on_shelf, { tags: !c.sold })}`;
  const shelf = c.on_shelf?.n ? ` ${c.on_shelf.n.toLocaleString()} on the shelf now.` : '';
  return `${coachGroup(c)}: ${soldWords(c.sold, { withSpeed: true })}${shelf}`;
}

/** This exact product's own record, when the line rests on a wider group. '' when the line is the product's own. */
export function coachOwn(c: Coach): string {
  if (!c.enough || !c.own) return '';
  if (!c.own.n) return 'This same product: no sales or shelf time here yet.';
  return `This same product: ${soldWords(c.own.sold)} ${shelfWords(c.own.on_shelf, { tags: !c.own.sold })}`;
}

/**
 * The answer to the price just typed: what happened to tags close to it, from our own sales. Always said once a
 * price is in (none is a fact too). A count, never a verdict, and never a price of its own.
 */
export function coachNear(c: Coach): string {
  if (!c.enough || !c.near) return '';
  const { price, sold, on_shelf: shelf, n } = c.near;
  const low = coachMoney(c.near.low ?? Math.round(price * (1 - NEAR_SHARE) * 100) / 100);
  const high = coachMoney(c.near.high ?? Math.round(price * (1 + NEAR_SHARE) * 100) / 100);
  // Always this same product, and it says so.
  if (!n) return `This product near ${coachMoney(price)} (${low} to ${high}): never tagged there yet.`;
  return `This product near ${coachMoney(price)} (${low} to ${high}): ${sold.toLocaleString()} sold, ${shelf.toLocaleString()} on the shelf now.`;
}

/** How much the line rests on, in plain words. */
export function coachBasis(c: Pick<Coach, 'basis' | 'n'>): string {
  const items = `${c.n.toLocaleString()} ${c.n === 1 ? 'item' : 'items'}`;
  const from = c.basis === 'similar' ? ', this product and ones with close descriptions'
    : c.basis === 'category_brand' ? ', this product and its brand in the category'
      : '';
  return `${items}${from}, last 12 months`;
}

type Words = { line: string; own: string; near: string; basis: string };

/**
 * Check-in must never break because of the coach. An answer in a shape this screen does not know (an older or
 * newer server during a deploy, a cached answer) gives no words at all, and the coach then shows nothing.
 */
function coachWords(c: Coach): Words | null {
  try {
    const line = coachLine(c);
    if (!line || !Array.isArray(c.sold_groups) || !Array.isArray(c.shelf_groups)) return null;
    return { line, own: coachOwn(c), near: coachNear(c), basis: coachBasis(c) };
  } catch {
    return null;
  }
}

function GroupRows({ groups, sold, more, showOwn }: { groups: PriceCoachGroup[]; sold: boolean; more: number; showOwn: boolean }) {
  return (
    <Stack spacing={0} sx={{ mb: 2 }}>
      {groups.map((group, index) => {
        const days = sold
          ? speed(group.n, group.median_days)
          : (group.min_days === group.max_days ? coachDays(group.max_days) : `${group.min_days.toLocaleString()} to ${coachDays(group.max_days)}`);
        return (
          <Box
            key={`${group.title}-${group.price}-${index}`}
            data-testid="price-coach-item"
            sx={{ py: 0.75, borderTop: index ? 1 : 0, borderColor: 'divider' }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {sold
                ? `${group.n.toLocaleString()} sold for ${coachMoney(group.price)}, ${days}`
                : `${group.n.toLocaleString()} at ${coachMoney(group.price)}, on the shelf ${days}`}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
              {showOwn && group.own ? 'This same product: ' : ''}{group.title}
            </Typography>
          </Box>
        );
      })}
      {more > 0 ? (
        <Typography variant="caption" color="text.secondary" sx={{ pt: 0.75 }}>
          And {more.toLocaleString()} more {sold ? 'sold' : 'on the shelf'}, in smaller groups.
        </Typography>
      ) : null}
    </Stack>
  );
}

function CoachList({ coach, words, open, onClose }: { coach: Coach; words: Words; open: boolean; onClose: () => void }) {
  const wider = coach.basis !== 'product';
  const soldCount = (coach.sold?.n ?? 0) + (wider ? coach.own?.sold?.n ?? 0 : 0);
  const shelfCount = (coach.on_shelf?.n ?? 0) + (wider ? coach.own?.on_shelf?.n ?? 0 : 0);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="price-coach-list">
      <DialogTitle sx={{ fontWeight: 800, pr: 6 }}>
        What this rests on
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <IconClose />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {words.own ? <Typography variant="body2" sx={{ mb: 0.5 }}>{words.own}</Typography> : null}
        <Typography variant="body2" sx={{ mb: 0.5 }}>{words.line}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {words.basis}. Equal items are one row.
        </Typography>
        <Typography variant="overline" sx={{ fontWeight: 800, lineHeight: 1.6 }}>
          Sold ({soldCount.toLocaleString()})
        </Typography>
        {coach.sold_groups.length ? (
          <GroupRows groups={coach.sold_groups} sold more={coach.more?.sold ?? 0} showOwn={wider} />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>None sold yet.</Typography>
        )}
        <Typography variant="overline" sx={{ fontWeight: 800, lineHeight: 1.6 }}>
          On the shelf now ({shelfCount.toLocaleString()})
        </Typography>
        {coach.shelf_groups.length ? (
          <GroupRows groups={coach.shelf_groups} sold={false} more={coach.more?.on_shelf ?? 0} showOwn={wider} />
        ) : (
          <Typography variant="body2" color="text.secondary">None on the shelf now.</Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The held room: transparent, so a short answer or no answer never looks like an empty panel. */
const HOLD = { gridColumn: '1 / -1', minHeight: COACH_HELD } as const;
/** The grey box, only as tall as what it says. */
const FRAME = {
  px: 1.25, py: 0.75, borderRadius: 1, bgcolor: 'action.hover', display: 'block', width: '100%', textAlign: 'left',
} as const;

const NAME = (
  <Typography
    variant="caption"
    sx={{ display: 'block', fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', fontSize: '0.68rem', color: 'text.primary' }}
  >
    Price coach: what sold here
  </Typography>
);

export function PriceCoach({ productId, price, orderId }: { productId?: number | null; price?: string; orderId?: number | null }) {
  const typed = useDebounced(price?.trim() ?? '');
  // Open for one product. A new price (the box reformats "10" to "10.00" when a click leaves it) keeps it open.
  const [openFor, setOpenFor] = useState<number | null>(null);
  const { data, isError } = useQuery({
    queryKey: ['price-coach', productId ?? null, typed, orderId ?? null],
    queryFn: async ({ signal }) => (await getPriceCoach({ product: productId!, price: typed, order: orderId }, signal)).data,
    enabled: productId != null,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    // Check-in never waits on the coach and never shows its errors: one try, then nothing.
    retry: false,
    meta: { silent: true },
  });
  if (productId == null) return null;
  // The owner's switch is off: no coach, no room.
  if (data && !data.enabled) return null;
  const coach = !isError ? data?.coach ?? null : null;
  const words = coach ? coachWords(coach) : null;
  // Gone (an error, another product): the list closes and never pops up by itself later.
  if ((!coach || !words) && openFor != null) setOpenFor(null);
  // Still asking, an error, or an answer it cannot read: keep the room, say nothing.
  if (!coach || !words) {
    return <Box sx={HOLD} aria-hidden data-testid={data || isError ? 'price-coach-empty' : 'price-coach-holding'} />;
  }
  const canOpen = coach.enough && coach.sold_groups.length + coach.shelf_groups.length > 0;
  const text = (
    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
      {NAME}
      {/* The answer to the typed price comes first: it is the line that moves with what you type. */}
      {words.near ? (
        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 650 }} data-testid="price-coach-near">{words.near}</Typography>
      ) : null}
      {words.own ? (
        <Typography variant="body2" data-testid="price-coach-own">{words.own}</Typography>
      ) : null}
      <Typography
        variant="body2"
        data-testid="price-coach-line"
        // A wider group is a weaker fact than the product's own record above it, and looks it.
        color={coach.enough && !words.own ? 'text.primary' : 'text.secondary'}
      >
        {words.line}
      </Typography>
      {coach.enough ? (
        <Typography variant="caption" color="text.secondary" data-testid="price-coach-basis">
          {words.basis}.{canOpen ? (
            <Box component="span" sx={{ ml: 0.5, color: 'primary.main', fontWeight: 700, textDecoration: 'underline', whiteSpace: 'nowrap' }}>
              See the items
            </Box>
          ) : null}
        </Typography>
      ) : null}
    </Stack>
  );
  return (
    <Box sx={HOLD}>
      {canOpen ? (
        <ButtonBase sx={{ ...FRAME, alignItems: 'flex-start' }} onClick={() => setOpenFor(productId)} aria-label="Price coach: see the items" data-testid="price-coach">
          {text}
        </ButtonBase>
      ) : (
        <Box sx={FRAME} aria-label="Price coach" data-testid="price-coach">{text}</Box>
      )}
      {canOpen && openFor === productId ? <CoachList coach={coach} words={words} open onClose={() => setOpenFor(null)} /> : null}
    </Box>
  );
}
