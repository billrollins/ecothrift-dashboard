import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AccessTime from '@mui/icons-material/AccessTime';
import AccountBalance from '@mui/icons-material/AccountBalance';
import CancelOutlined from '@mui/icons-material/CancelOutlined';
import Check from '@mui/icons-material/Check';
import Delete from '@mui/icons-material/Delete';
import DeleteForever from '@mui/icons-material/DeleteForever';
import Edit from '@mui/icons-material/Edit';
import PersonOff from '@mui/icons-material/PersonOff';
import PersonOutline from '@mui/icons-material/PersonOutline';
import PlayArrow from '@mui/icons-material/PlayArrow';
import PointOfSale from '@mui/icons-material/PointOfSale';
import Search from '@mui/icons-material/Search';
import Settings from '@mui/icons-material/Settings';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import DenominationCounter, {
  EMPTY_BREAKDOWN,
  calculateTotal,
} from '../../components/forms/DenominationCounter';
import { DeviceSetupDialog } from '../../components/pos/DeviceSetupDialog';
import {
  useRegisters,
  useDrawers,
  useCreateCart,
  useAddItemToCart,
  useAddResaleCopyToCart,
  useUpdateCartLine,
  useRemoveCartLine,
  useCompleteCart,
  useVoidCart,
  useOpenDrawer,
  useDrawerTakeover,
} from '../../hooks/usePOS';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useDeviceConfig } from '../../hooks/useDeviceConfig';
import { useLocalPrintStatus } from '../../hooks/useLocalPrintStatus';
import { useLookupCustomer } from '../../hooks/useEmployees';
import { useAuth } from '../../contexts/AuthContext';
import { updateCart, getCarts } from '../../api/pos.api';
import { localPrintService } from '../../services/localPrintService';
import type { Cart, CartLine, Drawer, PaymentMethod, POSDeviceConfig } from '../../types/pos.types';
import type { DenominationBreakdown } from '../../types/pos.types';
import type { Customer } from '../../api/accounts.api';
import {
  parsePosAddItemError,
  snackbarVariantForPosAddItemError,
} from '../../utils/posAddItemError';

// ── Terminal state machine ─────────────────────────────────────────────────

type TerminalState =
  | 'unconfigured'    // no localStorage device config
  | 'loading'         // register mode, waiting for drawer data
  | 'no_drawer'       // register, no drawer opened today
  | 'drawer_open_other' // register, drawer open but owned by someone else
  | 'ready'           // register, my drawer open, no active cart
  | 'active_sale'     // cart in progress (any device type)
  | 'drawer_closed'   // register, today's drawer is closed
  | 'manager_mode';   // non-register device (manager, mobile, etc.)

