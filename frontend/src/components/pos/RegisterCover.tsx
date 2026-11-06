/**
 * Cover (Bill, 2026-10-21, digest point 3): someone steps in at the register for a few minutes. They tap Cover and type
 * their own register PIN once; the register says "Covered by ..." and the sales made meanwhile are theirs. It ends with
 * Back and the drawer's own cashier's PIN, or after 10 idle minutes (the server ends it; this page re-reads the drawer
 * when the time is up).
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { acceptCover, coverDrawer, endDrawerCover, spotCheck, type CoverReport } from '../../api/pos.api';
import type { Drawer } from '../../types/pos.types';
import CountWindow from './CountWindow';
import { tp } from '../../i18n/pos';
import { useLanguage } from './windows/retailCopy';
import { CASH_DENOMINATIONS, type CashKey } from '../../utils/cashCounts';

type Back = CoverReport & { drawer: number };

const money = (v: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v) || 0);

/** The cash that moved while covered, one line each: the cashier reads it before accepting the drawer. */
function CoverLines({ back }: { back: Back }) {
  const time = (iso: string) => format(new Date(iso), 'h:mm a');
  const rows = [
    ...back.sales.map((s) => ({ at: s.at, text: `Sale ${s.receipt} · ${money(s.total)} · cash in ${money(s.cash)}${Number(s.change) ? `, change ${money(s.change)}` : ''}` })),
    ...back.drops.map((d) => ({ at: d.at, text: `Cash drop · ${money(d.total)}${d.reason ? ` · ${d.reason}` : ''}` })),
    ...back.movements.map((m) => ({ at: m.at, text: `${m.kind === 'paid_in' ? 'Paid in' : 'Paid out'} · ${money(m.total)} · ${m.reason}` })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  if (!rows.length) return null;
  return (
    <Stack spacing={0.25} sx={{ mb: 1.5 }} data-testid="cover-lines">
      {rows.map((r, i) => (
        <Typography key={i} variant="body2">{time(r.at)} · {r.text}</Typography>
      ))}
    </Stack>
  );
}

function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'them';
}

function pinError(err: unknown): string {
  const data = (err as { response?: { data?: { detail?: string; tries_left?: number } } })?.response?.data;
  if (!data?.detail) return 'That did not work. Try again.';
  return data.tries_left != null ? `${data.detail} ${data.tries_left} tries left.` : data.detail;
}

/**
 * The register's Cover pieces: `button` (beside the register's header), `banner` (while someone covers) and `dialog`.
 * `drawer`: the register's open drawer, or null when there is none to cover.
 */
export function useRegisterCover(drawer: Drawer | null): { button: ReactNode; banner: ReactNode; dialog: ReactNode } {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'cover' | 'back' | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cover = drawer?.cover ?? null;
  const lang = useLanguage();
  // Taking the drawer on while covering (Cash Drops #70).
  const [accept, setAccept] = useState(false);
  // After Back (Cash Drops #70; Retail 4 step 4): what moved, the bills and coins to count, then Accept.
  const [back, setBack] = useState<Back | null>(null);
  const [counted, setCounted] = useState(false);
  // Closing the count without counting: accept the drawer as it is (Bill: "count the drawer or at least accept").
  const [skipCount, setSkipCount] = useState(false);
  const [accepting, setAccepting] = useState(false);

  // Ten idle minutes: when the time is up, read the drawer again (a sale since keeps the cover going).
  useEffect(() => {
    if (!cover) return undefined;
    const wait = new Date(cover.idle_ends_at).getTime() - Date.now();
    const timer = window.setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: ['drawers'] }),
      Math.max(wait, 0) + 1000,
    );
    return () => window.clearTimeout(timer);
  }, [cover, queryClient]);

  const close = () => {
    setMode(null);
    setPin('');
    setError('');
    setAccept(false);
  };

  const acceptBack = async () => {
    if (!back || accepting) return;
    setAccepting(true);
    try {
      await acceptCover(back.drawer, back.cover);
      setBack(null);
      setCounted(false);
      setSkipCount(false);
      setError('');
    } catch (err) {
      setError(pinError(err));
    } finally {
      setAccepting(false);
    }
  };

  const submit = async () => {
    if (!drawer || !mode || !pin.trim() || (mode === 'cover' && !accept)) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await (mode === 'cover' ? coverDrawer : endDrawerCover)(drawer.id, pin.trim());
      queryClient.setQueriesData({ queryKey: ['drawers'] }, (old: unknown) => {
        const page = old as { results?: Drawer[] } | undefined;
        if (!page?.results) return old;
        return { ...page, results: page.results.map((d) => (d.id === data.id ? data : d)) };
      });
      void queryClient.invalidateQueries({ queryKey: ['drawers'] });
      const report = (data as Drawer & { cover_report?: CoverReport }).cover_report;
      if (mode === 'back' && report) {
        setCounted(false);
        setBack({ ...report, drawer: data.id });
      }
      close();
    } catch (err) {
      setError(pinError(err));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const button = drawer && drawer.status === 'open' && !cover ? (
    <Button size="small" variant="outlined" onClick={() => setMode('cover')} data-testid="cover-button">
      Cover
    </Button>
  ) : null;

  const banner = cover ? (
    <Alert
      severity="warning"
      variant="filled"
      icon={false}
      data-testid="cover-banner"
      sx={{ mb: 1, alignItems: 'center', '& .MuiAlert-message': { flex: 1, minWidth: 0 } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography fontWeight={800} fontSize="1.1rem">Covered by {cover.user_name}</Typography>
          <Typography variant="body2">
            Sales go to {firstName(cover.user_name)}. {cover.cashier_name} taps Back with their PIN; it also ends after 10
            minutes with no sales.
          </Typography>
        </Box>
        <Button variant="contained" color="inherit" sx={{ color: 'warning.dark' }} onClick={() => setMode('back')}>
          Back
        </Button>
      </Box>
    </Alert>
  ) : null;

  const dialog = (
    <Dialog open={mode !== null} onClose={busy ? undefined : close} maxWidth="xs" fullWidth data-testid="cover-dialog">
      <DialogTitle>{mode === 'back' ? `Back: ${cover?.cashier_name ?? 'the cashier'}'s PIN` : 'Cover this register'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {mode === 'back'
            ? `${cover?.cashier_name ?? 'The drawer\'s cashier'} types their register PIN to take the register back.`
            : `Stepping in for ${drawer?.current_cashier_name ?? 'the cashier'}? Type your own register PIN.`}
        </Typography>
        <TextField
          label={mode === 'back' ? `${firstName(cover?.cashier_name)}'s PIN` : 'Your register PIN'}
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          inputProps={{ inputMode: 'numeric', autoComplete: 'off' }}
          autoFocus
          fullWidth
          error={Boolean(error)}
          helperText={error || ' '}
        />
        {mode === 'cover' ? (
          <FormControlLabel
            control={<Checkbox checked={accept} onChange={(e) => setAccept(e.target.checked)} data-testid="cover-accept" />}
            label={tp('takeDrawer', lang)}
          />
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy || pin.length < 4 || (mode === 'cover' && !accept)}>
          {mode === 'back' ? 'Back' : 'Cover'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  // The drawer back: with bills and coins to count, the count window (blind) and Accept under its answer; with no cash
  // moved, the list (if any) and Accept. Either way it ends only with Accept, which is logged.
  const spotKeys = CASH_DENOMINATIONS.filter((d) => back?.changed[d.key]).map((d) => d.key);
  const name = firstName(back?.covered_by);
  const acceptButton = (
    <Button fullWidth variant="contained" color="success" size="large" onClick={() => void acceptBack()} disabled={accepting}
      sx={{ minHeight: 60, fontSize: '1.2rem', fontWeight: 800, mt: 1.5 }} data-testid="cover-accept-back">
      {tp('acceptDrawer', lang)}
    </Button>
  );
  const spotWindow = back && spotKeys.length && !skipCount ? (
    <CountWindow
      open
      title={tp('drawerBack', lang).replace('{name}', name)}
      submitLabel={tp('check', lang)}
      keys={spotKeys}
      // Before the count, closing it goes to Accept without counting; after, Done is Accept.
      onCancel={() => (counted ? void acceptBack() : setSkipCount(true))}
      onSubmit={async (count) => {
        setError('');
        try {
          const { data } = await spotCheck(back.drawer, back.cover, count as Record<string, number>);
          setCounted(true);
          return data.count_check;
        } catch (err) {
          setError(pinError(err));
          throw err;
        }
      }}
      // Under the answer: Accept, and why it did not go through if it did not.
      after={<>{error ? <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert> : null}{acceptButton}</>}
      lang={lang}
    >
      <CoverLines back={back} />
      <Typography sx={{ mb: 1 }} data-testid="spot-changed">
        {tp('whileCovered', lang).replace('{name}', name)}{' '}
        {CASH_DENOMINATIONS.filter((d) => back.changed[d.key])
          .map((d) => `${d.label} ${(back.changed[d.key] ?? 0) > 0 ? '+' : '−'}${Math.abs(back.changed[d.key] ?? 0)}`)
          .join(' · ')}
      </Typography>
      <Typography variant="body2" color="text.secondary">{tp('countFirst', lang)}</Typography>
      {error ? <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert> : null}
    </CountWindow>
  ) : (
    <Dialog open={back !== null} maxWidth="xs" fullWidth data-testid="cover-back-dialog">
      <DialogTitle>{tp('drawerBack', lang).replace('{name}', name)}</DialogTitle>
      <DialogContent>
        {back ? <CoverLines back={back} /> : null}
        <Typography>
          {back && spotKeys.length
            ? `Not counted. ${tp('whileCovered', lang).replace('{name}', name)} ${CASH_DENOMINATIONS.filter((d) => back.changed[d.key]).map((d) => d.label).join(', ')}.`
            : tp('noCashMoved', lang).replace('{name}', name)}
        </Typography>
        {error ? <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert> : null}
        {acceptButton}
      </DialogContent>
    </Dialog>
  );

  return { button, banner, dialog: <>{dialog}{spotWindow}</> };
}
