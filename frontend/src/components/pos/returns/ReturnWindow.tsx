import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { thriftErrorMessage } from '../../../api/thriftplusRegister.api';
import {
  findReturns,
  getReturnsReceipt,
  type ReturnsDone,
  type ReturnsFind,
  type ReturnsLine,
  type ReturnsPerson,
  type ReturnsReceipt,
  type ReturnsTicket,
} from '../../../api/thriftplusReturns.api';
import { formatCurrency } from '../../../utils/format';
import { skuFromScan } from '../../../utils/scanCode';
import { useObjectModal } from '../../objects/ObjectModal';
import { tbNumber } from '../../thriftplus/ThriftBucks';
import StepFrame from './StepFrame';
import ReturnsSummaryStep from './ReturnsSummaryStep';
import { BIG, FOCUS_RING, dayOnly, dayTime } from './returnsText';

type Step = 'find' | 'receipt' | 'summary';

/** What the line under the scan box says when there is nothing to warn about. */
const SCAN_HINT = 'Press Enter for the summary.';
/** ... and before anything is ticked. */
const TICK_HINT = 'Scan or tap each item coming back.';

function TicketRow({ t, onOpen, last }: { t: ReturnsTicket; onOpen: (cart: number) => void; last: boolean }) {
  return (
    // `last`: the ticket just looked at, marked so Back to the list shows where the cashier was.
    <ListItemButton onClick={() => onOpen(t.cart)} selected={last} data-ticket-row data-last={last || undefined} sx={{ minHeight: 64, borderRadius: 2 }}>
      <ListItemText
        primary={`${t.receipt_number} · ${formatCurrency(t.total)}`}
        secondary={`${dayTime(t.completed_at)}${t.items ? ` · ${t.items} ${t.items === 1 ? 'item' : 'items'}` : ''}${t.member ? ` · ${t.member}` : ' · not a member'}${t.practice ? ' · practice' : ''}`}
        slotProps={{ primary: { fontWeight: 700, noWrap: true }, secondary: { noWrap: true } }}
      />
    </ListItemButton>
  );
}

function PersonRow({ p, onPick }: { p: ReturnsPerson; onPick: (id: number) => void }) {
  return (
    <ListItemButton onClick={() => onPick(p.person_id)} sx={{ minHeight: 64, borderRadius: 2 }}>
      <ListItemAvatar>
        <Avatar src={p.photo_url ?? undefined}>{p.first_name.slice(0, 1)}</Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={p.name}
        secondary={[p.contact, p.phone_last4 ? `phone ••${p.phone_last4}` : '', p.status !== 'active' ? p.status : ''].filter(Boolean).join(' · ')}
        slotProps={{ primary: { fontWeight: 700 } }}
      />
    </ListItemButton>
  );
}

/** The server's window-closed sentence: on a late ticket the alert above already says it once. */
const WINDOW_CLOSED = /The 3-day return window closed[^.]*\.\s*/;

/** AS IS lines, the same item once with a count (nine bottles of one shampoo are one row). */
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
  open: boolean;
  onClose: () => void;
  /** This register's code; the training register (TRAIN) works the return out and writes nothing. */
  registerCode: string;
  /** The training register: the title says so. */
  practice: boolean;
}

/**
 * The Return window on the Register (#71, Bill 2026-11-04: the Register holds the POS and returns; it replaced the
 * Returns page of 2026-10-20). SUPER FAST, keyboard and scanner first.
 * 1. Find the receipt by anything: the member (QR, name, phone, email, member #), the ticket (the receipt #, a date or the
 *    total) or an item (its tag, or words from it). A single ticket opens at once; found by a tag, that item is ticked.
 * 2. Tick the lines coming back (scan an item tag to tick it). Returnable on top, AS IS greyed with the reason below.
 * 3. Summary and Confirm. Past the 3 days: a manager's own PIN (or the owner signed in) and a reason (a mark against Retail).
 * 4. Done: the window closes and the member's window opens with the new credit (practice too, with nothing written).
 * Every return taken, late ones too, is listed in Transactions → Returns (#72). Server: `apps/thriftplus`
 * `returns/find|receipt|preview|batch`.
 * The window keeps one height on every step and its messages sit in lines that are always there, so nothing jumps.
 */
