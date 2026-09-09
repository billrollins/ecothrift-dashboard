import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import type { CardPreview } from '../../types/pos.types';

function money(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

type Props = {
  open: boolean;
  preview: CardPreview | null;
  pending?: boolean;
  onConfirm: (choice: { card_type: 'credit' | 'debit'; card_charged_total: string }) => void;
  onCancel: () => void;
};

export function CardTenderDialog({ open, preview, pending, onConfirm, onCancel }: Props) {
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  const percent = preview ? String(preview.percent).replace(/\.0+$/, '') : '3';

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>
        {step === 1 ? 'Key this into the card machine' : 'Which total did the card machine approve?'}
      </DialogTitle>
      <DialogContent>
        {preview && step === 1 && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="overline" color="text.secondary" letterSpacing={1}>
              KEY INTO CARD MACHINE
            </Typography>
            <Typography variant="h3" fontWeight={800} sx={{ my: 1 }}>
              {money(preview.card_base)}
            </Typography>
            <Typography variant="body1" sx={{ mt: 2 }}>
              If CardX asks &quot;Apply surcharge?&quot;, press YES.
            </Typography>
          </Box>
        )}
        {preview && step === 2 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
            <Button
              variant="outlined"
              size="large"
              disabled={pending}
              onClick={() =>
                onConfirm({
                  card_type: 'debit',
                  card_charged_total: preview.no_surcharge,
                })
              }
              sx={{
                py: 2,
                textTransform: 'none',
                justifyContent: 'flex-start',
                textAlign: 'left',
              }}
            >
              <Box>
                <Typography variant="h6" fontWeight={800}>
                  {money(preview.no_surcharge)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Debit / prepaid (CardX did not ask)
                </Typography>
              </Box>
            </Button>
            <Button
              variant="contained"
              size="large"
              disabled={pending}
              onClick={() =>
                onConfirm({
                  card_type: 'credit',
                  card_charged_total: preview.with_surcharge,
                })
              }
              sx={{
                py: 2,
                textTransform: 'none',
                justifyContent: 'flex-start',
                textAlign: 'left',
              }}
            >
              <Box>
                <Typography variant="h6" fontWeight={800}>
                  {money(preview.with_surcharge)}
                </Typography>
                <Typography variant="body2">
                  Credit ({percent}% surcharge applied)
                </Typography>
              </Box>
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        {step === 2 ? (
          <Button onClick={onCancel} disabled={pending} sx={{ textTransform: 'none' }}>
            Neither — cancel and void on machine
          </Button>
        ) : (
          <Button onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
        {step === 1 && (
          <Button variant="contained" onClick={() => setStep(2)} disabled={!preview}>
            I keyed it in
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
