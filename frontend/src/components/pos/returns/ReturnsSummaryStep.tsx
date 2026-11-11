import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  confirmReturn,
  previewReturn,
  returnsErrorCode,
  type LateReason,
  type ReturnReasonPick,
  type ReturnsDone,
  type ReturnsReceipt,
  type ReturnsSummary,
  type ReturnsSummaryLine,
  type ReturnsTotals,
} from '../../../api/thriftplusReturns.api';
import { thriftErrorMessage } from '../../../api/thriftplusRegister.api';
import { MemberName } from '../../thriftplus/MemberName';
import { tbNumber } from '../../thriftplus/ThriftBucks';
import { formatCurrency } from '../../../utils/format';
import StepFrame from './StepFrame';
import { BIG, FOCUS_RING, GLANCE, REASONS_FALLBACK, reasonWords } from './returnsText';

interface Props {
  receipt: ReturnsReceipt;
  lines: number[];
  /** Why each line is coming back, by cart line (picked on the ticket). */
  reasons: Record<number, ReturnReasonPick>;
  registerCode: string;
  practice: boolean;
  onBack: () => void;
  /** It went through: what was given, and the lines as they were checked. */
  onDone: (done: ReturnsDone, summary: ReturnsSummary) => void;
}

/** The ThriftBucks in one plain number, net: what comes off their balance or what goes back to them ('' when even). */
function bucksWords(t: Pick<ReturnsTotals, 'bucks_back' | 'bucks_taken'>): string {
  const net = Number(t.bucks_taken) - Number(t.bucks_back);
  if (Math.abs(net) < 0.005) return '';
  return net > 0 ? `${tbNumber(net)} ThriftBucks come off their balance` : `${tbNumber(-net)} ThriftBucks go back to them`;
}

function lineWords(l: ReturnsSummaryLine, late: boolean): string {
  return [
    formatCurrency(l.credit),
    Number(l.shortfall) > 0 ? `${tbNumber(l.shortfall)} ThriftBucks already spent: credit is that much less` : '',
    // The late box below says it for the whole return.
    l.late && !late ? 'past the 3 days' : '',
  ].filter(Boolean).join(' · ');
}

/**
 * Step 3, Check (owner 2026-10-20; #90): who gets it, each item coming back with its reason, then per line and in all
 * the Thrift+ credit (80% of what was paid, tax included) and any ThriftBucks taken back or given back, and what to
 * glance at. Nothing is written until Confirm. Past the 3 days it also asks for a
 * reason and a manager's own register PIN (Bill 2026-10-21; not when the owner is signed in); the return is then a mark
 * against Retail on the original sale's cashier. Back and Confirm stay in view; the keyboard lands on Confirm (or on the
 * reasons when one is needed), so Enter finishes it.
 */