export default function ReturnWindow({ open, onClose, registerCode, practice }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const { openObject } = useObjectModal();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('find');
  const [q, setQ] = useState('');
  const [searched, setSearched] = useState('');
  const [found, setFound] = useState<ReturnsFind | null>(null);
  const [searching, setSearching] = useState(false);
  const [receipt, setReceipt] = useState<ReturnsReceipt | null>(null);
  const [ticked, setTicked] = useState<number[]>([]);
  const [scan, setScan] = useState('');
  const [scanNote, setScanNote] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const [lastCart, setLastCart] = useState<number | null>(null);

  const reset = useCallback(() => {
    setStep('find');
    setReceipt(null);
    setFound(null);
    setTicked([]);
    setQ('');
    setSearched('');
    setScan('');
    setScanNote('');
  }, []);

  /** Back from a ticket: to the same list when it came from one (no retyping a date), else a clean search. */
  const backToList = Boolean(found && !found.receipt && found.tickets.length > 1);
  function back() {
    if (!backToList) {
      listScroll.current = 0;
      reset();
      return;
    }
    setStep('find');
    setReceipt(null);
    setTicked([]);
    setScan('');
    setScanNote('');
  }

  // Every opening starts clean.
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    if (step === 'find' && listScrollRef.current) listScrollRef.current.scrollTop = listScroll.current;
    if (step === 'find') searchRef.current?.focus();
    if (step === 'receipt') scanRef.current?.focus();
  }, [open, step]);

  /** Open a ticket; `tag` (the item tag it was found by) ticks that line when it can come back. */
  const openReceipt = useCallback((next: ReturnsReceipt, tag = '') => {
    const code = tag.toLowerCase();
    const line = code ? next.lines.find((l) => l.sku.toLowerCase() === code && l.state === 'returnable') : undefined;
    setReceipt(next);
    setTicked(line ? [line.cart_line] : []);
    setScan('');
    setScanNote('');
    setStep('receipt');
  }, []);

  async function search(text = q, person?: number) {
    const typed = text.trim();
    if (!typed && person == null) return;
    setSearching(true);
    try {
      const answer = await findReturns(typed, person != null ? { person, register: registerCode } : { register: registerCode });
      setFound(answer);
      if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
      if (typed) setSearched(typed);
      listScroll.current = 0;
      setLastCart(null);
      if (answer.receipt) openReceipt(answer.receipt, answer.kind === 'item' ? skuFromScan(typed) : '');
      else setQ('');
    } catch (err) {
      enqueueSnackbar(thriftErrorMessage(err, 'Could not search. Try again.'), { variant: 'error' });
    } finally {
      setSearching(false);
    }
  }

  async function openTicket(cart: number) {
    setSearching(true);
    try {
      listScroll.current = listScrollRef.current?.scrollTop ?? 0;
      setLastCart(cart);
      openReceipt(await getReturnsReceipt(cart, registerCode));
    } catch (err) {
      enqueueSnackbar(thriftErrorMessage(err, 'Could not open that ticket.'), { variant: 'error' });
    } finally {
      setSearching(false);
    }
  }

  const returnable = useMemo(() => (receipt?.lines ?? []).filter((l) => l.state === 'returnable'), [receipt]);
  const asIs = useMemo(() => groupAsIs((receipt?.lines ?? []).filter((l) => l.state !== 'returnable'), Boolean(receipt?.late)), [receipt]);
  // Each reason once, with its items under it.
  const asIsByWhy = useMemo(() => {
    const byWhy = new Map<string, typeof asIs>();
    for (const g of asIs) {
      const why = g.line.why || 'Sold AS IS.';
      byWhy.set(why, [...(byWhy.get(why) ?? []), g]);
    }
    return [...byWhy.entries()];
  }, [asIs]);
  // A short screen (a register's small monitor, a phone): the window takes the whole screen so the items get the room.
  const compact = useMediaQuery('(max-height: 720px), (max-width: 599.95px)');
  const narrow = useMediaQuery('(max-width: 599.95px)');

  function toggle(id: number) {
    setTicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  /** Scanning an item tag while the receipt is open ticks that line. */
  function scanned(raw: string) {
    const code = skuFromScan(raw).toLowerCase();
    setScan('');
    if (!code) {
      if (ticked.length) {
        setScanNote('');
        setStep('summary');
      }
      return;
    }
    const line = receipt?.lines.find((l) => l.sku.toLowerCase() === code);
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
    setTicked((cur) => [...cur, line.cart_line]);
  }

  function done(result: ReturnsDone) {
    enqueueSnackbar(
      result.training
        ? 'Practice: nothing was given.'
        : `Thrift+ credit added: ${formatCurrency(result.totals.credit)}${Number(result.totals.bucks_taken) > 0 ? ` · ${tbNumber(result.totals.bucks_taken)} ThriftBucks taken back` : ''}`,
      { variant: result.training ? 'info' : 'success' },
    );
    onClose();
    // Practice ends like the real thing: the member's window opens (#49), read again so it shows the credit of now.
    void queryClient.invalidateQueries({ queryKey: ['member-window', result.person_id] });
    void queryClient.invalidateQueries({ queryKey: ['thriftplus', 'member-card', result.person_id] });
    openObject({ type: 'member', id: result.person_id });
  }

  const tickedCredit = receipt ? receipt.lines.filter((l) => ticked.includes(l.cart_line)).reduce((sum, l) => sum + Number(l.refund), 0) : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={compact}
      // One height for every step: the window never grows or shrinks under the cashier's hand.
      slotProps={{
        paper: { sx: compact ? undefined : { height: 'min(860px, calc(100% - 64px))' } },
        // The dialog takes focus as it opens; once it is in, the cursor goes to the box, so the first scan lands.
        transition: { onEntered: () => searchRef.current?.focus() },
      }}
      data-testid="return-window"
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1, ...(compact ? { pt: 1 } : {}) }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" component="span" fontWeight={800}>{practice ? 'Return (practice)' : 'Return'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {practice ? '80% of what they paid comes back as Thrift+ credit. Nothing is written.' : '80% of what they paid comes back as Thrift+ credit.'}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close" edge="end">
          <CloseRounded />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: compact ? 1.5 : 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {step === 'find' ? (
          <StepFrame
            scrollRef={listScrollRef}
            top={
              <Stack direction="row" spacing={1}>
                <TextField
                  inputRef={searchRef}
                  autoFocus
                  fullWidth
                  label="Find the receipt"
                  placeholder={narrow ? 'Scan, or type a name' : 'Scan it or a tag, or type a name, phone, ticket #, date or total'}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void search();
                    // Down goes into the list: to the ticket last looked at, else the first.
                    if (e.key === 'ArrowDown') {
                      (resultsRef.current?.querySelector<HTMLElement>('[data-last]')
                        ?? resultsRef.current?.querySelector<HTMLElement>('[data-ticket-row],[role=button]'))?.focus();
                    }
                  }}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'returns-search', autoComplete: 'off' } }}
                />
                <Button variant="contained" onClick={() => void search()} disabled={searching || !q.trim()} startIcon={searching ? <CircularProgress size={20} color="inherit" aria-label="Searching" /> : <SearchRounded />} sx={{ ...BIG, px: 3 }}>
                  Find
                </Button>
              </Stack>
            }
          >
            <Box ref={resultsRef}>
              {found?.message ? <Alert severity="info" data-testid="returns-message">{found.message}</Alert> : null}
              {found?.person ? (
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                  <Avatar src={found.person.photo_url ?? undefined} sx={{ width: 48, height: 48 }}>{found.person.first_name.slice(0, 1)}</Avatar>
                  <Typography variant="h6" fontWeight={800}>{found.person.name}</Typography>
                </Stack>
              ) : null}
              {found?.people.length && !found.person ? (
                <>
                  <Typography fontWeight={700} sx={{ mb: 0.5 }}>Who?</Typography>
                  <List disablePadding>
                    {found.people.map((p) => (
                      <PersonRow key={p.person_id} p={p} onPick={(id) => void search('', id)} />
                    ))}
                  </List>
                </>
              ) : null}
              {found?.tickets.length ? (
                <>
                  <Typography fontWeight={700} sx={{ mb: 0.5 }} data-testid="returns-tickets-head">
                    {found.person
                      ? 'Recent tickets, newest first'
                      : `${found.tickets.length} ${found.tickets.length === 1 ? 'ticket' : 'tickets'}${searched ? ` for “${searched}”` : ''}`}
                  </Typography>
                  <List
                    disablePadding
                    data-testid="returns-tickets"
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                      const rows = [...(resultsRef.current?.querySelectorAll<HTMLElement>('[data-ticket-row]') ?? [])];
                      const at = rows.indexOf(document.activeElement as HTMLElement);
                      if (at < 0) return;
                      e.preventDefault();
                      if (e.key === 'ArrowUp' && at === 0) searchRef.current?.focus();
                      else rows[Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
                    }}
                  >
                    {found.tickets.map((t) => (
                      <TicketRow key={t.cart} t={t} last={t.cart === lastCart} onOpen={(cart) => void openTicket(cart)} />
                    ))}
                  </List>
                </>
              ) : null}
              {found && found.person && !found.tickets.length ? (
                <Alert severity="info">No sales on this membership lately.</Alert>
              ) : null}
            </Box>
          </StepFrame>
        ) : null}

        {step === 'receipt' && receipt ? (
          <StepFrame
            top={
              returnable.length ? (
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
                    {scanNote || (ticked.length ? SCAN_HINT : TICK_HINT)}
                  </Typography>
                </Box>
              ) : null
            }
            bottom={
              returnable.length ? (
                <Button
                  variant="contained"
                  fullWidth
                  disabled={!ticked.length}
                  onClick={() => {
                    setScanNote('');
                    setStep('summary');
                  }}
                  sx={BIG}
                  data-testid="returns-next"
                >
                  {ticked.length ? `Next: summary (${ticked.length} ${ticked.length === 1 ? 'item' : 'items'}, ${formatCurrency(tickedCredit)})` : 'Tick the items coming back'}
                </Button>
              ) : (
                <Button variant="contained" fullWidth autoFocus disableFocusRipple onClick={back} sx={{ ...BIG, ...FOCUS_RING }}>{backToList ? 'Back to the list' : 'Find another receipt'}</Button>
              )
            }
          >
            <Paper variant="outlined" sx={{ px: 2, py: 1.25, mb: 1 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h6" fontWeight={800} data-testid="receipt-head" sx={{ flex: 1, minWidth: 0 }}>
                  <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{receipt.receipt_number}</Box>{' '}
                  {narrow ? null : '· '}
                  <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{formatCurrency(receipt.total)}</Box>
                </Typography>
                {returnable.length && narrow ? (
                  <Button
                    size="small"
                    startIcon={<ArrowBackRounded />}
                    onClick={back}
                    aria-label={backToList ? 'Back to the list' : 'Find another receipt'}
                    sx={{ flexShrink: 0, minHeight: 44 }}
                  >
                    {backToList ? 'List' : 'New search'}
                  </Button>
                ) : returnable.length ? (
                  <Button size="small" startIcon={<ArrowBackRounded />} onClick={back} sx={{ flexShrink: 0, minHeight: 44 }}>
                    {backToList ? 'Back to the list' : 'Find another receipt'}
                  </Button>
                ) : null}
              </Stack>
              <Typography color="text.secondary">
                {dayTime(receipt.completed_at)}{receipt.member ? ` · ${receipt.member.name}` : ' · not a Thrift+ member'}
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
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography fontWeight={800}>Returnable</Typography>
                  {returnable.length > 1 ? (
                    <Button
                      sx={{ minHeight: 44, px: 2 }}
                      onClick={() => {
                        setTicked(ticked.length === returnable.length ? [] : returnable.map((l) => l.cart_line));
                        scanRef.current?.focus();
                      }}
                    >
                      {ticked.length === returnable.length ? 'Untick all' : 'Tick all'}
                    </Button>
                  ) : null}
                </Stack>
                <List disablePadding>
                  {returnable.map((l) => (
                    <ListItemButton key={l.cart_line} onClick={() => { toggle(l.cart_line); scanRef.current?.focus(); }} selected={ticked.includes(l.cart_line)}
                      sx={{ minHeight: 64, borderRadius: 2 }} data-testid={`line-${l.cart_line}`}>
                      <Checkbox edge="start" checked={ticked.includes(l.cart_line)} tabIndex={-1} disableRipple slotProps={{ input: { 'aria-label': `Return ${l.title}` } }} />
                      <ListItemText
                        primary={l.title}
                        // A late ticket says it once, in its alert; one late line on a newer ticket says it here.
                        secondary={
                          <>
                            {narrow ? `${l.sku} ` : `${l.sku} · `}
                            <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{`back ${formatCurrency(l.refund)} Thrift+ credit`}</Box>
                            {l.late && !receipt.late ? ' · past the 3 days' : ''}
                          </>
                        }
                        slotProps={{ primary: { fontWeight: 700 }, secondary: { color: l.late && !receipt.late ? 'warning.dark' : undefined } }}
                      />
                    </ListItemButton>
                  ))}
                </List>
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
        ) : null}

        {step === 'summary' && receipt ? (
          <ReturnsSummaryStep
            receipt={receipt}
            lines={ticked}
            registerCode={registerCode}
            practice={practice || receipt.practice}
            onBack={() => setStep('receipt')}
            onDone={done}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
