/**
 * The safe on the Cash page (Retail 5 step 1, Bill 2026-11-02: "if supplemental cash needs to exchange with safe that
 * needs a process/app page and alert"). Owner and managers only. The safe by bill and coin; when the office cash is short
 * of its target or over its cap, one line says so and [Swap with the safe] opens the swap prefilled with Dash's
 * suggestion. [Count the safe] is blind. The owner sets what the office should hold.
 */
import { useEffect, useState } from 'react';
import Close from '@mui/icons-material/Close';
import {
  Alert, Box, Button, Dialog, DialogContent, IconButton, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup,
  Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import CashCountPad from './CashCountPad';
import CountWindow from './CountWindow';
import { DrawerContentsGrid } from './DrawerContentsDialog';
import {
  BANK_KEY, SAFE_KEY, recordChange, safeCount, safeSwap, safeTarget, useBankDeposits, useSafe, type SafeData,
} from '../../hooks/useSafe';
import { completeBankTransaction } from '../../api/pos.api';
import DepositWindow from './DepositWindow';
import { CASH_DENOMINATIONS, countCents, type CashCount } from '../../utils/cashCounts';
import { tp } from '../../i18n/pos';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

const pieces = (c: CashCount) => CASH_DENOMINATIONS.filter((d) => (c[d.key] ?? 0) > 0)
  .map((d) => `${c[d.key]} × ${d.label}`).join(' · ');

function detail(err: unknown): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'That did not work.';
}

function SwapWindow({ open, data, onClose, lang }: { open: boolean; data: SafeData; onClose: () => void; lang?: string | null }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const client = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [put, setPut] = useState<CashCount>({});
  const [take, setTake] = useState<CashCount>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setPut(data.suggested.put_in_safe);
      setTake(data.suggested.take_from_safe);
      setError('');
    }
  }, [open, data.suggested]);
  const putC = countCents(put);
  const takeC = countCents(take);
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const { data: next } = await safeSwap(put, take);
      client.setQueryData(SAFE_KEY, next);
      enqueueSnackbar(tp('swapped', lang), { variant: 'success' });
      onClose();
    } catch (err) {
      setError(detail(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={(_e, reason) => { if (reason !== 'backdropClick' && !busy) onClose(); }}
      fullScreen={phone}
      maxWidth="sm"
      fullWidth
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
      data-testid="safe-swap"
    >
      <Stack direction="row" alignItems="center" sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
        <Typography variant="h5" fontWeight={800} sx={{ flex: 1 }}>{tp('swapSafe', lang)}</Typography>
        <IconButton onClick={onClose} aria-label={tp('close', lang)} size="large" disabled={busy}><Close /></IconButton>
      </Stack>
      <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" fontWeight={800}>{tp('takeFromSafe', lang)}</Typography>
        <CashCountPad value={take} onChange={setTake} disabled={busy} lang={lang} />
        <Typography variant="h6" fontWeight={800} sx={{ mt: 3 }}>{tp('putInSafe', lang)}</Typography>
        <CashCountPad value={put} onChange={setPut} disabled={busy} lang={lang} />
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: 2, pt: 1, position: 'sticky', bottom: 0, bgcolor: 'background.paper' }}>
        <Button
          fullWidth variant="contained" size="large" onClick={() => void submit()}
          disabled={busy || (!putC && !takeC)} data-testid="safe-swap-submit"
          sx={{ minHeight: 60, fontSize: '1.15rem', fontWeight: 800 }}
        >
          {tp('swapSafe', lang)} · {tp('inOffice', lang)} {money(takeC)} · {tp('toSafe', lang)} {money(putC)}
        </Button>
      </Box>
    </Dialog>
  );
}

