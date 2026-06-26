import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import type { TarsPartLine, TarsProcurementGroup } from './tarsWorkTypes';
import { newId } from './tarsWorkRollup';

export interface ProcurementGroupDialogProps {
  open: boolean;
  parts: TarsPartLine[];
  existing?: TarsProcurementGroup | null;
  onClose: () => void;
  onSave: (group: TarsProcurementGroup) => void;
  onDelete?: () => void;
  /** partsList = order modal from parts drawer; repair = inline repair action flow. */
  context?: 'partsList' | 'repair';
}

export function ProcurementGroupDialog({
  open,
  parts,
  existing,
  onClose,
  onSave,
  onDelete,
  context = 'repair',
}: ProcurementGroupDialogProps) {
  const [supplierName, setSupplierName] = useState('');
  const [cartUrl, setCartUrl] = useState('');
  const [shipping, setShipping] = useState('');
  const [tax, setTax] = useState('');
  const [fees, setFees] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setSupplierName(existing?.supplierName ?? '');
    setCartUrl(existing?.cartUrl ?? '');
    setShipping(existing != null ? String(existing.shipping) : '');
    setTax(existing != null ? String(existing.tax) : '');
    setFees(existing != null ? String(existing.fees) : '');
    setNotes(existing?.notes ?? '');
    if (existing?.partIds) {
      setSelectedPartIds(existing.partIds);
    } else if (context === 'partsList') {
      const unassigned = parts.filter((p) => !p.procurementGroupId).map((p) => p.id);
      setSelectedPartIds(unassigned.length > 0 ? unassigned : parts.map((p) => p.id));
    } else {
      setSelectedPartIds(parts.map((p) => p.id));
    }
  }, [open, existing, parts, context]);

  const parseMoney = (raw: string) => {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const handleSave = () => {
    if (selectedPartIds.length === 0) return;
    onSave({
      id: existing?.id ?? newId(),
      supplierName: supplierName.trim() || 'Supplier',
      cartUrl: cartUrl.trim(),
      shipping: parseMoney(shipping),
      tax: parseMoney(tax),
      fees: parseMoney(fees),
      notes: notes.trim(),
      partIds: selectedPartIds,
    });
    onClose();
  };

  const title =
    context === 'partsList'
      ? existing ? 'Edit order' : 'New order'
      : existing ? 'Edit procurement group' : 'Add shipping / tax / fees';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Select parts from one cart or order. Shipping, tax, and fees apply to the group — not duplicated on each part line.
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel id="proc-parts-label">Parts in this order</InputLabel>
            <Select
              labelId="proc-parts-label"
              label="Parts in this order"
              multiple
              value={selectedPartIds}
              onChange={(e) => setSelectedPartIds(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
              renderValue={(selected) =>
                parts
                  .filter((p) => selected.includes(p.id))
                  .map((p) => p.description || p.partNumber || 'Part')
                  .join(', ')
              }
            >
              {parts.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.description || p.partNumber || 'Part'} · qty {p.qty}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="Supplier / site" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} fullWidth size="small" placeholder="Amazon" />
          <TextField label="Cart / order URL" value={cartUrl} onChange={(e) => setCartUrl(e.target.value)} fullWidth size="small" />
          <Stack direction="row" spacing={1}>
            <TextField label="Shipping" value={shipping} onChange={(e) => setShipping(e.target.value)} fullWidth size="small" type="number" />
            <TextField label="Tax" value={tax} onChange={(e) => setTax(e.target.value)} fullWidth size="small" type="number" />
            <TextField label="Fees" value={fees} onChange={(e) => setFees(e.target.value)} fullWidth size="small" type="number" />
          </Stack>
          <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth size="small" multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: existing && onDelete ? 'space-between' : 'flex-end', px: 2, pb: 2 }}>
        {existing && onDelete ?
          <Button color="error" onClick={() => { onDelete(); onClose(); }}>
            Delete order
          </Button>
        : <span />}
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={selectedPartIds.length === 0}>
            {context === 'partsList' ? 'Save order' : 'Save group'}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
