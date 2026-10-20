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
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import {
  confirmReturn,
  previewReturn,
  returnsErrorCode,
  type LateReason,
  type ReturnsDone,
  type ReturnsReceipt,
  type ReturnsSummary,
} from '../../../api/thriftplusReturns.api';
import { thriftErrorMessage } from '../../../api/thriftplusRegister.api';
import { tbNumber } from '../../../components/thriftplus/ThriftBucks';
import { formatCurrency } from '../../../utils/format';
import { GLANCE } from './returnsText';

interface Props {
  receipt: ReturnsReceipt;
  lines: number[];
  registerCode: string;
  practice: boolean;
  onBack: () => void;
  onDone: (done: ReturnsDone) => void;
}

const big = { minHeight: 56, fontSize: '1.1rem', fontWeight: 700, borderRadius: 2 } as const;

/**
 * Step 3 (owner 2026-10-20): the summary. Per line and in all, the Thrift+ credit (80% of what was paid, tax included),
 * ThriftBucks taken back and given back, and what to check. Past the 3 days it also asks for the owner PIN (not when the
 * owner is signed in) and a reason; the return is then a mark against Retail on the original sale's cashier.
 */
export default function ReturnsSummaryStep({ receipt, lines, registerCode, practice, onBack, onDone }: Props) {
  const [summary, setSummary] = useState<ReturnsSummary | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reason, setReason] = useState<LateReason | ''>('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pinRef = useRef<HTMLInputElement>(null);

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
  const noPinSet = needsPin && summary != null && !summary.pin_set;
  const ready = Boolean(summary?.ok) && (!late || (reason !== '' && (!needsPin || (pin.length >= 4 && !noPinSet))));

  async function confirm() {
    if (!summary || !ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const body: Parameters<typeof confirmReturn>[0] = { cart: receipt.cart, cart_lines: lines, register: registerCode };
      if (late && reason) body.late = { reason, note: note.trim() };
      if (needsPin) body.pin = pin;
      onDone(await confirmReturn(body));
    } catch (err) {
      const code = returnsErrorCode(err);
      if (code === 'PIN_WRONG' || code === 'PIN_LOCKED' || code === 'PIN_NOT_SET' || code === 'PIN_NEEDED') {
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

  if (loadError) {
    return (
      <Stack spacing={2}>
        <Alert severity="error">{loadError}</Alert>
        <Button variant="outlined" onClick={onBack} sx={big}>Back</Button>
      </Stack>
    );
  }
  if (!summary) return <CircularProgress aria-label="Working out the return" />;

  const t = summary.totals;
  return (
    <Stack spacing={2} sx={{ maxWidth: 760 }}>
      <Typography variant="h6" fontWeight={800}>Summary</Typography>
      {practice ? (
        <Alert severity="warning">Practice: this works out what the return would give. Nothing is written.</Alert>
      ) : null}
      <Paper variant="outlined" sx={{ p: 2 }} data-testid="returns-summary">
        {summary.lines.map((l) => (
          <Box key={l.cart_line} sx={{ py: 1 }} data-testid={`summary-line-${l.cart_line}`}>
            <Typography fontWeight={700}>{l.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {`Thrift+ credit ${formatCurrency(l.credit)}`}
              {Number(l.bucks_back) > 0 ? ` · ThriftBucks given back ${tbNumber(l.bucks_back)}` : ''}
              {Number(l.bucks_taken) > 0 ? ` · ThriftBucks taken back ${tbNumber(l.bucks_taken)}` : ''}
              {Number(l.shortfall) > 0 ? ` · ${tbNumber(l.shortfall)} ThriftBucks already spent: credit is that much less` : ''}
              {l.late ? ' · LATE' : ''}
            </Typography>
            {l.problems.length ? <Alert severity="error" sx={{ mt: 0.5 }}>{l.problems.join(' ')}</Alert> : null}
          </Box>
        ))}
        <Divider sx={{ my: 1 }} />
        <Typography variant="h5" fontWeight={800} data-testid="summary-credit">
          {`Thrift+ credit ${formatCurrency(t.credit)}`}
        </Typography>
        <Typography color="text.secondary" data-testid="summary-bucks">
          {`ThriftBucks given back ${tbNumber(t.bucks_back)} · taken back ${tbNumber(t.bucks_taken)}`}
        </Typography>
      </Paper>
      <Alert severity="info" icon={false} sx={{ fontWeight: 600 }}>{GLANCE}</Alert>

      {late ? (
        <Paper variant="outlined" sx={{ p: 2, borderColor: 'warning.main' }} data-testid="returns-late-box">
          <Stack spacing={1.5}>
            <Typography fontWeight={800}>Past the 3 days: the owner has to OK it.</Typography>
            <Typography variant="body2" color="text.secondary">
              It is marked against Retail, on the cashier who rang the sale ({receipt.cashier || 'unknown'}).
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={reason}
              onChange={(_e, next: LateReason | null) => next && setReason(next)}
              aria-label="Why it is allowed"
              sx={{ flexWrap: 'wrap' }}
            >
              {summary.reasons.map((r) => (
                <ToggleButton key={r.value} value={r.value} sx={{ minHeight: 56, flex: '1 1 160px', textTransform: 'none', fontWeight: 700 }}>
                  {r.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <TextField size="small" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            {summary.owner_signed_in ? (
              <Alert severity="success">The owner is signed in: no PIN needed.</Alert>
            ) : practice ? null : noPinSet ? (
              <Alert severity="warning">There is no owner PIN yet. The owner can sign in here, or set the PIN in Settings → Thrift+.</Alert>
            ) : (
              <TextField
                inputRef={pinRef}
                autoFocus
                label="Owner PIN"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                onKeyDown={(e) => e.key === 'Enter' && void confirm()}
                slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': 'owner-pin-input' } }}
                sx={{ maxWidth: 240 }}
              />
            )}
          </Stack>
        </Paper>
      ) : null}
      {error ? <Alert severity="error" data-testid="returns-error">{error}</Alert> : null}
      <Stack direction="row" spacing={1.5}>
        <Button variant="outlined" onClick={onBack} disabled={busy} sx={big}>Back</Button>
        <Button
          variant="contained"
          color="success"
          disabled={!ready || busy}
          onClick={() => void confirm()}
          sx={{ ...big, flex: 1 }}
          data-testid="returns-confirm"
        >
          {busy ? 'Working…' : practice ? 'Confirm (practice)' : `Confirm: give ${formatCurrency(t.credit)} Thrift+ credit`}
        </Button>
      </Stack>
    </Stack>
  );
}
