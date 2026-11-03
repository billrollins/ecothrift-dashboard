/**
 * One sale's detail: lines, totals, how it was paid, Reprint receipt, the card-type fix and Void (a manager's PIN).
 * Moved out of the Transactions page (Retail 2, 2026-11-02) so the page's dialog and the Sale window show the same thing.
 */
import { useState } from 'react';
import { Box, Button, Chip, Typography } from '@mui/material';
import { ObjectLink } from '../objects/ObjectModal';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useVoidCart } from '../../hooks/usePOS';
import { useManagerOk } from './ManagerOkDialog';
import { paymentMethodLabel, thriftPaymentParts } from '../../utils/posPayment';
import { taxExemptText } from './TaxExemptDialog';
import { useAuth } from '../../contexts/AuthContext';
import { printErrorMessage } from '../../services/localPrintService';
import { reprintReceipt } from '../../services/receiptReprint';
import type { Cart, CartLine } from '../../types/pos.types';
import { CartCardBreakdown } from './CartCardBreakdown';
import { CardTypeFixControls } from './CardTypeFixControls';
import { useRetailCopy } from './windows/retailCopy';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

export function SaleDetail({
  cart,
  onUpdated,
  onVoided,
  items,
  returnedLines,
}: {
  cart: Cart;
  /** Each line's item, by line id: its SKU opens the Item window (the Transaction window passes these). */
  items?: Record<string, { id: number; sku: string }>;
  /** Lines that came back as Thrift+ returns. */
  returnedLines?: Set<number>;
  /** The card-type fix saved a new copy of the sale. */
  onUpdated: (cart: Cart) => void;
  onVoided?: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { hasRole } = useAuth();
  const { tr, paid } = useRetailCopy();
  const [confirmVoid, setConfirmVoid] = useState(false);
  const voidCartMutation = useVoidCart();
  const { run: runWithManagerOk, dialog: managerOkDialog } = useManagerOk();
  const canVoid = hasRole('Manager') || hasRole('Admin');

  const handleVoid = async () => {
    setConfirmVoid(false);
    try {
      // A manager's register PIN and a reason (2026-10-21), even when a manager is signed in.
      const voided = await runWithManagerOk((extra) => voidCartMutation.mutateAsync({ cartId: cart.id, ...extra }));
      if (!voided) return;
      enqueueSnackbar(tr('voidDone'), { variant: 'success' });
      onVoided?.();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(detail || 'Failed to void transaction', { variant: 'error' });
    }
  };

  return (
    <Box>
      {/* When and who are in the window's header; a cover is said here. */}
      {cart.covering_for_name ? (
        <Typography variant="body2" color="text.secondary">
          {cart.cashier_name ?? '-'} ({tr('coveringFor')} {cart.covering_for_name})
        </Typography>
      ) : null}
      {cart.status === 'voided' && cart.voided_by_name && (
        <Typography variant="body2" color="error">
          {tr('voidedBy')} {cart.voided_by_name}
          {cart.voided_at ? ` · ${format(new Date(cart.voided_at), 'PPp')}` : ''}
          {cart.void_reason ? ` · ${cart.void_reason}` : ''}
        </Typography>
      )}
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
                {items?.[String(line.id)] ? (
                  <Box component="span" sx={{ fontFamily: 'monospace', mr: 0.75 }}>
                    <ObjectLink type="item" id={items[String(line.id)].id} label={items[String(line.id)].sku} />
                  </Box>
                ) : null}
                {line.description} × {line.quantity}
                {line.tax_exempt && line.line_kind !== 'discount' ? ` · ${tr('noTax')}` : ''}
                {returnedLines?.has(line.id) ? (
                  <Chip size="small" label={tr('returnedChip')} color="warning" variant="outlined" sx={{ ml: 1, height: 20 }} />
                ) : null}
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
          <Typography>{tr('subtotal')}</Typography>
          <Typography>{formatCurrency(cart.subtotal)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography>{tr('tax')}</Typography>
          <Typography>{formatCurrency(cart.tax_amount)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          <Typography>{tr('total')}</Typography>
          <Typography>{formatCurrency(cart.total)}</Typography>
        </Box>
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {tr('payment')}: {cart.payment_method === 'payroll' ? paymentMethodLabel(cart.payment_method) : paid(cart.payment_method)}
            {cart.payment_method === 'payroll' && cart.payroll_employee_name
              ? ` deduction, from ${cart.payroll_employee_name}'s next paycheck`
              : ''}
            {cart.payment_method === 'split' && cart.cash_tendered != null && cart.card_amount != null && (
              <> · Cash {formatCurrency(cart.cash_tendered)} + Card {formatCurrency(cart.card_amount)}</>
            )}
            {thriftPaymentParts(cart).map((part) => ` · ${part}`).join('')}
          {cart.tax_exempt_at ? (
            <Typography component="span" display="block" variant="body2" color="info.main" fontWeight={700}>
              {taxExemptText(cart)} · by {cart.tax_exempt_by_name ?? '-'}
              {cart.tax_exempt_photo_url ? (
                <>
                  {' · '}
                  <a href={cart.tax_exempt_photo_url} target="_blank" rel="noreferrer">certificate photo</a>
                </>
              ) : null}
            </Typography>
          ) : null}
          </Typography>
          <CartCardBreakdown cart={cart} />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Button
          variant="outlined"
          size="small"
          onClick={async () => {
            try {
              const copy = await reprintReceipt(cart);
              enqueueSnackbar(`Copy ${copy} printed (marked COPY)`, { variant: 'success' });
            } catch (err) {
              enqueueSnackbar(printErrorMessage(err), { variant: 'error' });
            }
          }}
        >
          {tr('reprint')}
        </Button>
        <CardTypeFixControls cart={cart} onUpdated={onUpdated} />
        {canVoid && cart.status !== 'voided' && (
          <Button variant="outlined" color="error" size="small" onClick={() => setConfirmVoid(true)}>
            {tr('voidSale')}
          </Button>
        )}
      </Box>
      <ConfirmDialog
        open={confirmVoid}
        title={tr('voidTitle')}
        message={tr('voidMessage')}
        confirmLabel={tr('voidConfirm')}
        severity="error"
        onConfirm={handleVoid}
        onCancel={() => setConfirmVoid(false)}
        loading={voidCartMutation.isPending}
      />
      {managerOkDialog}
    </Box>
  );
}
