import CloseRounded from '@mui/icons-material/CloseRounded';
import PersonSearchRounded from '@mui/icons-material/PersonSearchRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { thriftErrorMessage } from '../../../api/thriftplusRegister.api';
import {
  findReturns,
  getReturnsReceipt,
  type ReturnReasonPick,
  type ReturnsDone,
  type ReturnsFind,
  type ReturnsPerson,
  type ReturnsReceipt,
  type ReturnsSummary,
  type ReturnsTicket,
} from '../../../api/thriftplusReturns.api';
import { localPrintService, printErrorMessage } from '../../../services/localPrintService';
import { formatCurrency } from '../../../utils/format';
import { skuFromScan } from '../../../utils/scanCode';
import { useObjectModal } from '../../objects/ObjectModal';
import { MemberName } from '../../thriftplus/MemberName';
import ReturnDoneStep, { type ReturnDoneLine, type ReturnPrint } from './ReturnDoneStep';
import ReturnTicketStep from './ReturnTicketStep';
import ReturnsSummaryStep from './ReturnsSummaryStep';
import StepFrame from './StepFrame';
import { BIG, REASONS_FALLBACK, STEPS, dayTime, reasonWords } from './returnsText';

type Step = 'start' | 'ticket' | 'check' | 'done';
const STEP_AT: Record<Step, number> = { start: 0, ticket: 1, check: 2, done: 3 };

/** The big ways in on "Start a return". Each one only says what to do and readies the box: the box finds anything. */
type Way = 'tag' | 'qr' | 'member' | 'ticket';
const WAYS: { key: Way; icon: ReactNode; title: string; help: string; label: string; placeholder: string; hint: string }[] = [
  {
    key: 'tag', icon: <QrCodeScannerRounded fontSize="large" />, title: "Scan an item's tag", help: 'The tag on what came back',
    label: "Scan the item's tag", placeholder: 'Scan the tag now, or type its number', hint: 'Ready: scan the tag on the item they brought back.',
  },
  {
    key: 'qr', icon: <QrCode2Rounded fontSize="large" />, title: 'Scan their Thrift+ QR', help: "In the member's app",
    label: 'Scan their Thrift+ QR', placeholder: 'Scan the QR in their app now', hint: "Ready: scan the QR in the member's Thrift+ app.",
  },
  {
    key: 'member', icon: <PersonSearchRounded fontSize="large" />, title: 'Find the member', help: 'Name or phone number',
    label: "Member's name or phone", placeholder: 'Type a name or phone number', hint: 'Type a name or phone number, then press Enter.',
  },
  {
    key: 'ticket', icon: <ReceiptLongRounded fontSize="large" />, title: 'Type the ticket number', help: 'At the top of the receipt',
    label: 'Ticket number', placeholder: "R-20261104-045, or just 45 for today's", hint: 'The ticket number is at the top of the receipt. Type it, then press Enter.',
  },
];
const ANY_HINT = 'Ready to scan. Or tap a way above.';

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

