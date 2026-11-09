/**
 * Fix a price (owner only, Bill 2026-11-09): a line rang at the wrong price is made right today. Pick the line, type the
 * right price for one; the result shows before Save. A member gets the difference and its tax as Thrift+ credit;
 * anyone else gets it back as cash or a card refund (the owner hands it over and this records it).
 */
import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { priceFix, type PriceFixResult } from '../../../api/thriftplus.api';
import type { Cart } from '../../../types/pos.types';
import { money } from './retailCopy';

type BackAs = 'credit' | 'cash' | 'card';

function detail(err: unknown, fallback: string): string {
  return (isAxiosError(err) ? (err.response?.data as { detail?: string } | undefined)?.detail : undefined) ?? fallback;
}

export function PriceFixDialog({
  open, cart, memberName, blocked, onClose, onDone,
}: {
  open: boolean;
  cart: Cart;
  memberName: string | null;
  /** Lines already returned or fixed. */
  blocked: Set<number>;
  onClose: () => void;
  onDone: () => void;
}) {
  const lines = (cart.lines ?? []).filter((l) => (l.line_kind === 'item' || l.line_kind === 'manual') && !blocked.has(l.id));
  const [lineId, setLineId] = useState<number | ''>('');
  const [price, setPrice] = useState('');
  const [backAs, setBackAs] = useState<BackAs>(memberName ? 'credit' : 'cash');
  const [note, setNote] = useState('');
  const [shown, setShown] = useState<PriceFixResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLineId(lines.length === 1 ? lines[0].id : '');
    setPrice('');
    setNote('');
    setShown(null);
    setError('');
    setBackAs(memberName ? 'credit' : 'cash');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Work the result out as the price is typed (nothing is written).
  useEffect(() => {
    setShown(null);
    setError('');
    if (!open || lineId === '' || price.trim() === '' || Number.isNaN(Number(price))) return undefined;
    const t = window.setTimeout(() => {
      priceFix({ cart_line: lineId, unit_price: price })
        .then(setShown)
        .catch((err) => setError(detail(err, 'Could not work it out.')));
    }, 300);
    return () => window.clearTimeout(t);
  }, [open, lineId, price]);

  const save = useMutation({
    mutationFn: () => priceFix({ cart_line: lineId as number, unit_price: price, back_as: backAs, note, confirm: true }),
    onSuccess: () => { onDone(); onClose(); },
    onError: (err) => setError(detail(err, 'Could not fix the price.')),
  });

  const who = memberName ?? 'The customer';
  const how = backAs === 'credit' ? 'Thrift+ credit' : backAs === 'cash' ? 'cash' : 'a card refund';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Fix a price</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {lines.length === 0 ? (
            <Typography sx={{ fontSize: 14 }}>No line on this sale can be fixed (returned or already fixed).</Typography>
          ) : (
            <>
              <TextField select size="small" label="Line" value={lineId} onChange={(e) => setLineId(Number(e.target.value))}>
                {lines.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.description} · {money(l.unit_price)}{(l.quantity || 1) > 1 ? ` × ${l.quantity}` : ''}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Right price for one"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputProps={{ inputMode: 'decimal' }}
                autoFocus
              />
              <TextField select size="small" label="Give it back as" value={backAs} onChange={(e) => setBackAs(e.target.value as BackAs)}>
                {memberName ? <MenuItem value="credit">Thrift+ credit</MenuItem> : null}
                <MenuItem value="cash">Cash (hand it over)</MenuItem>
                <MenuItem value="card">Card refund (on the terminal)</MenuItem>
              </TextField>
              <TextField size="small" label="Why (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              {shown && shown.ok ? (
                <Alert severity="info" icon={false}>
                  <b>{who} gets {money(shown.money_back)} {how}</b> ({money(shown.taxable_back)} + {money(shown.tax_back)} tax).
                  {Number(shown.bucks_back) > 0 && memberName ? ` ${shown.bucks_back} ThriftBucks used on it come back.` : ''}
                  {memberName ? ' ThriftBucks the item earned stay.' : ''}
                </Alert>
              ) : null}
              {shown && !shown.ok ? <Alert severity="warning">{shown.problems.join(' ')}</Alert> : null}
              {error ? <Alert severity="error">{error}</Alert> : null}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!shown?.ok || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
