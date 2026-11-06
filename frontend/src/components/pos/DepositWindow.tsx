/**
 * A bank deposit (Retail 5 step 2, Bill 2026-11-02: "BANK deposits (multiple cash drops or money from supplemental
 * drawer deposits)"). Tick the bags it covers (drawers' drops and close-out drops); the count starts as their bills and
 * can be changed; say whether the cash leaves the office or the safe. Counted beside the bags' sum shows to whoever
 * records it; far off needs a note. Owner and managers only.
 */
import { useEffect, useMemo, useState } from 'react';
import Close from '@mui/icons-material/Close';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogContent, FormControlLabel, IconButton, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import CashCountPad from './CashCountPad';
import { BANK_KEY, SAFE_KEY, recordDeposit, type DepositBagRow } from '../../hooks/useSafe';
import { addCounts, countCents, type CashCount } from '../../utils/cashCounts';
import { tp } from '../../i18n/pos';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
const cents = (v: string) => Math.round((Number.parseFloat(v) || 0) * 100);
const key = (b: DepositBagRow) => `${b.kind}:${b.ref}`;

export default function DepositWindow({ open, bags, onClose, lang }: {
  open: boolean; bags: DepositBagRow[]; onClose: () => void; lang?: string | null;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const client = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState<CashCount>({});
  const [source, setSource] = useState<'office' | 'safe'>('office');
  const [note, setNote] = useState('');
  const [noteNeeded, setNoteNeeded] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setPicked(new Set());
      setCount({});
      setNote('');
      setNoteNeeded('');
      setError('');
    }
  }, [open]);

  const chosen = useMemo(() => bags.filter((b) => picked.has(key(b))), [bags, picked]);
  const bagsCents = chosen.reduce((sum, b) => sum + cents(b.total), 0);
  const counted = countCents(count);
  const toggle = (b: DepositBagRow) => {
    const next = new Set(picked);
    const on = !next.has(key(b));
    if (on) next.add(key(b));
    else next.delete(key(b));
    setPicked(next);
    // The count follows the bags' bills; change it after if what is in hand differs.
    setCount((c) => addCounts(c, b.count, on ? 1 : -1));
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await recordDeposit(chosen.map((b) => ({ kind: b.kind, ref: b.ref })), count, source, note);
      void client.invalidateQueries({ queryKey: BANK_KEY });
      void client.invalidateQueries({ queryKey: SAFE_KEY });
      enqueueSnackbar(tp('depositRecorded', lang), { variant: 'success' });
      onClose();
    } catch (err) {
      const body = (err as { response?: { data?: { detail?: string; code?: string } } })?.response?.data;
      if (body?.code === 'NOTE_REQUIRED') setNoteNeeded(body.detail ?? '');
      else setError(body?.detail ?? 'That did not work.');
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
      data-testid="deposit-window"
    >
      <Stack direction="row" alignItems="center" sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
        <Typography variant="h5" fontWeight={800} sx={{ flex: 1 }}>{tp('bankDeposit', lang)}</Typography>
        <IconButton onClick={onClose} aria-label={tp('close', lang)} size="large" disabled={busy}><Close /></IconButton>
      </Stack>
      <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" fontWeight={800}>{tp('bags', lang)}</Typography>
        {bags.length === 0 ? (
          <Typography color="text.secondary" sx={{ mb: 1 }}>{tp('noBags', lang)}</Typography>
        ) : (
          <Stack sx={{ mb: 1 }}>
            {bags.map((b) => (
              <FormControlLabel
                key={key(b)}
                control={<Checkbox checked={picked.has(key(b))} onChange={() => toggle(b)} disabled={busy} />}
                label={`${b.register} · ${tp(b.kind === 'drop' ? 'bagDrop' : 'bagClose', lang)} · ${format(new Date(b.at), 'EEE MMM d, h:mm a')} · ${money(cents(b.total))}`}
                sx={{ minHeight: 44 }}
              />
            ))}
          </Stack>
        )}
        <Typography variant="h6" fontWeight={800} sx={{ mt: 1 }}>{tp('fromWhere', lang)}</Typography>
        <ToggleButtonGroup exclusive value={source} onChange={(_e, v) => v && setSource(v)} sx={{ mb: 2 }} size="large">
          <ToggleButton value="office">{tp('office', lang)}</ToggleButton>
          <ToggleButton value="safe">{tp('safe', lang)}</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="h6" fontWeight={800}>{tp('toBank', lang)}</Typography>
        <CashCountPad value={count} onChange={setCount} disabled={busy} lang={lang} />
        {chosen.length > 0 && counted > 0 && (
          // While counting it says what is left (no red mid-count); red only once the count is over the envelopes.
          <Typography sx={{ mt: 1.5 }} color={counted === bagsCents ? 'success.main' : counted > bagsCents ? 'error.main' : 'text.secondary'}
            fontWeight={700} data-testid="deposit-vs-bags">
            {tp('bagsSay', lang)} {money(bagsCents)} · {tp('counted', lang)} {money(counted)}
            {counted === bagsCents ? ' ✓' : counted > bagsCents ? ` · ${tp('over', lang)} ${money(counted - bagsCents)}` : ` · ${money(bagsCents - counted)} ${tp('leftToCount', lang)}`}
          </Typography>
        )}
        {noteNeeded && (
          <>
            <Alert severity="warning" sx={{ mt: 1 }}>{noteNeeded}</Alert>
            <TextField label={tp('noteNeeded', lang)} value={note} onChange={(e) => setNote(e.target.value)}
              fullWidth multiline minRows={2} sx={{ mt: 1 }} />
          </>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: 2, pt: 1, position: 'sticky', bottom: 0, bgcolor: 'background.paper' }}>
        <Button
          fullWidth variant="contained" size="large" onClick={() => void submit()}
          disabled={busy || counted === 0 || (Boolean(noteNeeded) && !note.trim())} data-testid="deposit-submit"
          sx={{ minHeight: 60, fontSize: '1.15rem', fontWeight: 800 }}
        >
          {tp('recordDeposit', lang)} · {money(counted)}
        </Button>
      </Box>
    </Dialog>
  );
}