/** Where the cashier is: the four steps on one line (one short line on a phone). */
function StepsLine({ at, narrow }: { at: number; narrow: boolean }) {
  const words = `Step ${at + 1} of ${STEPS.length}: ${STEPS[at]}`;
  if (narrow) {
    return <Typography variant="body2" color="text.secondary" fontWeight={700} data-testid="return-steps">{words}</Typography>;
  }
  return (
    <Stack direction="row" spacing={1} alignItems="center" role="group" aria-label={words} data-testid="return-steps" data-step={at + 1}>
      {STEPS.map((label, i) => (
        <Fragment key={label}>
          {i ? <Box sx={{ flex: 1, height: 2, borderRadius: 1, bgcolor: i <= at ? 'primary.main' : 'divider' }} /> : null}
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
            <Box
              sx={{
                width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800,
                bgcolor: i <= at ? 'primary.main' : 'action.disabledBackground', color: i <= at ? 'primary.contrastText' : 'text.secondary',
              }}
            >
              {i + 1}
            </Box>
            <Typography variant="body2" noWrap fontWeight={i === at ? 800 : 500} color={i === at ? 'text.primary' : 'text.secondary'}>
              {label}
            </Typography>
          </Stack>
        </Fragment>
      ))}
    </Stack>
  );
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
 * The Return window on the Register (#71, Bill 2026-11-04: the Register holds the POS and returns). Rebuilt as four
 * clear steps for #90 (Carrie 2026-11-10: "the return process looked difficult and confusing"; Bill: "a start a
 * return. Which then pulls up a ticket, picks the things that are going to be returned, gives all the reasons for each
 * return, then once it's done, it prints a receipt").
 * 1. Start a return: four big ways in (scan an item's tag, scan the member's QR, find the member, type the ticket
 *    number) over one box that has the cursor from the moment the window opens, so a scan works with no tap first.
 *    The box still finds by anything (a date, a total, an email, words from the item). One ticket opens at once.
 * 2. The ticket (`ReturnTicketStep`): tap or scan what is coming back; each picked item asks why.
 * 3. Check (`ReturnsSummaryStep`): what comes back, each reason, what the customer gets; Confirm. Past the 3 days: a
 *    manager's own PIN (or the owner signed in) and a reason (a mark against Retail).
 * 4. Return complete (`ReturnDoneStep`): it says so, big; the return receipt prints by itself (one per sale), with
 *    Print again; "Another return for this customer" goes to their next ticket, which gets its own receipt.
 * The money rules are the server's and did not change (`apps/thriftplus` `returns/find|receipt|preview|batch`).
 * Every return taken, late ones too, is listed in Transactions → Returns (#72).
 * The window keeps one height on every step and its messages sit in lines that are always there, so nothing jumps.
 */
export default function ReturnWindow({ open, onClose, registerCode, practice }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const { openObject } = useObjectModal();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('start');
  const [way, setWay] = useState<Way | null>(null);
  const [q, setQ] = useState('');
  const [searched, setSearched] = useState('');
  const [found, setFound] = useState<ReturnsFind | null>(null);
  const [searching, setSearching] = useState(false);
  const [receipt, setReceipt] = useState<ReturnsReceipt | null>(null);
  const [ticked, setTicked] = useState<number[]>([]);
  const [reasons, setReasons] = useState<Record<number, ReturnReasonPick>>({});
  const [finished, setFinished] = useState<{ result: ReturnsDone; lines: ReturnDoneLine[] } | null>(null);
  const [print, setPrint] = useState<ReturnPrint>({ status: 'printing', error: '' });
  const printedOnce = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const [lastCart, setLastCart] = useState<number | null>(null);

  const reset = useCallback(() => {
    setStep('start');
    setWay(null);
    setReceipt(null);
    setFound(null);
    setTicked([]);
    setReasons({});
    setFinished(null);
    setQ('');
    setSearched('');
  }, []);

  /** Back from a ticket: to the same list when it came from one (no retyping a date), else a clean start. */
  const backToList = Boolean(found && !found.receipt && found.tickets.length > 1);
  function back() {
    if (!backToList) {
      listScroll.current = 0;
      reset();
      return;
    }
    setStep('start');
    setReceipt(null);
    setTicked([]);
    setReasons({});
  }

  // Every opening starts clean.
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open || step !== 'start') return;
    if (listScrollRef.current) listScrollRef.current.scrollTop = listScroll.current;
    searchRef.current?.focus();
  }, [open, step]);

  /** Open a ticket; `tag` (the item tag it was found by) ticks that line when it can come back. */
  const openReceipt = useCallback((next: ReturnsReceipt, tag = '') => {
    const code = tag.toLowerCase();
    const line = code ? next.lines.find((l) => l.sku.toLowerCase() === code && l.state === 'returnable') : undefined;
    setReceipt(next);
    setTicked(line ? [line.cart_line] : []);
    setReasons({});
    setStep('ticket');
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
      if (person == null) setLastCart(null);
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

  // A short screen (a register's small monitor, a phone): the window takes the whole screen so the items get the room.
  const compact = useMediaQuery('(max-height: 720px), (max-width: 599.95px)');
  const narrow = useMediaQuery('(max-width: 599.95px)');

  function pickWay(next: Way) {
    setWay(next);
    searchRef.current?.focus();
  }

  /**
   * The return receipt goes to the print server (the route every sale receipt uses). A failure is said on the done
   * screen and never undoes the return. Print again after a good print is a copy, and says COPY (REG-17).
   */
  async function printSlip(payload: Record<string, unknown> | null | undefined, again: boolean) {
    if (!payload) {
      setPrint({ status: 'none', error: '' });
      return;
    }
    setPrint({ status: 'printing', error: '' });
    try {
      const copy = again && printedOnce.current;
      await localPrintService.printReceipt(
        copy ? { ...payload, copy: true, receipt_number: `${String(payload.receipt_number ?? 'RETURN')} COPY` } : payload,
        false,
      );
      printedOnce.current = true;
      setPrint({ status: 'printed', error: '' });
    } catch (err) {
      const why = printErrorMessage(err).replace(/^The receipt did not print\.\s*/, '').trim();
      setPrint({ status: 'failed', error: why && !/[.!?]$/.test(why) ? `${why}.` : why });
    }
  }

  /** Confirm went through: the done screen, and the return receipt prints by itself (one per sale). */
  function done(result: ReturnsDone, summary: ReturnsSummary) {
    const options = receipt?.return_reasons?.length ? receipt.return_reasons : REASONS_FALLBACK;
    setFinished({
      result,
      lines: summary.lines.map((l) => ({ cart_line: l.cart_line, title: l.title, why: reasonWords(reasons[l.cart_line], options), credit: l.credit })),
    });
    setStep('done');
    // Their member window and the register's member block read again: the credit of now, not the old one.
    void queryClient.invalidateQueries({ queryKey: ['member-window', result.person_id] });
    void queryClient.invalidateQueries({ queryKey: ['thriftplus', 'member-card', result.person_id] });
    printedOnce.current = false;
    void printSlip(result.receipt, false);
  }

  /** "Another return for this customer": straight to their tickets; the next one is its own return and receipt. */
  function another() {
    const person = finished?.result.person_id;
    const cart = receipt?.cart ?? null;
    reset();
    setLastCart(cart);
    if (person != null) void search('', person);
  }

  function seeMember() {
    const person = finished?.result.person_id;
    onClose();
    if (person != null) openObject({ type: 'member', id: person });
  }

  const active = WAYS.find((w) => w.key === way);

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
      <DialogContent sx={{ pt: compact ? 1 : 1.5, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: compact ? 1 : 1.5 }}>
        <Box sx={{ flexShrink: 0 }}>
          <StepsLine at={STEP_AT[step]} narrow={narrow} />
        </Box>

        {step === 'start' ? (
          <StepFrame
            scrollRef={listScrollRef}
            top={
              <Stack spacing={1.5}>
                {narrow ? null : (
                  <Box>
                    <Typography variant="h5" component="h2" fontWeight={800} data-testid="return-start-head">Start a return</Typography>
                    <Typography color="text.secondary">Scan now, or pick how to find the sale.</Typography>
                  </Box>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: narrow ? 1 : 1.5 }} role="group" aria-label="Ways to find the sale">
                  {WAYS.map((w) => (
                    <Button
                      key={w.key}
                      variant="outlined"
                      color={way === w.key ? 'primary' : 'inherit'}
                      aria-pressed={way === w.key}
                      onClick={() => pickWay(w.key)}
                      data-testid={`return-way-${w.key}`}
                      sx={{
                        flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none',
                        minHeight: narrow ? 76 : 112, p: narrow ? 1 : 1.5, borderRadius: 2, gap: 0.25,
                        borderColor: way === w.key ? 'primary.main' : 'divider', bgcolor: way === w.key ? 'action.selected' : 'transparent',
                        '& .MuiSvgIcon-root': { color: 'primary.main', fontSize: narrow ? 26 : 34 },
                      }}
                    >
                      {w.icon}
                      <Typography component="span" fontWeight={800} sx={{ lineHeight: 1.2 }}>{w.title}</Typography>
                      {narrow ? null : <Typography component="span" variant="body2" color="text.secondary" sx={{ lineHeight: 1.2 }}>{w.help}</Typography>}
                    </Button>
                  ))}
                </Box>
                <Box>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      inputRef={searchRef}
                      autoFocus
                      fullWidth
                      label={active?.label ?? 'Scan or type to find the sale'}
                      placeholder={active?.placeholder ?? (narrow ? 'Scan, or type a name' : 'Scan a tag or a Thrift+ QR, or type a name, phone or ticket number')}
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
                      slotProps={{
                        inputLabel: { shrink: true },
                        htmlInput: { 'data-testid': 'returns-search', autoComplete: 'off', inputMode: way === 'ticket' ? 'numeric' : undefined },
                      }}
                    />
                    <Button variant="contained" onClick={() => void search()} disabled={searching || !q.trim()} startIcon={searching ? <CircularProgress size={20} color="inherit" aria-label="Searching" /> : <SearchRounded />} sx={{ ...BIG, px: 3 }}>
                      Find
                    </Button>
                  </Stack>
                  {/* Always one line: what to do now, in the words of the way that was tapped. */}
                  <Typography variant="body2" color="text.secondary" noWrap={!narrow} sx={{ pt: 0.5, px: 1.75, minHeight: 24 }} data-testid="return-start-hint">
                    {active?.hint ?? ANY_HINT}
                  </Typography>
                </Box>
              </Stack>
            }
          >
            <Box ref={resultsRef}>
              {!found ? (
                <Box sx={{ px: 1.75, pt: 0.5 }} data-testid="return-start-more">
                  <Typography fontWeight={700}>No item, no app and no ticket number?</Typography>
                  <Typography color="text.secondary">
                    Type the day of the sale (11/4), its total ($85.60), their email, or words from the item (brass lamp).
                  </Typography>
                </Box>
              ) : null}
              {found?.message ? <Alert severity="info" data-testid="returns-message">{found.message}</Alert> : null}
              {found?.person ? (
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                  <Avatar src={found.person.photo_url ?? undefined} sx={{ width: 48, height: 48 }}>{found.person.first_name.slice(0, 1)}</Avatar>
                  <Typography variant="h6" fontWeight={800}><MemberName personId={found.person.person_id}>{found.person.name}</MemberName></Typography>
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
                      ? 'Their tickets, newest first. Tap the one the items are on.'
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

        {step === 'ticket' && receipt ? (
          <ReturnTicketStep
            receipt={receipt}
            ticked={ticked}
            reasons={reasons}
            onTicked={setTicked}
            onReasons={setReasons}
            backToList={backToList}
            onBack={back}
            onNext={() => setStep('check')}
            narrow={narrow}
          />
        ) : null}

        {step === 'check' && receipt ? (
          <ReturnsSummaryStep
            receipt={receipt}
            lines={ticked}
            reasons={reasons}
            registerCode={registerCode}
            practice={practice || receipt.practice}
            onBack={() => setStep('ticket')}
            onDone={done}
          />
        ) : null}

        {step === 'done' && receipt && finished ? (
          <ReturnDoneStep
            receipt={receipt}
            done={finished.result}
            lines={finished.lines}
            print={print}
            onPrintAgain={() => void printSlip(finished.result.receipt, true)}
            onAnother={another}
            onMember={seeMember}
            onClose={onClose}
            narrow={narrow}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
