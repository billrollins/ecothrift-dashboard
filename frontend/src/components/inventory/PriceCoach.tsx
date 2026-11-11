/**
 * Price coach (Dash Updates #89): one plain line at the check-in price box, from our own sales. "9 like this sold,
 * most at $12 to $15, in about 2 weeks. 4 priced $25 and up are still on the shelf after 90 days." Tap it for the
 * items it rests on. Facts only: it never changes or blocks a price, and on an error, a slow answer or the owner's
 * switch `inventory_price_coach` off it shows nothing. Server: `apps/inventory/services/price_coach.py`.
 *
 * The recovery estimate beside it (`RecoveryHint`) speaks in percent of retail and suggests a band; this speaks in
 * dollars and days and suggests nothing.
 */
import { useEffect, useState } from 'react';
import {
  Box, ButtonBase, Dialog, DialogContent, DialogTitle, IconButton, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, Typography,
} from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getPriceCoach, type PriceCoach as Coach } from '../../api/priceCoach.api';
import { IconClose } from '../../icons/ecoIcons';

const DEBOUNCE_MS = 400;

function useDebounced<T>(value: T): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [value]);
  return v;
}

/** $12 for whole dollars, $12.50 otherwise. */
export function coachMoney(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('price coach: not a price');
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

/**
 * Check-in must never break because of the coach. An answer in a shape this screen does not know (an older or
 * newer server during a deploy, a cached answer) gives no words at all, and the coach then shows nothing.
 */
function coachWords(c: Coach): { line: string; note: string; basis: string } | null {
  try {
    const line = coachLine(c);
    if (!line || !Array.isArray(c.items)) return null;
    return { line, note: coachNote(c), basis: coachBasis(c) };
  } catch {
    return null;
  }
}

/** "3 days", "about 2 weeks", "about 3 months". */
export function coachDays(days: number): string {
  if (typeof days !== 'number' || !Number.isFinite(days)) throw new Error('price coach: not a number of days');
  if (days <= 1) return days === 1 ? '1 day' : 'the same day';
  if (days < 11) return `${days} days`;
  if (days < 60) return `about ${Math.round(days / 7)} weeks`;
  return `about ${Math.round(days / 30)} months`;
}

/** What the line rests on, in plain words. */
export function coachBasis(c: Pick<Coach, 'basis' | 'label' | 'n'>): string {
  const what = c.basis === 'product' ? 'this same product'
    : c.basis === 'similar' ? 'similar products'
      : c.basis === 'category_brand' ? c.label
        : '';
  const items = `${c.n.toLocaleString()} ${c.n === 1 ? 'item' : 'items'}`;
  return what ? `From ${what}, ${items} in the last year` : items;
}

/** The one line. */
export function coachLine(c: Coach): string {
  if (!c.enough) return 'Not enough like this yet.';
  const parts: string[] = [];
  if (c.sold) {
    const at = c.sold.low === c.sold.high
      ? `at ${coachMoney(c.sold.low)}`
      : `at ${coachMoney(c.sold.low)} to ${coachMoney(c.sold.high)}`;
    const when = c.sold.median_days === 0 ? 'the same day' : `in ${coachDays(c.sold.median_days)}`;
    // "most" only when there are enough sales for a middle to mean something.
    const most = c.sold.n >= 3 ? ', most' : '';
    parts.push(`${c.sold.n.toLocaleString()} like this sold${most} ${at}, ${when}.`);
  } else if (c.on_shelf?.n) {
    parts.push(`None like this has sold yet. ${c.on_shelf.n.toLocaleString()} on the shelf, the oldest ${c.on_shelf.oldest_days} days.`);
  }
  if (c.sitting) {
    const verb = c.sitting.n === 1 ? 'is' : 'are';
    const { min_price: low, max_price: high } = c.sitting;
    // "$25 and up" only when what is sitting is priced above what sold; otherwise say the tags as they are.
    const above = !c.sold || low > c.sold.high;
    const tags = low === high ? coachMoney(low) : above ? `${coachMoney(low)} and up` : `${coachMoney(low)} to ${coachMoney(high)}`;
    parts.push(`${c.sitting.n.toLocaleString()} priced ${tags} ${verb} still on the shelf after ${c.sitting.days} days.`);
  } else if (c.sold && c.on_shelf?.n) {
    const verb = c.on_shelf.n === 1 ? 'is' : 'are';
    parts.push(`${c.on_shelf.n.toLocaleString()} more ${verb} on the shelf, the oldest ${c.on_shelf.oldest_days} days.`);
  }
  return parts.join(' ');
}

/** The gentle note for the typed price, or ''. */
export function coachNote(c: Coach): string {
  if (!c.enough || !c.note) return '';
  return `Items like this at ${coachMoney(c.note.price)} and up have mostly sat (${c.note.unsold} of ${c.note.n} unsold after ${c.note.days} days).`;
}

function CoachList({ coach, open, onClose }: { coach: Coach; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="price-coach-list">
      <DialogTitle sx={{ fontWeight: 800, pr: 6 }}>
        What this rests on
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <IconClose />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 0.5 }}>{coachLine(coach)}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {coachBasis(coach)}
          {coach.items.length < coach.n ? `. Showing ${coach.items.length}: the longest on the shelf, then the slowest to sell.` : '.'}
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell align="right">Tag</TableCell>
              <TableCell>What happened</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {coach.items.map((item) => (
              <TableRow key={item.id} data-testid="price-coach-item">
                <TableCell sx={{ maxWidth: 260 }}>
                  <Typography variant="body2" noWrap title={item.title}>{item.title || item.sku}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.sku}</Typography>
                </TableCell>
                <TableCell align="right">{coachMoney(item.price)}</TableCell>
                <TableCell>
                  {item.sold
                    ? `Sold for ${coachMoney(item.sold_for ?? item.price)}, ${item.days === 0 ? 'the same day' : `in ${item.days} ${item.days === 1 ? 'day' : 'days'}`}`
                    : `On the shelf ${item.days} days`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

export function PriceCoach({ productId, price }: { productId?: number | null; price?: string }) {
  const typed = useDebounced(price?.trim() ?? '');
  const [listOpen, setListOpen] = useState(false);
  const { data, isError } = useQuery({
    queryKey: ['price-coach', productId ?? null, typed],
    queryFn: async ({ signal }) => (await getPriceCoach({ product: productId!, price: typed }, signal)).data,
    enabled: productId != null,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    // Check-in never waits on the coach and never shows its errors: one try, then nothing.
    retry: false,
    meta: { silent: true },
  });
  const coach = productId != null && !isError ? data?.coach : null;
  if (!data?.enabled || !coach) return null;
  const words = coachWords(coach);
  if (!words) return null;
  const { line, note } = words;
  const canOpen = coach.enough && coach.items.length > 0;
  const text = (
    <Stack spacing={0.25} sx={{ minWidth: 0, textAlign: 'left' }}>
      <Typography variant="body2" data-testid="price-coach-line">{line}</Typography>
      {coach.enough ? (
        <Typography variant="caption" color="text.secondary" data-testid="price-coach-basis">
          {words.basis}{canOpen ? '. Tap to see them.' : '.'}
        </Typography>
      ) : null}
      {note ? (
        <Typography variant="body2" data-testid="price-coach-note" sx={{ color: 'warning.dark', fontWeight: 600 }}>
          {note}
        </Typography>
      ) : null}
    </Stack>
  );
  const frame = { gridColumn: '1 / -1', px: 1.25, py: 0.75, borderRadius: 1, bgcolor: 'action.hover', display: 'block', width: '100%' } as const;
  return (
    <>
      {canOpen ? (
        <ButtonBase sx={frame} onClick={() => setListOpen(true)} aria-label="Price coach: see the items" data-testid="price-coach">
          {text}
        </ButtonBase>
      ) : (
        <Box sx={frame} aria-label="Price coach" data-testid="price-coach">{text}</Box>
      )}
      {canOpen && listOpen ? <CoachList coach={coach} open onClose={() => setListOpen(false)} /> : null}
    </>
  );
}
