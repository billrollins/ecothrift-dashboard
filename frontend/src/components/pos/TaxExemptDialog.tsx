/**
 * A tax-exempt sale to a non-profit (Bill, 2026-10-21): the organization's name and its tax-exempt certificate number
 * (preferred), or a photo of the certificate when there is no number. Every line of the sale is then untaxed, the
 * receipt says "Tax exempt: <org> #<number>", and Dash keeps who marked it.
 */
import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';

export type TaxExemptInput = { org: string; number: string; photo: File | null };

type Props = {
  open: boolean;
  pending: boolean;
  error: string;
  onSubmit: (input: TaxExemptInput) => void;
  onCancel: () => void;
};

export default function TaxExemptDialog({ open, pending, error, onSubmit, onCancel }: Props) {
  const [org, setOrg] = useState('');
  const [number, setNumber] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setOrg('');
    setNumber('');
    setPhoto(null);
  }, [open]);

  const ready = org.trim() !== '' && (number.trim() !== '' || photo !== null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) onSubmit({ org: org.trim(), number: number.trim(), photo });
  };

  return (
    <Dialog open={open} onClose={pending ? undefined : onCancel} maxWidth="xs" fullWidth>
      <form onSubmit={submit}>
        <DialogTitle>Tax exempt sale</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              For a non-profit with a tax-exempt certificate. No line of this sale is taxed.
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Organization's name"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              autoFocus
              required
              inputProps={{ maxLength: 200 }}
            />
            <TextField
              label="Tax-exempt certificate number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              helperText="Preferred. No number? Take a photo of the certificate instead."
              inputProps={{ maxLength: 100 }}
            />
            <Button variant="outlined" component="label" sx={{ alignSelf: 'flex-start', textTransform: 'none' }}>
              {photo ? `Photo: ${photo.name}` : 'Take or pick a photo of the certificate'}
              <input
                hidden
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                data-testid="tax-exempt-photo"
              />
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!ready || pending}>
            {pending ? 'Saving…' : 'Make it tax exempt'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** "Tax exempt: Open Door Mission #05-123456" for the receipt and the screens; '' when the sale is taxed. */
export function taxExemptText(cart: { tax_exempt_at?: string | null; tax_exempt_org?: string; tax_exempt_number?: string } | null | undefined): string {
  if (!cart?.tax_exempt_at) return '';
  const number = cart.tax_exempt_number ? ` #${cart.tax_exempt_number}` : ' (certificate photo on file)';
  return `Tax exempt: ${cart.tax_exempt_org ?? ''}${number}`;
}