export default function ReturnsSummaryStep({ receipt, lines, reasons, registerCode, practice, onBack, onDone }: Props) {
  const options = receipt.return_reasons?.length ? receipt.return_reasons : REASONS_FALLBACK;
  const [summary, setSummary] = useState<ReturnsSummary | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reason, setReason] = useState<LateReason | ''>('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pinRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // The scanner's Enter that opened the summary must not also confirm it: Confirm listens once the cashier can see it.
  const armedAt = useRef(Number.POSITIVE_INFINITY);
  const tooSoon = () => Date.now() < armedAt.current;
  const reasonsRef = useRef<HTMLDivElement>(null);
  const lateHeadRef = useRef<HTMLParagraphElement>(null);
  // A phone stacks the reasons in one column, as one clean group.
  const narrow = useMediaQuery('(max-width: 599.95px)');

  useEffect(() => {
    let alive = true;
    previewReturn(receipt.cart, lines, registerCode)
      .then((s) => alive && setSummary(s))
      .catch((err) => alive && setLoadError(thriftErrorMessage(err, 'Could not work out the return.')));
    return () => {
      alive = false;
    };
  }, [receipt.cart, lines, registerCode]);

  const late = Boolean(summary?.late);
  const needsPin = late && !practice && !summary?.owner_signed_in;
  const ready = Boolean(summary?.ok) && (!late || (reason !== '' && (!needsPin || pin.length >= 4)));

  // Where the keyboard goes once the summary is in: the late question when a reason is needed (no reason is picked for
  // the cashier, so a stray Enter records nothing), else Confirm.
  useEffect(() => {
    if (!summary) return;
    armedAt.current = Date.now() + 600;
    if (summary.late) lateHeadRef.current?.focus();
    else confirmRef.current?.focus();
  }, [summary]);

  function pickReason(next: LateReason) {
    setReason(next);
    // The next thing to type: the PIN, or nothing (Confirm).
    window.setTimeout(() => (needsPin ? pinRef.current?.focus() : confirmRef.current?.focus()), 0);
  }

  /** Arrow keys move between the reasons (Down from the question goes to the first); Enter or Space picks one. */
  function moveInReasons(e: KeyboardEvent, fromHead = false) {
    const buttons = [...(reasonsRef.current?.querySelectorAll<HTMLElement>('button') ?? [])];
    if (!buttons.length) return;
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (fromHead && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) next = 0;
    else if (!fromHead && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) next = Math.min(at + 1, buttons.length - 1);
    else if (!fromHead && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) next = Math.max(at - 1, 0);
    if (next < 0) return;
    e.preventDefault();
    buttons[next].focus();
  }

  async function confirm() {
    if (!summary || !ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const body: Parameters<typeof confirmReturn>[0] = { cart: receipt.cart, cart_lines: lines, register: registerCode };
      // Why each item is coming back (#90): kept per returned line.
      const why = Object.fromEntries(
        lines.filter((id) => reasons[id]?.reason).map((id) => [String(id), { reason: reasons[id].reason, note: reasons[id].note.trim() }]),
      );
      if (Object.keys(why).length) body.reasons = why;
      if (late && reason) body.late = { reason, note: note.trim() };
      if (needsPin) body.pin = pin;
      onDone(await confirmReturn(body), summary);
    } catch (err) {
      const code = returnsErrorCode(err);
      if (code === 'PIN_WRONG' || code === 'PIN_LOCKED' || code === 'PIN_NEEDED') {
        const left = (err as { response?: { data?: { tries_left?: number } } })?.response?.data?.tries_left;
        setError(`${thriftErrorMessage(err)}${typeof left === 'number' ? ` ${left} ${left === 1 ? 'try' : 'tries'} left.` : ''}`);
        setPin('');
        pinRef.current?.focus();
      } else {
        setError(thriftErrorMessage(err, 'The return did not go through.'));
      }
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <Stack spacing={1}>
      {error ? <Alert severity="error" data-testid="returns-error">{error}</Alert> : null}
      <Stack direction="row" spacing={1.5}>
        <Button variant="outlined" onClick={onBack} disabled={busy} sx={BIG}>Back</Button>
        <Button
          ref={confirmRef}
          variant="contained"
          color="success"
          disabled={!ready || busy}
          onClick={() => void confirm()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && tooSoon()) e.preventDefault();
          }}
          disableFocusRipple
          // A clear ring for the keyboard, instead of the ripple that reads as half disabled.
          sx={{ ...BIG, flex: 1, ...FOCUS_RING }}
          data-testid="returns-confirm"
        >
          {busy ? 'Working…' : !summary ? 'Working out the return…' : !late || reason ? `Confirm: give ${formatCurrency(summary?.totals.credit ?? 0)} Thrift+ credit${practice ? ' (practice)' : ''}` : 'Say why it is allowed first'}
        </Button>
      </Stack>
    </Stack>
  );

  if (loadError) {
    return (
      <StepFrame bottom={<Button variant="outlined" fullWidth onClick={onBack} sx={BIG}>Back</Button>}>
        <Alert severity="error">{loadError}</Alert>
      </StepFrame>
    );
  }
  if (!summary) {
    return (
      <StepFrame bottom={footer}>
        <Typography variant="h6" fontWeight={800}>Check the return</Typography>
        <CircularProgress size={28} aria-label="Working out the return" sx={{ mt: 2 }} />
      </StepFrame>
    );
  }

  const t = summary.totals;
  const bucks = bucksWords(t);
  return (
    <StepFrame bottom={footer}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" fontWeight={800}>Check the return</Typography>
          <Typography color="text.secondary" data-testid="summary-who">
            {receipt.member ? <>For <MemberName personId={receipt.member.person_id}>{receipt.member.name}</MemberName></> : 'Not a Thrift+ member'} · ticket{' '}
            <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{receipt.receipt_number}</Box>
          </Typography>
        </Box>
        {late ? (
          <Paper variant="outlined" sx={{ p: 2, borderColor: 'warning.main' }} data-testid="returns-late-box">
            <Stack spacing={1.5}>
              <Typography
                ref={lateHeadRef}
                tabIndex={-1}
                fontWeight={800}
                onKeyDown={(e) => moveInReasons(e, true)}
                // Shown when the cursor is here, so the cashier sees where the keyboard is.
                sx={{ outline: 'none', borderRadius: 1, '&:focus': { outline: '2px dashed', outlineColor: 'warning.main', outlineOffset: 4 } }}
                data-testid="returns-late-head"
              >
                Past the 3 days: a manager has to OK it. Why is it allowed?
              </Typography>
              <Typography variant="body2" color="text.secondary">
                It counts as a mark against Retail for {receipt.cashier || 'the cashier'}, who rang the sale.
              </Typography>
              <ToggleButtonGroup
                ref={reasonsRef}
                exclusive
                color="warning"
                fullWidth
                value={reason}
                onChange={(_e, next: LateReason | null) => next && pickReason(next)}
                aria-label="Why it is allowed"
                onKeyDown={(e) => moveInReasons(e)}
                orientation={narrow ? 'vertical' : 'horizontal'}
              >
                {summary.reasons.map((r) => (
                  <ToggleButton
                    key={r.value}
                    value={r.value}
                    disableFocusRipple
                    sx={{ minHeight: 56, flex: 1, textTransform: 'none', fontWeight: 700, ...FOCUS_RING, '&.Mui-focusVisible': { ...FOCUS_RING['&.Mui-focusVisible'], outlineOffset: -3, zIndex: 1 } }}
                  >
                    {r.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <TextField size="small" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              {summary.owner_signed_in ? (
                <Alert severity="success">The owner is signed in: no PIN needed.</Alert>
              ) : practice ? null : (
                <TextField
                  inputRef={pinRef}
                  label="Manager PIN"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && !tooSoon() && void confirm()}
                  helperText="The manager's own register PIN (set on their Me page)."
                  slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': 'manager-pin-input' } }}
                  sx={{ maxWidth: 240 }}
                />
              )}
            </Stack>
          </Paper>
        ) : null}
        <Alert severity="info" icon={false} sx={{ fontWeight: 600 }}>{GLANCE}</Alert>
        <Paper variant="outlined" sx={{ p: 2 }} data-testid="returns-summary">
          <Typography variant="h5" fontWeight={800} data-testid="summary-credit">
            {`Thrift+ credit ${formatCurrency(t.credit)}`}
          </Typography>
          {bucks ? <Typography color="text.secondary" data-testid="summary-bucks">{bucks}</Typography> : null}
          <Divider sx={{ my: 1 }} />
          {summary.lines.map((l) => (
            <Box key={l.cart_line} sx={{ py: 0.75 }} data-testid={`summary-line-${l.cart_line}`}>
              <Stack direction="row" spacing={1} alignItems="baseline">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={700}>{l.title}</Typography>
                  <Typography variant="body2" color="text.secondary" data-testid={`summary-why-${l.cart_line}`}>
                    {reasonWords(reasons[l.cart_line], options) || 'No reason given'}
                  </Typography>
                </Box>
                <Typography color="text.secondary" sx={{ textAlign: 'right', maxWidth: '60%' }}>{lineWords(l, late)}</Typography>
              </Stack>
              {l.problems.length ? <Alert severity="error" sx={{ mt: 0.5 }}>{l.problems.join(' ')}</Alert> : null}
            </Box>
          ))}
        </Paper>

      </Stack>
    </StepFrame>
  );
}
