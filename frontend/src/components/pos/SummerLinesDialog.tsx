import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import type { Cart, CartLine } from '../../types/pos.types';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

function eligibleLines(cart: Cart | null): CartLine[] {
  return (cart?.lines ?? []).filter(
    (ln) => ln.line_kind === 'item' || ln.line_kind === 'manual',
  );
}

export function SummerLinesDialog({
  open,
  cart,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  cart: Cart | null;
  pending: boolean;
  onClose: () => void;
  onSave: (changes: { lineId: number; sale: 'summer' | 'none' }[]) => Promise<void>;
}) {
  const lines = useMemo(() => eligibleLines(cart), [cart]);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setChecked(new Set(lines.filter((ln) => ln.sale_label === 'summer').map((ln) => ln.id)));
  }, [open, lines]);

  const toggle = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    const changes: { lineId: number; sale: 'summer' | 'none' }[] = [];
    for (const ln of lines) {
      const wantSummer = checked.has(ln.id);
      const isSummer = ln.sale_label === 'summer';
      if (wantSummer !== isSummer) {
        changes.push({ lineId: ln.id, sale: wantSummer ? 'summer' : 'none' });
      }
    }
    await onSave(changes);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Summer sale · 50% off</DialogTitle>
      <DialogContent>
        {lines.length === 0 ? (
          <Typography color="text.secondary">Scan merchandise first, then mark summer items.</Typography>
        ) : (
          <List dense>
            {lines.map((ln) => (
              <ListItem key={ln.id} disablePadding>
                <ListItemButton onClick={() => toggle(ln.id)} dense>
                  <ListItemIcon>
                    <Checkbox edge="start" checked={checked.has(ln.id)} tabIndex={-1} disableRipple />
                  </ListItemIcon>
                  <ListItemText
                    primary={ln.description}
                    secondary={`${ln.quantity} × ${formatCurrency(ln.unit_price)}`}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={pending || lines.length === 0}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