export default function SafeCard({ lang }: { lang?: string | null }) {
  const { data, isLoading } = useSafe();
  const bank = useBankDeposits().data;
  const [depositOpen, setDepositOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeInto, setChangeInto] = useState<'office' | 'safe'>('safe');
  const client = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [swapOpen, setSwapOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [cap, setCap] = useState('');
  if (isLoading || !data) return null;

  const reasons = [
    Object.keys(data.short).length ? `${tp('officeShort', lang)} ${pieces(data.short)}` : '',
    data.over_cap ? `${tp('officeOverCap', lang)} ${data.target?.cap ? money(Math.round(Number.parseFloat(data.target.cap) * 100)) : ''}` : '',
  ].filter(Boolean);

  return (
    <Paper sx={{ p: 2 }} data-testid="safe-card">
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6">{tp('safe', lang)}</Typography>
        <Typography variant="h6" fontWeight={800}>{money(Math.round(Number.parseFloat(data.safe.total) * 100))}</Typography>
      </Stack>
      {data.needs_swap && (
        <Alert severity="warning" sx={{ mb: 1.5 }} data-testid="safe-needs-swap">
          <Typography fontWeight={700}>{tp('needsSwap', lang)}</Typography>
          {reasons.map((r) => <Typography key={r} variant="body2">{r}</Typography>)}
        </Alert>
      )}
      {data.safe.balance && <DrawerContentsGrid contents={data.safe.balance} lang={lang} hideZero />}
      {/* Four actions: a 2 x 2 grid on a phone, one row on a desk; the owner's target is a small link under them. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, auto)' }, justifyContent: 'start', gap: 1, mt: 2 }}>
        <Button variant={data.needs_swap ? 'contained' : 'outlined'} onClick={() => setSwapOpen(true)} sx={{ minHeight: 44 }}>
          {tp('swapSafe', lang)}
        </Button>
        <Button variant="outlined" onClick={() => setCountOpen(true)} sx={{ minHeight: 44 }}>{tp('countSafe', lang)}</Button>
        <Button variant="outlined" onClick={() => setDepositOpen(true)} sx={{ minHeight: 44 }} data-testid="deposit-open">
          {tp('bankDeposit', lang)}{bank?.bags.length ? ` (${bank.bags.length})` : ''}
        </Button>
        <Button variant="outlined" onClick={() => setChangeOpen(true)} sx={{ minHeight: 44 }} data-testid="change-open">
          {tp('bankChange', lang)}
        </Button>
      </Box>
      {data.owner && (
        <Button
          size="small"
          onClick={() => {
            setCap(data.target?.cap ?? '');
            setTargetOpen(true);
          }}
          sx={{ mt: 0.5, minHeight: 40, textTransform: 'none' }}
        >
          {tp('officeTarget', lang)}
        </Button>
      )}

      {(bank?.pending ?? []).map((p) => (
        <Stack key={p.id} direction="row" alignItems="center" spacing={1} sx={{ mt: 1.5 }} data-testid="deposit-pending">
          <Typography sx={{ flex: 1 }}>
            {tp('depositWaiting', lang)} {money(Math.round(Number.parseFloat(p.total) * 100))}
            {p.difference && Number.parseFloat(p.difference) !== 0
              ? ` · ${tp(Number.parseFloat(p.difference) > 0 ? 'over' : 'short', lang)} ${money(Math.abs(Math.round(Number.parseFloat(p.difference) * 100)))}`
              : ''}
          </Typography>
          <Button
            size="small"
            variant="contained"
            onClick={() => void completeBankTransaction(p.id).then(() => client.invalidateQueries({ queryKey: BANK_KEY }))}
          >
            {tp('markDeposited', lang)}
          </Button>
        </Stack>
      ))}
      {/* Change from the bank (Retail 5 step 3): what came back, into the office or the safe. */}
      <CountWindow
        open={changeOpen}
        title={tp('bankChange', lang)}
        submitLabel={tp('recordChange', lang)}
        onCancel={() => setChangeOpen(false)}
        onSubmit={async (count) => {
          try {
            await recordChange(count, changeInto);
            void client.invalidateQueries({ queryKey: SAFE_KEY });
            enqueueSnackbar(tp('changeRecorded', lang), { variant: 'success' });
            return null;
          } catch (err) {
            enqueueSnackbar(detail(err), { variant: 'error' });
            throw err;
          }
        }}
        lang={lang}
      >
        <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>{tp('changeInto', lang)}</Typography>
        <ToggleButtonGroup exclusive value={changeInto} onChange={(_e, v) => v && setChangeInto(v)} size="large" sx={{ mb: 1 }}>
          <ToggleButton value="safe">{tp('safe', lang)}</ToggleButton>
          <ToggleButton value="office">{tp('office', lang)}</ToggleButton>
        </ToggleButtonGroup>
      </CountWindow>
      <DepositWindow open={depositOpen} bags={bank?.bags ?? []} onClose={() => setDepositOpen(false)} lang={lang} />
      <SwapWindow open={swapOpen} data={data} onClose={() => setSwapOpen(false)} lang={lang} />
      <CountWindow
        open={countOpen}
        title={tp('countSafe', lang)}
        submitLabel={tp('saveCount', lang)}
        onCancel={() => setCountOpen(false)}
        onSubmit={async (count) => {
          try {
            const { data: next } = await safeCount(count);
            client.setQueryData(SAFE_KEY, next);
            const off = next.counted.difference;
            enqueueSnackbar(off == null || Number.parseFloat(off) === 0
              ? tp('safeCounted', lang)
              : `${tp('safeCounted', lang)} · ${tp(Number.parseFloat(off) > 0 ? 'over' : 'short', lang)} ${money(Math.abs(Math.round(Number.parseFloat(off) * 100)))}`,
            { variant: 'success' });
            return null;
          } catch (err) {
            enqueueSnackbar(detail(err), { variant: 'error' });
            throw err;
          }
        }}
        lang={lang}
      />
      {data.owner && (
        <CountWindow
          open={targetOpen}
          title={tp('officeTarget', lang)}
          submitLabel={tp('saveTarget', lang)}
          initial={data.target?.count}
          onCancel={() => setTargetOpen(false)}
          onSubmit={async (count) => {
            try {
              const { data: next } = await safeTarget(count, cap);
              client.setQueryData(SAFE_KEY, next);
              return null;
            } catch (err) {
              enqueueSnackbar(detail(err), { variant: 'error' });
              throw err;
            }
          }}
          lang={lang}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{tp('officeTargetHelp', lang)}</Typography>
          <TextField
            label={tp('officeCap', lang)}
            value={cap}
            onChange={(e) => setCap(e.target.value.replace(/[^0-9.]/g, ''))}
            inputProps={{ inputMode: 'decimal' }}
            fullWidth
            size="small"
            sx={{ mb: 1 }}
          />
        </CountWindow>
      )}
    </Paper>
  );
}
