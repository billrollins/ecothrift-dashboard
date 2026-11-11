import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import {
  Box,
  Button,
  Checkbox,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReturnReasonPick, ReturnsLine, ReturnsReceipt } from '../../../api/thriftplusReturns.api';
import { formatCurrency } from '../../../utils/format';
import { skuFromScan } from '../../../utils/scanCode';
import { MemberName } from '../../thriftplus/MemberName';
import StepFrame from './StepFrame';
import { BIG, FOCUS_RING, REASONS_FALLBACK, dayOnly, dayTime, paidWith } from './returnsText';

/** The server's window-closed sentence: on a late ticket the card above already says it once. */
const WINDOW_CLOSED = /The 3-day return window closed[^.]*\.\s*/;

/** Lines that cannot come back, the same item once with a count (nine bottles of one shampoo are one row). */
function groupAsIs(lines: ReturnsLine[], late: boolean): { key: string; line: ReturnsLine; count: number }[] {
  const groups = new Map<string, { key: string; line: ReturnsLine; count: number }>();
  for (const raw of lines) {
    const l = late ? { ...raw, why: raw.why.replace(WINDOW_CLOSED, '').trim() || 'Sold AS IS.' } : raw;
    const key = `${l.title}|${l.state}|${l.why}`;
    const g = groups.get(key);
    if (g) g.count += Math.max(1, l.quantity);
    else groups.set(key, { key, line: l, count: Math.max(1, l.quantity) });
  }
  return [...groups.values()];
}

interface Props {
  receipt: ReturnsReceipt;
  /** The cart lines coming back. */
  ticked: number[];
  /** Why each one is coming back, by cart line. */
  reasons: Record<number, ReturnReasonPick>;
  onTicked: (next: number[]) => void;
  onReasons: (next: Record<number, ReturnReasonPick>) => void;
  /** The ticket came from a list: Back goes to that list. */
  backToList: boolean;
  onBack: () => void;
  onNext: () => void;
  narrow: boolean;
}

/**
 * Step 2, the ticket (Bill 2026-11-10, #90: "pulls up a ticket, picks the things that are going to be returned, gives
 * all the reasons for each return"). The sale as the customer knows it: its number, the day, the items and what was
 * paid. Tap (or scan) each item coming back; a picked item asks why, from a short list, with an optional note. An item
 * that cannot come back is greyed with the reason, in plain words. Next waits until every picked item has its reason;
 * when several came back for one reason, "Same reason for the other N" puts the reason picked last on the rest.
 * The reason is a record for Processing and the return receipt: any reason is fine (W1), so nothing here says no.
 */
