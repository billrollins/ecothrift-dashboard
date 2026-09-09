import { Box, Typography } from '@mui/material';
import { format } from 'date-fns';
import type { Cart } from '../../types/pos.types';

function formatCurrency(value: string | number | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

export function CartCardBreakdown({ cart }: { cart: Cart }) {
  if (cart.payment_method === 'cash' || !cart.card_type) return null;
  const label = cart.card_type === 'credit' ? 'Credit' : 'Debit';
  const surcharge = parseFloat(String(cart.card_surcharge_amount ?? 0)) || 0;
  const ratePct = (parseFloat(String(cart.card_surcharge_rate ?? 0)) || 0) * 100;
  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="body2" color="text.secondary">
        Card type: {label}
      </Typography>
      {cart.card_amount != null && (
        <Typography variant="body2" color="text.secondary">
          Card: {formatCurrency(cart.card_amount)}
        </Typography>
      )}
      {surcharge > 0 && (
        <Typography variant="body2" color="text.secondary">
          Surcharge ({ratePct.toFixed(ratePct % 1 ? 1 : 0)}%): {formatCurrency(surcharge)}
        </Typography>
      )}
      {cart.card_charged_total != null && (
        <Typography variant="body2" color="text.secondary">
          Card total: {formatCurrency(cart.card_charged_total)}
        </Typography>
      )}
      {cart.card_type_fixed_at && (
        <Typography variant="body2" color="text.secondary">
          Card type fixed
          {cart.card_type_fixed_by_name ? ` by ${cart.card_type_fixed_by_name}` : ''}
          {' · '}
          {format(new Date(cart.card_type_fixed_at), 'PPp')}
        </Typography>
      )}
    </Box>
  );
}
