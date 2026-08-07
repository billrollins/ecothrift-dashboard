import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { localPrintService } from '../../services/localPrintService';
import type { Cart, CartLine } from '../../types/pos.types';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

function buildReceiptDataFromCart(cart: Cart): Record<string, unknown> {
  const completedAt = cart.completed_at ? new Date(cart.completed_at) : new Date(cart.created_at ?? 0);
  const lines = (cart.lines ?? []).map((line: CartLine) => ({
    name: line.description,
    quantity: line.quantity,
    unit_price: parseFloat(String(line.unit_price)),
    line_total: parseFloat(String(line.line_total)),
  }));
  return {
    receipt_number: cart.receipt?.receipt_number ?? '',
    date: format(completedAt, 'yyyy-MM-dd'),
    time: format(completedAt, 'h:mm a'),
    cashier: cart.cashier_name ?? '',
    items: lines,
    subtotal: parseFloat(String(cart.subtotal)),
    tax: parseFloat(String(cart.tax_amount)),
    total: parseFloat(String(cart.total)),
    payment_method: cart.payment_method,
    amount_tendered: cart.cash_tendered != null ? parseFloat(String(cart.cash_tendered)) : undefined,
    change: cart.change_given != null ? parseFloat(String(cart.change_given)) : undefined,
  };
}

type Props = {
  open: boolean;
  cart: Cart | null;
  onClose: () => void;
};

/** Full-screen mobile-friendly receipt / transaction detail. */
export function TransactionDetailDialog({ open, cart, onClose }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const receiptLabel = cart?.receipt?.receipt_number ?? (cart ? `#${cart.id}` : '-');

  return (
    <Dialog open={open} onClose={onClose} fullScreen scroll="paper">
      <DialogTitle
        sx={{
          py: 1.25,
          pr: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          fontWeight: 800,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flexWrap: 'wrap' }}>
          Transaction {receiptLabel}
          {cart?.status === 'voided' && <Chip size="small" label="Voided" color="error" />}
        </Box>
        <IconButton aria-label="Close" onClick={onClose} edge="end">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ px: 1.5, py: 1.5 }}>
        {cart && (
          <Box>
            <Typography variant="body2" color="text.secondary">
              {format(new Date(cart.completed_at ?? cart.created_at), 'PPp')} ·{' '}
              {cart.cashier_name ?? '-'}
            </Typography>
            <Box sx={{ mt: 2 }}>
              {(cart.lines ?? []).map((line: CartLine) => (
                <Box
                  key={line.id}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 1,
                    py: 0.5,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2">
                      {line.description} × {line.quantity}
                    </Typography>
                    {line.resale_source_sku ? (
                      <Typography variant="caption" color="text.secondary" display="block">
                        Resale copy from {line.resale_source_sku}
                      </Typography>
                    ) : null}
                  </Box>
                  <Typography variant="body2" sx={{ flexShrink: 0 }}>
                    {formatCurrency(line.line_total)}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>Subtotal</Typography>
                <Typography>{formatCurrency(cart.subtotal)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>Tax</Typography>
                <Typography>{formatCurrency(cart.tax_amount)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                <Typography fontWeight={700}>Total</Typography>
                <Typography fontWeight={700}>{formatCurrency(cart.total)}</Typography>
              </Box>
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Payment: {String(cart.payment_method).replace(/_/g, ' ')}
                  {cart.payment_method === 'split' &&
                    cart.cash_tendered != null &&
                    cart.card_amount != null && (
                      <>
                        {' '}
                        · Cash {formatCurrency(cart.cash_tendered)} + Card{' '}
                        {formatCurrency(cart.card_amount)}
                      </>
                    )}
                </Typography>
              </Box>
            </Box>
            <Button
              variant="outlined"
              fullWidth
              sx={{ mt: 2, minHeight: 48 }}
              onClick={async () => {
                try {
                  const receiptData = buildReceiptDataFromCart(cart);
                  await localPrintService.printReceipt(receiptData, false);
                  enqueueSnackbar('Receipt sent to printer', { variant: 'success' });
                } catch {
                  enqueueSnackbar('Print failed. Is the print server running?', {
                    variant: 'error',
                  });
                }
              }}
            >
              Reprint receipt
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions
        sx={{
          px: 1.5,
          py: 1.25,
          pb: 'calc(10px + env(safe-area-inset-bottom))',
        }}
      >
        <Button onClick={onClose} variant="contained" fullWidth sx={{ minHeight: 48 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