export default function ReturnTicketStep({ receipt, ticked, reasons, onTicked, onReasons, backToList, onBack, onNext, narrow }: Props) {
  const [scan, setScan] = useState('');
  const [scanNote, setScanNote] = useState('');
  // The line whose reason was picked last: "Same reason for all" copies that one.
  const [lastPick, setLastPick] = useState<number | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const options = receipt.return_reasons?.length ? receipt.return_reasons : REASONS_FALLBACK;

  const returnable = useMemo(() => receipt.lines.filter((l) => l.state === 'returnable'), [receipt]);
  const asIs = useMemo(() => groupAsIs(receipt.lines.filter((l) => l.state !== 'returnable'), receipt.late), [receipt]);
  // Each reason once, with its items under it.
  const asIsByWhy = useMemo(() => {
    const byWhy = new Map<string, typeof asIs>();
    for (const g of asIs) {
      const why = g.line.why || 'Sold AS IS.';
      byWhy.set(why, [...(byWhy.get(why) ?? []), g]);
    }
    return [...byWhy.entries()];
  }, [asIs]);

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  const picked = returnable.filter((l) => ticked.includes(l.cart_line));
  const waiting = picked.filter((l) => !reasons[l.cart_line]?.reason);
  const ready = picked.length > 0 && waiting.length === 0;
  const credit = picked.reduce((sum, l) => sum + Number(l.refund), 0);
  const items = receipt.lines.reduce((n, l) => n + Math.max(1, l.quantity), 0);
  const paid = paidWith(receipt.payment_method);

  function toggle(id: number) {
    onTicked(ticked.includes(id) ? ticked.filter((x) => x !== id) : [...ticked, id]);
    setScanNote('');
  }

  function setReason(id: number, next: Partial<ReturnReasonPick>) {
    const current: ReturnReasonPick | undefined = reasons[id];
    onReasons({ ...reasons, [id]: { reason: current?.reason ?? '', note: current?.note ?? '', ...next } });
  }

  /** Several of the same thing came back for one reason: the reason picked last goes on every picked item without one. */
  const copyFrom = lastPick != null && ticked.includes(lastPick) && reasons[lastPick]?.reason ? reasons[lastPick] : null;
  function sameForAll() {
    if (!copyFrom) return;
    const nextReasons = { ...reasons };
    for (const l of waiting) nextReasons[l.cart_line] = { reason: copyFrom.reason, note: copyFrom.note };
    onReasons(nextReasons);
    setScanNote('');
    scanRef.current?.focus();
  }

  function next() {
    setScanNote('');
    if (ready) onNext();
    else if (waiting.length) setScanNote(`Pick a reason for ${waiting[0].title} first.`);
  }

  /** Scanning an item tag while the ticket is open ticks that line; Enter on an empty box goes on. */
  function scanned(raw: string) {
    const code = skuFromScan(raw).toLowerCase();
    setScan('');
    if (!code) {
      next();
      return;
    }
    const line = receipt.lines.find((l) => l.sku.toLowerCase() === code);
    if (!line) {
      setScanNote(`Not on this ticket: ${skuFromScan(raw)}`);
      return;
    }
    if (line.state !== 'returnable') {
      setScanNote(`Cannot come back${/AS IS/i.test(line.why) || !line.why ? ' (sold AS IS)' : ''}: ${line.title}`);
      return;
    }
    if (ticked.includes(line.cart_line)) {
      setScanNote(`Already ticked: ${line.title}`);
      return;
    }
    setScanNote('');
    onTicked([...ticked, line.cart_line]);
  }

  const hint = !picked.length
    ? 'Scan or tap each item coming back.'
    : waiting.length
      ? 'Pick a reason for each item.'
      : 'Press Enter to check the return.';
  const backWords = backToList ? 'Back to the list' : 'Find another ticket';

  return (
    <StepFrame
      top={
        <Stack spacing={1.5}>
          <Paper variant="outlined" sx={{ px: narrow ? 1.5 : 2, py: narrow ? 0.75 : 1.25, '& .MuiTypography-body1': narrow ? { fontSize: '0.875rem' } : undefined }} data-testid="ticket-card">
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant={narrow ? 'subtitle1' : 'h6'} fontWeight={800} data-testid="receipt-head" sx={{ flex: 1, minWidth: 0 }}>
                Ticket <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{receipt.receipt_number}</Box>
              </Typography>
              {returnable.length ? (
                <Button size="small" startIcon={<ArrowBackRounded />} onClick={onBack} aria-label={backWords} sx={{ flexShrink: 0, minHeight: 44 }}>
                  {narrow ? (backToList ? 'List' : 'New search') : backWords}
                </Button>
              ) : null}
            </Stack>
            <Typography color="text.secondary" data-testid="ticket-sale">
              {dayTime(receipt.completed_at)} · {items} {items === 1 ? 'item' : 'items'} · paid{' '}
              <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{formatCurrency(receipt.total)}</Box>{paid ? ` (${paid})` : ''}
            </Typography>
            <Typography color="text.secondary">
              {receipt.member ? <MemberName personId={receipt.member.person_id}>{receipt.member.name}</MemberName> : 'Not a Thrift+ member'}
              {receipt.cashier ? ` · rung by ${receipt.cashier}` : ''}
            </Typography>
            {returnable.length === 0 ? (
              <Typography sx={{ mt: 0.5 }} fontWeight={700} data-testid="receipt-none">Nothing on this ticket can come back.</Typography>
            ) : receipt.late ? (
              <Typography sx={{ mt: 0.5 }} fontWeight={700} color="warning.dark" data-testid="receipt-late">
                The 3 days ended {dayOnly(receipt.deadline)}. A return now needs a manager's PIN and is marked against Retail.
              </Typography>
            ) : (
              <Typography sx={{ mt: 0.5 }} fontWeight={700}>Returns through {dayOnly(receipt.deadline)}.</Typography>
            )}
            {receipt.closed_note && !receipt.late && returnable.length ? (
              <Typography variant="body2" color="text.secondary">{receipt.closed_note}</Typography>
            ) : null}
          </Paper>
          {returnable.length ? (
            <Box>
              <TextField
                inputRef={scanRef}
                autoFocus
                fullWidth
                label="Scan a tag to tick it"
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && scanned(scan)}
                slotProps={{ htmlInput: { 'data-testid': 'returns-scan', autoComplete: 'off' } }}
              />
              {/* Always the same height (one line, two on a phone): a warning takes the hint's place, so the list never moves. */}
              <Typography
                variant="body2"
                noWrap={!narrow}
                title={scanNote || undefined}
                data-testid={scanNote ? 'returns-scan-note' : undefined}
                sx={{
                  pt: 0.5, px: 1.75, fontWeight: scanNote ? 700 : 400, color: scanNote ? 'warning.dark' : 'text.secondary',
                  ...(narrow
                    ? { height: 44, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
                    : { minHeight: 24 }),
                }}
              >
                {scanNote || hint}
              </Typography>
            </Box>
          ) : null}
        </Stack>
      }
      bottom={
        returnable.length ? (
          <Button variant="contained" fullWidth disabled={!ready} onClick={next} sx={BIG} data-testid="returns-next">
            {!picked.length
              ? 'Tap the items coming back'
              : waiting.length
                ? narrow
                  ? `Pick a reason (${waiting.length} left)`
                  : `Pick a reason for ${waiting.length === 1 ? waiting[0].title : `${waiting.length} items`}`
                : `Next: check the return (${picked.length} ${picked.length === 1 ? 'item' : 'items'}, ${formatCurrency(credit)})`}
          </Button>
        ) : (
          <Button variant="contained" fullWidth autoFocus disableFocusRipple onClick={onBack} sx={{ ...BIG, ...FOCUS_RING }}>{backWords}</Button>
        )
      }
    >
      {returnable.length ? (
        <Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography fontWeight={800}>What is coming back?</Typography>
            {returnable.length > 1 ? (
              <Stack direction="row" spacing={0.5}>
                {copyFrom && waiting.length ? (
                  <Button sx={{ minHeight: 44, px: 2 }} onClick={sameForAll} data-testid="returns-same-reason">
                    {`Same reason for the other ${waiting.length}`}
                  </Button>
                ) : null}
                <Button
                  sx={{ minHeight: 44, px: 2 }}
                  onClick={() => {
                    onTicked(picked.length === returnable.length ? [] : returnable.map((l) => l.cart_line));
                    scanRef.current?.focus();
                  }}
                >
                  {picked.length === returnable.length ? 'Untick all' : 'Tick all'}
                </Button>
              </Stack>
            ) : null}
          </Stack>
          <Stack spacing={1}>
            {returnable.map((l) => {
              const on = ticked.includes(l.cart_line);
              const pick = reasons[l.cart_line];
              return (
                <Paper key={l.cart_line} variant="outlined" sx={{ borderColor: on ? 'primary.main' : 'divider', overflow: 'hidden' }}>
                  <ListItemButton
                    onClick={() => { toggle(l.cart_line); scanRef.current?.focus(); }}
                    selected={on}
                    sx={{ minHeight: 64 }}
                    data-testid={`line-${l.cart_line}`}
                  >
                    <Checkbox edge="start" checked={on} tabIndex={-1} disableRipple slotProps={{ input: { 'aria-label': `Return ${l.title}` } }} />
                    <ListItemText
                      primary={l.title}
                      // A late ticket says it once, in its card; one late line on a newer ticket says it here.
                      secondary={
                        <>
                          {narrow ? `${l.sku} ` : `${l.sku} · `}
                          <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{`sold for ${formatCurrency(l.price)}`}</Box>
                          {' · '}
                          <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{`back ${formatCurrency(l.refund)} Thrift+ credit`}</Box>
                          {l.late && !receipt.late ? ' · past the 3 days' : ''}
                        </>
                      }
                      slotProps={{ primary: { fontWeight: 700 }, secondary: { color: l.late && !receipt.late ? 'warning.dark' : undefined } }}
                    />
                  </ListItemButton>
                  {on ? (
                    <Box sx={{ px: 2, pb: 1.5, pt: 0.5 }} data-testid={`reason-${l.cart_line}`}>
                      <Typography variant="body2" fontWeight={700} color={pick?.reason ? 'text.secondary' : 'primary.dark'} sx={{ mb: 0.75 }}>
                        Why is it coming back?
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={0.75} role="group" aria-label={`Why ${l.title} is coming back`}>
                        {options.map((o) => (
                          <Button
                            key={o.value}
                            variant={pick?.reason === o.value ? 'contained' : 'outlined'}
                            aria-pressed={pick?.reason === o.value}
                            onClick={() => {
                              setReason(l.cart_line, { reason: o.value });
                              setLastPick(l.cart_line);
                              setScanNote('');
                              scanRef.current?.focus(); // the next scan lands in the box
                            }}
                            sx={{ minHeight: 48, px: 1.5, borderRadius: 2, fontWeight: 700, textTransform: 'none' }}
                          >
                            {o.label}
                          </Button>
                        ))}
                      </Stack>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder={pick?.reason === 'other' ? 'Say why, in a few words (optional)' : 'Note (optional)'}
                        value={pick?.note ?? ''}
                        onChange={(e) => setReason(l.cart_line, { note: e.target.value.slice(0, 200) })}
                        onKeyDown={(e) => e.key === 'Enter' && scanRef.current?.focus()}
                        slotProps={{ htmlInput: { 'aria-label': `Note for ${l.title}`, autoComplete: 'off', maxLength: 200 } }}
                        sx={{ mt: 1 }}
                      />
                    </Box>
                  ) : null}
                </Paper>
              );
            })}
          </Stack>
        </Box>
      ) : null}

      {asIsByWhy.length ? (
        <Box sx={{ mt: returnable.length ? 1.5 : 0 }} data-testid="returns-as-is">
          {/* With nothing returnable the card already says so: no second heading. */}
          {returnable.length ? <Typography fontWeight={800} color="text.secondary">Cannot come back</Typography> : null}
          {asIsByWhy.map(([why, groups]) => (
            <Box key={why} sx={{ mt: 0.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>{why}</Typography>
              <List disablePadding sx={{ opacity: 0.6 }}>
                {groups.map(({ key, line, count }) => (
                  <ListItemText
                    key={key}
                    sx={{ px: 2, py: 0.5 }}
                    primary={count > 1 ? `${line.title} × ${count}` : line.title}
                    secondary={line.sku}
                  />
                ))}
              </List>
            </Box>
          ))}
        </Box>
      ) : null}
    </StepFrame>
  );
}
