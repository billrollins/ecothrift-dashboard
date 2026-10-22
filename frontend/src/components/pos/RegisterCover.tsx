/**
 * Cover (Bill, 2026-10-21, digest point 3): someone steps in at the register for a few minutes. They tap Cover and type
 * their own register PIN once; the register says "Covered by ..." and the sales made meanwhile are theirs. It ends with
 * Back and the drawer's own cashier's PIN, or after 10 idle minutes (the server ends it; this page re-reads the drawer
 * when the time is up).
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { coverDrawer, endDrawerCover } from '../../api/pos.api';
import type { Drawer } from '../../types/pos.types';

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
  };

  const submit = async () => {
    if (!drawer || !mode || !pin.trim()) return;
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
            : `Stepping in for ${drawer?.current_cashier_name ?? 'the cashier'}? Type your own register PIN. Sales go to you until they come back.`}
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
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy || pin.length < 4}>
          {mode === 'back' ? 'Back' : 'Cover'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  return { button, banner, dialog };
}