function deriveTerminalState({
  config,
  isRegister,
  loading,
  todayDrawer,
  cart,
  userId,
}: {
  config: POSDeviceConfig | null;
  isRegister: boolean;
  loading: boolean;
  todayDrawer: Drawer | null;
  cart: Cart | null;
  userId: number | undefined;
}): TerminalState {
  if (!config) return 'unconfigured';
  if (!isRegister) return cart ? 'active_sale' : 'manager_mode';
  if (loading) return 'loading';
  if (cart) return 'active_sale';
  if (!todayDrawer) return 'no_drawer';
  if (todayDrawer.status === 'closed') return 'drawer_closed';
  // Drawer is open
  if (userId != null && Number(todayDrawer.current_cashier) === userId) return 'ready';
  return 'drawer_open_other';
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: string | number | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function buildReceiptData(
  cart: Cart & { receipt?: { receipt_number: string }; completed_at?: string },
): Record<string, unknown> {
  const completedAt = cart.completed_at ? new Date(cart.completed_at) : new Date();
  return {
    receipt_number: cart.receipt?.receipt_number ?? '',
    date: format(completedAt, 'yyyy-MM-dd'),
    time: format(completedAt, 'h:mm a'),
    cashier: (cart as { cashier_name?: string }).cashier_name ?? '',
    items: (cart.lines ?? []).map((line: CartLine) => ({
      name: line.description,
      quantity: line.quantity,
      unit_price: parseFloat(String(line.unit_price)),
      line_total: parseFloat(String(line.line_total)),
    })),
    subtotal: parseFloat(String(cart.subtotal)),
    tax: parseFloat(String(cart.tax_amount)),
    total: parseFloat(String(cart.total)),
    payment_method: cart.payment_method,
    amount_tendered:
      cart.cash_tendered != null ? parseFloat(String(cart.cash_tendered)) : undefined,
    change: cart.change_given != null ? parseFloat(String(cart.change_given)) : undefined,
  };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TerminalPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const skuInputRef = useRef<HTMLInputElement>(null);
  const { config, isRegister, registerId } = useDeviceConfig();
  const printStatus = useLocalPrintStatus();

  const { data: registersData, isLoading: registersLoading } = useRegisters({ page_size: 200 });
  const registers = registersData?.results ?? [];
  const registerConfigInvalid =
    isRegister &&
    registerId != null &&
    !registersLoading &&
    !registers.some((r) => r.id === registerId);

  const [deviceSetupOpen, setDeviceSetupOpen] = useState(false);
  const [managerDrawerId, setManagerDrawerId] = useState<number | ''>('');
  const [cart, setCart] = useState<Cart | null>(null);
  const [skuInput, setSkuInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [openDrawerDialog, setOpenDrawerDialog] = useState(false);
  const [openingCount, setOpeningCount] = useState<DenominationBreakdown>(EMPTY_BREAKDOWN);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState({ quantity: '', description: '', unit_price: '' });
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [soldScanDialog, setSoldScanDialog] = useState<{
    itemId: number;
    sku?: string;
    title?: string;
  } | null>(null);

  // Stable date string — only recomputes at midnight
  const todayLocalISO = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  // Stable params objects to avoid React Query key churn
  const drawerQueryParams = useMemo(
    () =>
      isRegister && registerId != null && !registerConfigInvalid
        ? { register: registerId, date: todayLocalISO }
        : undefined,
    [isRegister, registerId, todayLocalISO, registerConfigInvalid],
  );

  // Register mode: today's drawer for this register (any status)
  const { data: todayDrawerData, isLoading: drawerLoading } = useDrawers(drawerQueryParams, {
    enabled: isRegister && registerId != null && !registerConfigInvalid,
  });
  const todayDrawer: Drawer | null = (todayDrawerData?.results ?? [])[0] ?? null;

  // Always keep a ref to the latest todayDrawer so callbacks are never stale
  const todayDrawerRef = useRef(todayDrawer);
  todayDrawerRef.current = todayDrawer;

  // Manager/non-register mode: all open drawers
  const { data: openDrawersData, isLoading: openDrawersLoading } = useDrawers(
    { status: 'open' },
    { enabled: !!config && !isRegister },
  );
  const openDrawersList: Drawer[] = (openDrawersData?.results ?? []) as Drawer[];

  // Restore an existing open cart once on mount via direct API call (bypasses React Query cache)
  const activeDrawerId = isRegister ? todayDrawer?.id : undefined;
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (activeDrawerId == null || hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    getCarts({ drawer: activeDrawerId, status: 'open' }).then(({ data }) => {
      const openCarts = ((data as unknown as { results?: Cart[] })?.results ?? []) as Cart[];
      if (openCarts.length > 0) {
        setCart((prev) => prev ?? (openCarts[0] as Cart));
      }
    }).catch(() => {});
  }, [activeDrawerId]);

  const terminalState = deriveTerminalState({
    config,
    isRegister,
    loading: drawerLoading,
    todayDrawer,
    cart,
    userId: user?.id,
  });

  const createCartMutation = useCreateCart();
  const addItemMutation = useAddItemToCart();
  const addResaleCopyMutation = useAddResaleCopyToCart();
  const updateLineMutation = useUpdateCartLine();
  const removeLineMutation = useRemoveCartLine();
  const completeCartMutation = useCompleteCart();
  const voidCartMutation = useVoidCart();
  const openDrawerMutation = useOpenDrawer();
  const takeoverMutation = useDrawerTakeover();
  const lookupCustomerMutation = useLookupCustomer();

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreateCart = useCallback(async () => {
    // Read from ref so we always get the latest drawer even if closure is stale
    const liveDrawer = todayDrawerRef.current;
    const targetDrawerId: number | undefined = isRegister
      ? (typeof liveDrawer?.id === 'number' ? liveDrawer.id : undefined)
      : typeof managerDrawerId === 'number'
        ? managerDrawerId
        : undefined;

    if (typeof targetDrawerId !== 'number') {
      enqueueSnackbar('Open a drawer first before starting a sale.', { variant: 'warning' });
      return;
    }
    try {
      const result = await createCartMutation.mutateAsync({ drawer: targetDrawerId });
      setCart(result as unknown as Cart);
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const msg =
        (errData as { detail?: string } | undefined)?.detail ??
        ((errData as { drawer?: unknown } | undefined)?.drawer as string[] | undefined)?.[0] ??
        (typeof errData === 'object' && errData !== null
          ? JSON.stringify(errData)
          : 'Failed to create cart');
      enqueueSnackbar(msg, { variant: 'error' });
    }
  }, [isRegister, managerDrawerId, createCartMutation, enqueueSnackbar]);

  const handleOpenDrawer = useCallback(async () => {
    if (registerId == null || typeof registerId !== 'number') return;
    const total = calculateTotal(openingCount);
    try {
      await openDrawerMutation.mutateAsync({
        register: registerId,
        opening_count: openingCount,
        opening_total: total,
      });
      enqueueSnackbar('Drawer opened', { variant: 'success' });
      setOpenDrawerDialog(false);
      setOpeningCount(EMPTY_BREAKDOWN);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to open drawer';
      enqueueSnackbar(msg, { variant: 'error' });
    }
  }, [registerId, openingCount, openDrawerMutation, enqueueSnackbar]);

  const handleTakeover = useCallback(async (drawerId: number) => {
    try {
      await takeoverMutation.mutateAsync({ id: drawerId });
      enqueueSnackbar('Drawer taken over successfully', { variant: 'success' });
    } catch {
      enqueueSnackbar('Takeover failed', { variant: 'error' });
    }
  }, [takeoverMutation, enqueueSnackbar]);

  const handleScanInput = useCallback(async () => {
    const input = skuInput.trim();
    if (!input) return;

    let activeCart = cart;
    if (!activeCart) {
      const liveDrawer = todayDrawerRef.current;
      const targetDrawerId: number | undefined = isRegister
        ? (typeof liveDrawer?.id === 'number' ? liveDrawer.id : undefined)
        : typeof managerDrawerId === 'number'
          ? managerDrawerId
          : undefined;

      if (typeof targetDrawerId !== 'number') {
        enqueueSnackbar('Open a drawer first before scanning items.', { variant: 'warning' });
        return;
      }
      try {
        const newCart = await createCartMutation.mutateAsync({ drawer: targetDrawerId });
        activeCart = newCart as unknown as Cart;
        setCart(activeCart);
      } catch {
        enqueueSnackbar('Failed to create cart', { variant: 'error' });
        return;
      }
    }

    if (/^CUS-\d+$/i.test(input)) {
      try {
        const cust = await lookupCustomerMutation.mutateAsync(input.toUpperCase());
        setCustomer(cust);
        const updated = await updateCart(activeCart.id, { customer: cust.id });
        setCart(updated.data as unknown as Cart);
        enqueueSnackbar(`Customer: ${cust.full_name}`, { variant: 'info' });
      } catch {
        enqueueSnackbar('Customer not found', { variant: 'error' });
      }
      setSkuInput('');
      skuInputRef.current?.focus();
      return;
    }

    try {
      const updated = await addItemMutation.mutateAsync({ cartId: activeCart.id, sku: input });
      setCart(updated as unknown as Cart);
    } catch (err: unknown) {
      const parsed = parsePosAddItemError(err);
      if (parsed.kind === 'already_sold' && parsed.itemId != null) {
        setSoldScanDialog({
          itemId: parsed.itemId,
          sku: parsed.sku,
          title: parsed.title,
        });
        setSkuInput('');
        return;
      }
      enqueueSnackbar(parsed.message, {
        variant: snackbarVariantForPosAddItemError(parsed.kind),
      });
    }
    setSkuInput('');
    skuInputRef.current?.focus();
  }, [
    cart,
    isRegister,
    managerDrawerId,
    skuInput,
    createCartMutation,
    addItemMutation,
    lookupCustomerMutation,
    enqueueSnackbar,
  ]);

  const handleRemoveLine = useCallback(async (lineId: number) => {
    if (!cart) return;
    const prevCart = cart;
    setCart({ ...cart, lines: cart.lines.filter((l) => l.id !== lineId) } as Cart);
    try {
      const updated = await removeLineMutation.mutateAsync({ cartId: prevCart.id, lineId });
      setCart(updated as unknown as Cart);
    } catch {
      setCart(prevCart);
      enqueueSnackbar('Failed to remove line', { variant: 'error' });
    }
  }, [cart, removeLineMutation, enqueueSnackbar]);

  const handleStartEditLine = useCallback((line: CartLine) => {
    setEditingLineId(line.id);
    setEditValues({
      quantity: String(line.quantity),
      description: line.description,
      unit_price: String(line.unit_price),
    });
  }, []);

  const handleSaveLineEdit = useCallback(async () => {
    if (!cart || editingLineId === null) return;
    const newQty = parseInt(editValues.quantity) || 1;
    const newPrice = parseFloat(editValues.unit_price) || 0;
    try {
      const updated = await updateLineMutation.mutateAsync({
        cartId: cart.id,
        lineId: editingLineId,
        data: { quantity: newQty, description: editValues.description, unit_price: newPrice },
      });
      setCart(updated as unknown as Cart);
      setEditingLineId(null);
    } catch {
      enqueueSnackbar('Failed to update line', { variant: 'error' });
    }
  }, [cart, editingLineId, editValues, updateLineMutation, enqueueSnackbar]);

  const handleVoidSale = useCallback(async () => {
    if (!cart) return;
    try {
      await voidCartMutation.mutateAsync(cart.id);
      enqueueSnackbar('Sale voided', { variant: 'info' });
      setCart(null);
      setCustomer(null);
      setCashTendered('');
      setCardAmount('');
      setVoidConfirmOpen(false);
      setEditingLineId(null);
    } catch {
      enqueueSnackbar('Failed to void sale', { variant: 'error' });
    }
  }, [cart, voidCartMutation, enqueueSnackbar]);

  const handleComplete = useCallback(async () => {
    if (!cart || (cart.lines ?? []).length === 0) {
      enqueueSnackbar('Add at least one item before completing the sale.', { variant: 'warning' });
      return;
    }
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
      const payload: Record<string, unknown> = { payment_method: paymentMethod };
      if (paymentMethod === 'cash' || paymentMethod === 'split')
        payload.cash_tendered = cashTendered ? parseFloat(cashTendered) : 0;
      if (paymentMethod === 'card' || paymentMethod === 'split')
        payload.card_amount = cardAmount ? parseFloat(cardAmount) : total;

      const completedCart = (await completeCartMutation.mutateAsync({
        cartId: cart.id,
        data: payload,
      })) as unknown as Cart & { receipt?: { receipt_number: string }; completed_at?: string };

      enqueueSnackbar('Sale completed', { variant: 'success' });

      try {
        const shouldOpenDrawer = paymentMethod === 'cash' || paymentMethod === 'split';
        await localPrintService.printReceipt(buildReceiptData(completedCart), shouldOpenDrawer);
      } catch {
        enqueueSnackbar('Receipt print failed. Print server may be offline.', {
          variant: 'warning',
        });
      }

      setCart(null);
      setCustomer(null);
      setCashTendered('');
      setCardAmount('');
    } catch {
      enqueueSnackbar('Failed to complete sale', { variant: 'error' });
    }
  }, [cart, paymentMethod, cashTendered, cardAmount, completeCartMutation, enqueueSnackbar]);

  const changeDue = (() => {
    if (paymentMethod !== 'cash' && paymentMethod !== 'split') return 0;
    const total = parseFloat(cart?.total ?? '0') || 0;
    return Math.max(0, (parseFloat(cashTendered) || 0) - total);
  })();

  // ── State panels ───────────────────────────────────────────────────────────

  const renderContent = () => {
    switch (terminalState) {
      case 'unconfigured':
        return (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
            <Card sx={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
              <CardContent sx={{ p: 5 }}>
                <PointOfSale sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h5" gutterBottom>
                  This device isn't set up yet
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Identify whether this is a register, a manager station, or another role so the
                  POS can show the right controls for this computer.
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => setDeviceSetupOpen(true)}
                  sx={{ px: 4 }}
                >
                  Set up device
                </Button>
              </CardContent>
            </Card>
          </Box>
        );

      case 'no_drawer':
        return (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <Card sx={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
              <CardContent sx={{ p: 5 }}>
                <AccountBalance sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h5" gutterBottom>
                  No drawer open today
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {format(new Date(), 'EEEE, MMMM d, yyyy')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Count the opening cash and open a drawer to start taking sales on this
                  register.
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => setOpenDrawerDialog(true)}
                  disabled={openDrawerMutation.isPending}
                  sx={{ px: 4 }}
                >
                  Open drawer
                </Button>
              </CardContent>
            </Card>
          </Box>
        );

      case 'drawer_open_other':
        return (
          <Box sx={{ mt: 3, maxWidth: 560 }}>
            <Alert
              severity="warning"
              icon={<PersonOff />}
              sx={{ mb: 3 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  variant="outlined"
                  onClick={() => todayDrawer && handleTakeover(todayDrawer.id)}
                  disabled={takeoverMutation.isPending}
                >
                  {takeoverMutation.isPending ? 'Taking over…' : 'Take over'}
                </Button>
              }
            >
              <strong>Drawer in use</strong> — currently assigned to{' '}
              <strong>
                {todayDrawer?.current_cashier_name ?? 'another cashier'}
              </strong>
              . Take over to use this register.
            </Alert>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Drawer details
                </Typography>
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    Opened:{' '}
                    {todayDrawer?.opened_at
                      ? format(new Date(todayDrawer.opened_at), 'h:mm a')
                      : '—'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Opening total: {formatCurrency(todayDrawer?.opening_total)}
                  </Typography>
                  {parseFloat(String(todayDrawer?.cash_sales_total ?? '0')) > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Cash sales so far: {formatCurrency(todayDrawer?.cash_sales_total)}
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Box>
        );

      case 'drawer_closed':
        return (
          <Box sx={{ mt: 3 }}>
            <Card sx={{ maxWidth: 480, borderLeft: 4, borderColor: 'text.disabled' }}>
              <CardContent>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 2,
                  }}
                >
                  <Typography variant="subtitle1" fontWeight={600} color="text.secondary">
                    Drawer closed for today
                  </Typography>
                  <Chip size="small" label="Closed" variant="outlined" />
                </Box>
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    Opened:{' '}
                    {todayDrawer?.opened_at
                      ? format(new Date(todayDrawer.opened_at), 'h:mm a')
                      : '—'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Closed:{' '}
                    {todayDrawer?.closed_at
                      ? format(new Date(todayDrawer.closed_at), 'h:mm a')
                      : '—'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Opening total: {formatCurrency(todayDrawer?.opening_total)}
                  </Typography>
                  {todayDrawer?.closing_total != null && (
                    <Typography variant="body2" color="text.secondary">
                      Closing total: {formatCurrency(todayDrawer.closing_total)}
                    </Typography>
                  )}
                  {todayDrawer?.variance != null && (
                    <Typography
                      variant="body2"
                      color={
                        Math.abs(parseFloat(String(todayDrawer.variance))) <= 1
                          ? 'success.main'
                          : Math.abs(parseFloat(String(todayDrawer.variance))) <= 5
                            ? 'warning.main'
                            : 'error.main'
                      }
                    >
                      Variance:{' '}
                      {parseFloat(String(todayDrawer.variance)) >= 0 ? '+' : ''}
                      {formatCurrency(todayDrawer.variance)}
                    </Typography>
                  )}
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  Sales are closed for this register. A manager can reopen this drawer from the
                  Drawers page if needed.
                </Typography>
              </CardContent>
            </Card>
          </Box>
        );

      case 'manager_mode':
        return (
          <Box sx={{ mt: 3 }}>
            <Paper sx={{ p: 3, maxWidth: 500 }}>
              <Typography variant="h6" gutterBottom>
                Start a sale
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Select an open drawer to ring items against.
              </Typography>
              {openDrawersLoading ? (
                <Typography variant="body2" color="text.secondary">
                  Loading open drawers…
                </Typography>
              ) : openDrawersList.length === 0 ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  No open drawers. A cashier must open a drawer before sales can begin.
                </Alert>
              ) : (
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>Open drawer</InputLabel>
                  <Select
                    value={managerDrawerId === '' ? '' : String(managerDrawerId)}
                    label="Open drawer"
                    onChange={(e) =>
                      setManagerDrawerId(
                        e.target.value === '' ? '' : Number(e.target.value),
                      )
                    }
                  >
                    <MenuItem value="">Select drawer…</MenuItem>
                    {openDrawersList.map((d: Drawer) => (
                      <MenuItem key={d.id} value={String(d.id)}>
                        {d.register_name} ({d.register_code})
                        {d.current_cashier_name ? ` — ${d.current_cashier_name}` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <Button
                variant="contained"
                size="large"
                startIcon={<PlayArrow />}
                onClick={handleCreateCart}
                disabled={managerDrawerId === '' || createCartMutation.isPending}
                sx={{ px: 3 }}
              >
                {createCartMutation.isPending ? 'Starting…' : 'Start sale'}
              </Button>
            </Paper>
          </Box>
        );

      case 'ready':
      // eslint-disable-next-line no-fallthrough
      case 'active_sale': {
        const cartLines = (cart?.lines ?? []) as CartLine[];
        const hasItems = cartLines.length > 0;

        return (
          <Grid container spacing={3}>
            {/* Cart panel */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Paper sx={{ p: 2, minHeight: 320 }}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 1,
                  }}
                >
                  <Typography variant="h6">Cart</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {customer && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <PersonOutline fontSize="small" color="primary" />
                        <Typography variant="body2" color="primary.main" fontWeight={600}>
                          {customer.full_name} ({customer.customer_number})
                        </Typography>
                      </Box>
                    )}
                    {cart && (
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        startIcon={<DeleteForever />}
                        onClick={() => setVoidConfirmOpen(true)}
                        disabled={voidCartMutation.isPending}
                      >
                        Void
                      </Button>
                    )}
                  </Box>
                </Box>

                {!hasItems && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ py: 4, textAlign: 'center' }}
                  >
                    Scan an item to begin a new sale.
                  </Typography>
                )}

                {hasItems && (
                  <>
                    <List dense>
                      {cartLines.map((line: CartLine) =>
                        editingLineId === line.id ? (
                          <ListItem key={line.id} sx={{ flexWrap: 'wrap', gap: 1, py: 1 }}>
                            <Box sx={{ display: 'flex', gap: 1, width: '100%', alignItems: 'center' }}>
                              <TextField
                                size="small"
                                label="Qty"
                                type="number"
                                value={editValues.quantity}
                                onChange={(e) =>
                                  setEditValues((v) => ({ ...v, quantity: e.target.value }))
                                }
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveLineEdit()}
                                slotProps={{ input: { inputProps: { min: 1 } } }}
                                sx={{ width: 72 }}
                              />
                              <TextField
                                size="small"
                                label="Description"
                                value={editValues.description}
                                onChange={(e) =>
                                  setEditValues((v) => ({ ...v, description: e.target.value }))
                                }
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveLineEdit()}
                                sx={{ flex: 1 }}
                              />
                              <TextField
                                size="small"
                                label="Price"
                                type="number"
                                value={editValues.unit_price}
                                onChange={(e) =>
                                  setEditValues((v) => ({ ...v, unit_price: e.target.value }))
                                }
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveLineEdit()}
                                slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
                                sx={{ width: 100 }}
                              />
                              <IconButton
                                size="small"
                                color="success"
                                onClick={handleSaveLineEdit}
                                disabled={updateLineMutation.isPending}
                              >
                                <Check />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => setEditingLineId(null)}
                              >
                                <CancelOutlined />
                              </IconButton>
                            </Box>
                          </ListItem>
                        ) : (
                          <ListItem
                            key={line.id}
                            secondaryAction={
                              <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <IconButton
                                  edge="end"
                                  size="small"
                                  onClick={() => handleStartEditLine(line)}
                                >
                                  <Edit fontSize="small" />
                                </IconButton>
                                <IconButton
                                  edge="end"
                                  size="small"
                                  onClick={() => handleRemoveLine(line.id)}
                                  disabled={removeLineMutation.isPending}
                                >
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Box>
                            }
                          >
                            <ListItemText
                              primary={line.description}
                              secondary={`${line.quantity} × ${formatCurrency(line.unit_price)}`}
                              primaryTypographyProps={{ fontWeight: 500 }}
                            />
                            <Typography variant="body2" sx={{ ml: 1, mr: 6 }}>
                              {formatCurrency(line.line_total)}
                            </Typography>
                          </ListItem>
                        ),
                      )}
                    </List>
                    <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2, mt: 1 }}>
                      <Stack spacing={0.5}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography color="text.secondary">Subtotal</Typography>
                          <Typography>{formatCurrency(cart?.subtotal)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography color="text.secondary">Tax</Typography>
                          <Typography>{formatCurrency(cart?.tax_amount)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontWeight={700} variant="subtitle1">
                            Total
                          </Typography>
                          <Typography fontWeight={700} variant="subtitle1">
                            {formatCurrency(cart?.total)}
                          </Typography>
                        </Box>
                      </Stack>
                    </Box>
                  </>
                )}
              </Paper>
            </Grid>

            {/* Scan + payment panel */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Add item
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    inputRef={skuInputRef}
                    fullWidth
                    size="small"
                    placeholder="Scan or type SKU (or CUS-XXXX)"
                    value={skuInput}
                    onChange={(e) => setSkuInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleScanInput()}
                    autoFocus
                  />
                  <Button
                    variant="contained"
                    startIcon={<Search />}
                    onClick={handleScanInput}
                    disabled={!skuInput.trim() || addItemMutation.isPending || createCartMutation.isPending}
                  >
                    Add
                  </Button>
                </Box>
              </Paper>

              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
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
                    label="Cash tendered"
                    type="number"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
                    sx={{ mb: 1 }}
                  />
                )}
                {(paymentMethod === 'cash' || paymentMethod === 'split') && changeDue > 0 && (
                  <Typography
                    variant="h6"
                    color="success.main"
                    fontWeight={700}
                    sx={{ mb: 1 }}
                  >
                    Change: {formatCurrency(changeDue)}
                  </Typography>
                )}
                {(paymentMethod === 'card' || paymentMethod === 'split') && (
                  <TextField
                    fullWidth
                    size="small"
                    label="Card amount"
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
                  size="large"
                  onClick={handleComplete}
                  disabled={!hasItems || completeCartMutation.isPending}
                  sx={{ mt: 1 }}
                >
                  {completeCartMutation.isPending ? 'Processing…' : 'Complete sale'}
                </Button>
              </Paper>
            </Grid>
          </Grid>
        );
      }

      default:
        return null;
    }
  };

  // ── Device label for subtitle ──────────────────────────────────────────────

  const deviceLabel =
    config?.deviceType === 'register' && config.registerName
      ? `${config.registerName} (${config.registerCode})`
      : config
        ? config.deviceType.replace(/_/g, ' ')
        : 'Device not configured';

  if (registerConfigInvalid) {
    return (
      <Box>
        <PageHeader
          title="POS Terminal"
          subtitle={deviceLabel}
          action={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                size="small"
                label={printStatus.online ? 'Print server online' : 'Print server offline'}
                color={printStatus.online ? 'success' : 'default'}
                variant="outlined"
              />
              <Tooltip title="Configure this device">
                <IconButton size="small" onClick={() => setDeviceSetupOpen(true)} color="warning">
                  <Settings />
                </IconButton>
              </Tooltip>
            </Box>
          }
        />
        <Alert severity="error" sx={{ mb: 2 }}>
          This device is configured for register ID {registerId}, which does not exist anymore (for example after
          resetting data or re-seeding registers). Open device setup and select the correct register. Opening a drawer
          will fail until you do.
        </Alert>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Button variant="contained" size="large" onClick={() => setDeviceSetupOpen(true)}>
            Open device setup
          </Button>
        </Box>
        <DeviceSetupDialog
          open={deviceSetupOpen}
          onClose={() => setDeviceSetupOpen(false)}
          onSaved={() => setDeviceSetupOpen(false)}
        />
      </Box>
    );
  }

  if (terminalState === 'loading') {
    return <LoadingScreen message="Loading drawer..." />;
  }

  return (
    <Box>
      <PageHeader
        title="POS Terminal"
        subtitle={deviceLabel}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              size="small"
              label={printStatus.online ? 'Print server online' : 'Print server offline'}
              color={printStatus.online ? 'success' : 'default'}
              variant="outlined"
            />
            <Tooltip title={config ? 'Change device configuration' : 'Configure this device'}>
              <IconButton
                size="small"
                onClick={() => setDeviceSetupOpen(true)}
                color={config ? 'default' : 'warning'}
              >
                <Settings />
              </IconButton>
            </Tooltip>
          </Box>
        }
      />

      {renderContent()}

      {/* Open drawer dialog (register mode) */}
      <Dialog
        open={openDrawerDialog}
        onClose={() => setOpenDrawerDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Open drawer</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <DenominationCounter
              value={openingCount}
              onChange={setOpeningCount}
              label="Opening count"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDrawerDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleOpenDrawer}
            disabled={openDrawerMutation.isPending}
          >
            {openDrawerMutation.isPending ? 'Opening…' : 'Open'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!soldScanDialog}
        onClose={() => {
          setSoldScanDialog(null);
          skuInputRef.current?.focus();
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>This item is already sold</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Inventory shows this SKU as sold. If this tag is still on the floor, you can create a
            new shelf item from this record and add it to the sale.
          </Typography>
          {soldScanDialog?.sku && (
            <Typography variant="body2" fontWeight={600}>
              SKU: {soldScanDialog.sku}
            </Typography>
          )}
          {soldScanDialog?.title && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {soldScanDialog.title}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            onClick={() => {
              setSoldScanDialog(null);
              skuInputRef.current?.focus();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!cart || addResaleCopyMutation.isPending}
            onClick={async () => {
              if (!soldScanDialog || !cart) return;
              try {
                const updated = await addResaleCopyMutation.mutateAsync({
                  cartId: cart.id,
                  sourceItemId: soldScanDialog.itemId,
                });
                setCart(updated as unknown as Cart);
                setSoldScanDialog(null);
                enqueueSnackbar('New item created and added to cart', { variant: 'success' });
              } catch {
                enqueueSnackbar('Could not create resale copy. Try again.', { variant: 'error' });
              }
              skuInputRef.current?.focus();
            }}
          >
            {addResaleCopyMutation.isPending ? 'Working…' : 'Create copy and add to cart'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Void sale confirmation */}
      <ConfirmDialog
        open={voidConfirmOpen}
        title="Void this sale?"
        message="All items will be returned to inventory and this transaction will be recorded as voided. This cannot be undone."
        confirmLabel="Void sale"
        severity="error"
        onConfirm={handleVoidSale}
        onCancel={() => setVoidConfirmOpen(false)}
        loading={voidCartMutation.isPending}
      />

      {/* Device setup dialog — always available so users can reconfigure at any time */}
      <DeviceSetupDialog
        open={deviceSetupOpen}
        onClose={() => setDeviceSetupOpen(false)}
        onSaved={() => setDeviceSetupOpen(false)}
      />
    </Box>
  );
}
