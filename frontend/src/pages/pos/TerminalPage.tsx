import { useState, useCallback, useRef } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
  Grid,
  IconButton,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import Delete from '@mui/icons-material/Delete';
import PersonOutline from '@mui/icons-material/PersonOutline';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  useDrawers,
  useCreateCart,
  useAddItemToCart,
  useRemoveCartLine,
  useCompleteCart,
} from '../../hooks/usePOS';
import { useLookupCustomer } from '../../hooks/useEmployees';
import { updateCart } from '../../api/pos.api';
import type { Cart, CartLine, PaymentMethod } from '../../types/pos.types';
import type { Customer } from '../../api/accounts.api';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

export default function TerminalPage() {
  const { enqueueSnackbar } = useSnackbar();
  const skuInputRef = useRef<HTMLInputElement>(null);
  const [drawerId, setDrawerId] = useState<number | ''>('');
  const [cart, setCart] = useState<Cart | null>(null);
  const [skuInput, setSkuInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);

  const { data: drawersData, isLoading: drawersLoading } = useDrawers({
    status: 'open',
  });
  const createCartMutation = useCreateCart();
  const addItemMutation = useAddItemToCart();
  const removeLineMutation = useRemoveCartLine();
  const completeCartMutation = useCompleteCart();
  const lookupCustomerMutation = useLookupCustomer();

  const openDrawers = drawersData?.results ?? [];

  const handleCreateCart = useCallback(async () => {
    if (drawerId === '' || typeof drawerId !== 'number') {
      enqueueSnackbar('Select an open drawer first', { variant: 'warning' });
      return;
    }
    try {
      const result = await createCartMutation.mutateAsync({ drawer: drawerId });
      setCart(result as unknown as Cart);
      enqueueSnackbar('Cart created', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to create cart', { variant: 'error' });
    }
  }, [drawerId, createCartMutation, enqueueSnackbar]);

  const handleScanInput = useCallback(async () => {
    const input = skuInput.trim();
    if (!input) return;
    if (!cart) {
      enqueueSnackbar('Create a cart first (select drawer and start)', { variant: 'warning' });
      return;
    }

    // Detect customer ID pattern (CUS-XXX)
    if (/^CUS-\d+$/i.test(input)) {
      try {
        const cust = await lookupCustomerMutation.mutateAsync(input.toUpperCase());
        setCustomer(cust);
        // Associate customer with the cart
        const updated = await updateCart(cart.id, { customer: cust.id });
        setCart(updated.data as unknown as Cart);
        enqueueSnackbar(`Customer: ${cust.full_name}`, { variant: 'info' });
        setSkuInput('');
        skuInputRef.current?.focus();
      } catch {
        enqueueSnackbar('Customer not found', { variant: 'error' });
        setSkuInput('');
        skuInputRef.current?.focus();
      }
      return;
    }

    // Otherwise treat as item SKU
    try {
      const updated = await addItemMutation.mutateAsync({ cartId: cart.id, sku: input });
      setCart(updated as unknown as Cart);
      setSkuInput('');
      skuInputRef.current?.focus();
    } catch {
      enqueueSnackbar('Failed to add item', { variant: 'error' });
    }
  }, [cart, skuInput, addItemMutation, lookupCustomerMutation, enqueueSnackbar]);

  const handleRemoveLine = useCallback(
    async (lineId: number) => {
      if (!cart) return;
      try {
        const updated = await removeLineMutation.mutateAsync({ cartId: cart.id, lineId });
        setCart((updated as unknown as Cart) ?? { ...cart, lines: cart.lines.filter((l) => l.id !== lineId) });
        enqueueSnackbar('Line removed', { variant: 'success' });
      } catch {
        enqueueSnackbar('Failed to remove line', { variant: 'error' });
      }
    },
    [cart, removeLineMutation, enqueueSnackbar]
  );

  const handleComplete = useCallback(async () => {
    if (!cart) return;
    const total = parseFloat(cart.total) || 0;
    const cash = parseFloat(cashTendered) || 0;
    const card = parseFloat(cardAmount) || 0;

    if (paymentMethod === 'cash' && cash < total) {
      enqueueSnackbar('Cash tendered is less than total', { variant: 'error' });
      return;
    }
    if (paymentMethod === 'card' && card < total) {
      enqueueSnackbar('Card amount is less than total', { variant: 'error' });
      return;
    }
    if (paymentMethod === 'split' && cash + card < total) {
      enqueueSnackbar('Combined payment is less than total', { variant: 'error' });
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        payment_method: paymentMethod,
      };
      if (paymentMethod === 'cash' || paymentMethod === 'split')
        payload.cash_tendered = cashTendered ? parseFloat(cashTendered) : 0;
      if (paymentMethod === 'card' || paymentMethod === 'split')
        payload.card_amount = cardAmount ? parseFloat(cardAmount) : total;

      await completeCartMutation.mutateAsync({ cartId: cart.id, data: payload });
      enqueueSnackbar('Sale completed', { variant: 'success' });
      setCart(null);
      setCustomer(null);
      setCashTendered('');
      setCardAmount('');
    } catch {
      enqueueSnackbar('Failed to complete sale', { variant: 'error' });
    }
  }, [
    cart,
    paymentMethod,
    cashTendered,
    cardAmount,
    completeCartMutation,
    enqueueSnackbar,
  ]);

  const changeDue = (() => {
    if (paymentMethod !== 'cash' && paymentMethod !== 'split') return 0;
    const total = parseFloat(cart?.total ?? '0') || 0;
    const cash = parseFloat(cashTendered) || 0;
    return Math.max(0, cash - total);
  })();

  if (drawersLoading) return <LoadingScreen message="Loading drawers..." />;

  return (
    <Box>
      <PageHeader title="POS Terminal" subtitle="Process sales" />

      <Box sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Open Drawer</InputLabel>
          <Select
            value={drawerId === '' ? '' : String(drawerId)}
            label="Open Drawer"
            onChange={(e) => setDrawerId(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={!!cart}
          >
            {openDrawers.map((d: { id: number; register_name: string; register_code: string }) => (
              <MenuItem key={d.id} value={String(d.id)}>
                {d.register_name} ({d.register_code})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {!cart && drawerId !== '' && (
          <Button
            variant="contained"
            sx={{ ml: 2 }}
            onClick={handleCreateCart}
            disabled={createCartMutation.isPending}
          >
            Start Sale
          </Button>
        )}
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">Cart</Typography>
              {customer && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <PersonOutline fontSize="small" color="primary" />
                  <Typography variant="body2" color="primary.main" fontWeight={600}>
                    {customer.full_name} ({customer.customer_number})
                  </Typography>
                </Box>
              )}
            </Box>
            {cart ? (
              <>
                <List dense>
                  {(cart.lines ?? []).map((line: CartLine) => (
                    <ListItem
                      key={line.id}
                      secondaryAction={
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleRemoveLine(line.id)}
                          disabled={removeLineMutation.isPending}
                        >
                          <Delete />
                        </IconButton>
                      }
                    >
                      <ListItemText
                        primary={line.description}
                        secondary={`${line.quantity} × ${formatCurrency(line.unit_price)}`}
                        primaryTypographyProps={{ fontWeight: 500 }}
                      />
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        {formatCurrency(line.line_total)}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
                <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2, mt: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography color="text.secondary">Subtotal</Typography>
                    <Typography>{formatCurrency(cart.subtotal)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography color="text.secondary">Tax</Typography>
                    <Typography>{formatCurrency(cart.tax_amount)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <Typography>Total</Typography>
                    <Typography>{formatCurrency(cart.total)}</Typography>
                  </Box>
                </Box>
              </>
            ) : (
              <Typography color="text.secondary">
                Select a drawer and click Start Sale to begin.
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Add Item
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                inputRef={skuInputRef}
                fullWidth
                size="small"
                placeholder="Scan or type SKU"
                value={skuInput}
                onChange={(e) => setSkuInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScanInput()}
              />
              <Button
                variant="contained"
                startIcon={<Search />}
                onClick={handleScanInput}
                disabled={!cart || !skuInput.trim() || addItemMutation.isPending}
              >
                Add
              </Button>
            </Box>
          </Paper>

          {cart && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Payment
              </Typography>
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Method</InputLabel>
                <Select
                  value={paymentMethod}
                  label="Method"
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="card">Card</MenuItem>
                  <MenuItem value="split">Split</MenuItem>
                </Select>
              </FormControl>
              {(paymentMethod === 'cash' || paymentMethod === 'split') && (
                <TextField
                  fullWidth
                  size="small"
                  label="Cash Tendered"
                  type="number"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
                  sx={{ mb: 2 }}
                />
              )}
              {(paymentMethod === 'cash' || paymentMethod === 'split') && changeDue > 0 && (
                <Typography color="success.main" sx={{ mb: 2 }}>
                  Change: {formatCurrency(changeDue)}
                </Typography>
              )}
              {(paymentMethod === 'card' || paymentMethod === 'split') && (
                <TextField
                  fullWidth
                  size="small"
                  label="Card Amount"
                  type="number"
                  value={cardAmount}
                  onChange={(e) => setCardAmount(e.target.value)}
                  slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
                  sx={{ mb: 2 }}
                />
              )}
              <Button
                variant="contained"
                color="success"
                fullWidth
                onClick={handleComplete}
                disabled={completeCartMutation.isPending}
              >
                Complete Sale
              </Button>
            </Paper>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
