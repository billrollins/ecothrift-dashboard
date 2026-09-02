import { useState, useCallback, useRef, useMemo, useEffect, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import AccessTime from '@mui/icons-material/AccessTime';
import AccountBalance from '@mui/icons-material/AccountBalance';
import CancelOutlined from '@mui/icons-material/CancelOutlined';
import Check from '@mui/icons-material/Check';
import Delete from '@mui/icons-material/Delete';
import DeleteForever from '@mui/icons-material/DeleteForever';
import Edit from '@mui/icons-material/Edit';
import LocalShipping from '@mui/icons-material/LocalShipping';
import Percent from '@mui/icons-material/Percent';
import PersonOff from '@mui/icons-material/PersonOff';
import PersonOutline from '@mui/icons-material/PersonOutline';
import PlayArrow from '@mui/icons-material/PlayArrow';
import PointOfSale from '@mui/icons-material/PointOfSale';
import Search from '@mui/icons-material/Search';
import Sell from '@mui/icons-material/Sell';
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
import { DiscountDialog, type DiscountSubmitPayload } from '../../components/pos/DiscountDialog';
import {
  useRegisters,
  useDrawers,
  useCreateCart,
  useAddItemToCart,
  useAddManualLineToCart,
  useAddDiscountToCart,
  useAddDeliveryToCart,
  useAddResaleCopyToCart,
  useUpdateCartLine,
  useRemoveCartLine,
  useCompleteCart,
  useVoidCart,
  useOpenDrawer,
  useDrawerTakeover,
  useDeliveryAvailabilities,
} from '../../hooks/usePOS';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { WorkCyclePill } from '../../components/routines/WorkCyclePill';
import { useDeviceConfig } from '../../hooks/useDeviceConfig';
import { useLocalPrintStatus } from '../../hooks/useLocalPrintStatus';
import { useLookupCustomer } from '../../hooks/useEmployees';
import { useAuth } from '../../contexts/AuthContext';
import { updateCart, getCarts, suggestDeliveryAddresses } from '../../api/pos.api';
import type { DeliveryAddressSuggestion } from '../../api/pos.api';
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

const DEFAULT_MANUAL_LINE_TITLE = 'Pink Tag Item';
const DEFAULT_MANUAL_LINE_PRICE = '0.50';

function formatCurrency(value: string | number | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

/** New line id, else a line whose qty/price/total changed, else the last line. */
function findAffectedCartLineId(prev: Cart | null, next: Cart): number | null {
  const prevLines = prev?.lines ?? [];
  const nextLines = next.lines ?? [];
  if (nextLines.length === 0) return null;

  const prevById = new Map(prevLines.map((line) => [line.id, line]));
  for (const line of nextLines) {
    if (!prevById.has(line.id)) return line.id;
  }
  for (const line of nextLines) {
    const old = prevById.get(line.id);
    if (
      old &&
      (old.quantity !== line.quantity ||
        String(old.unit_price) !== String(line.unit_price) ||
        String(old.line_total) !== String(line.line_total) ||
        old.description !== line.description)
    ) {
      return line.id;
    }
  }
  return nextLines[nextLines.length - 1]?.id ?? null;
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
  const manualDescriptionInputRef = useRef<HTMLInputElement>(null);
  const cartRef = useRef<Cart | null>(null);
  const pendingScrollLineIdRef = useRef<number | null>(null);
  const lineElRefs = useRef<Map<number, HTMLElement>>(new Map());
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
  const [unscannableDialogOpen, setUnscannableDialogOpen] = useState(false);
  const [manualDescription, setManualDescription] = useState(DEFAULT_MANUAL_LINE_TITLE);
  const [manualUnitPrice, setManualUnitPrice] = useState(DEFAULT_MANUAL_LINE_PRICE);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [deliveryTier, setDeliveryTier] = useState<'5mi' | '10mi'>('5mi');
  const [deliveryName, setDeliveryName] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLineIds, setDeliveryLineIds] = useState<number[]>([]);
  const [deliveryIsApt, setDeliveryIsApt] = useState(false);
  const [deliveryUnit, setDeliveryUnit] = useState('');
  const [deliverySuggestions, setDeliverySuggestions] = useState<DeliveryAddressSuggestion[]>([]);
  const [deliverySuggestLoading, setDeliverySuggestLoading] = useState(false);
  const [deliverySuggestError, setDeliverySuggestError] = useState<string | null>(null);
  const [deliveryPicked, setDeliveryPicked] = useState<DeliveryAddressSuggestion | null>(null);
  const [deliveryTooFarOpen, setDeliveryTooFarOpen] = useState(false);
  const [deliveryTooFarMiles, setDeliveryTooFarMiles] = useState<string | null>(null);
  const [deliveryAvailabilityId, setDeliveryAvailabilityId] = useState<number | '' | 'later'>('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryUnscheduledReminderOpen, setDeliveryUnscheduledReminderOpen] = useState(false);
  const [editingDeliveryLineId, setEditingDeliveryLineId] = useState<number | null>(null);
  const deliverySuggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deliverySuggestSeqRef = useRef(0);

  const commitCart = useCallback((next: Cart, opts?: { scroll?: boolean }) => {
    if (opts?.scroll !== false) {
      pendingScrollLineIdRef.current = findAffectedCartLineId(cartRef.current, next);
    }
    cartRef.current = next;
    setCart(next);
  }, []);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    return () => {
      if (deliverySuggestTimerRef.current) clearTimeout(deliverySuggestTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const lineId = pendingScrollLineIdRef.current;
    if (lineId == null) return;
    pendingScrollLineIdRef.current = null;
    const scroll = () => {
      const el = lineElRefs.current.get(lineId);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    requestAnimationFrame(() => requestAnimationFrame(scroll));
  }, [cart]);

  // Stable date string - only recomputes at midnight
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
  const addManualLineMutation = useAddManualLineToCart();
  const addDiscountMutation = useAddDiscountToCart();
  const addDeliveryMutation = useAddDeliveryToCart();
  const { data: upcomingDeliverySlots = [], isFetching: deliverySlotsLoading } =
    useDeliveryAvailabilities(
      { upcoming: '1' },
      { enabled: deliveryDialogOpen },
    );
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
      commitCart(updated as unknown as Cart);
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
    commitCart,
    lookupCustomerMutation,
    enqueueSnackbar,
  ]);

  useEffect(() => {
    if (!unscannableDialogOpen) return;
    const id = requestAnimationFrame(() => {
      manualDescriptionInputRef.current?.focus();
      manualDescriptionInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [unscannableDialogOpen]);

  const handleOpenUnscannableDialog = useCallback(() => {
    setManualDescription(DEFAULT_MANUAL_LINE_TITLE);
    setManualUnitPrice(DEFAULT_MANUAL_LINE_PRICE);
    setUnscannableDialogOpen(true);
  }, []);

  const handleSubmitManualLine = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const desc = manualDescription.trim();
      if (!desc) {
        enqueueSnackbar('Description is required.', { variant: 'warning' });
        return;
      }
      const priceStr = manualUnitPrice.trim();
      const unitPrice = priceStr === '' ? 0.5 : parseFloat(priceStr);
      if (Number.isNaN(unitPrice) || unitPrice < 0) {
        enqueueSnackbar('Enter a valid price.', { variant: 'error' });
        return;
      }

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

      try {
        const updated = await addManualLineMutation.mutateAsync({
          cartId: activeCart.id,
          description: desc,
          unit_price: unitPrice,
        });
        commitCart(updated as unknown as Cart);
        setUnscannableDialogOpen(false);
        setManualDescription(DEFAULT_MANUAL_LINE_TITLE);
        setManualUnitPrice(DEFAULT_MANUAL_LINE_PRICE);
        skuInputRef.current?.focus();
      } catch {
        enqueueSnackbar('Failed to add line', { variant: 'error' });
      }
    },
    [
      cart,
      manualDescription,
      manualUnitPrice,
      isRegister,
      managerDrawerId,
      createCartMutation,
      addManualLineMutation,
      commitCart,
      enqueueSnackbar,
    ],
  );

  const ensureOpenCart = useCallback(async (): Promise<Cart | null> => {
    if (cart) return cart;
    const liveDrawer = todayDrawerRef.current;
    const targetDrawerId: number | undefined = isRegister
      ? (typeof liveDrawer?.id === 'number' ? liveDrawer.id : undefined)
      : typeof managerDrawerId === 'number'
        ? managerDrawerId
        : undefined;
    if (typeof targetDrawerId !== 'number') {
      enqueueSnackbar('Open a drawer first before scanning items.', { variant: 'warning' });
      return null;
    }
    try {
      const newCart = await createCartMutation.mutateAsync({ drawer: targetDrawerId });
      const created = newCart as unknown as Cart;
      setCart(created);
      cartRef.current = created;
      return created;
    } catch {
      enqueueSnackbar('Failed to create cart', { variant: 'error' });
      return null;
    }
  }, [cart, isRegister, managerDrawerId, createCartMutation, enqueueSnackbar]);

  const handleOpenDiscountDialog = useCallback(() => {
    setDiscountDialogOpen(true);
  }, []);

  const handleSubmitDiscount = useCallback(
    async (payload: DiscountSubmitPayload) => {
      const activeCart = await ensureOpenCart();
      if (!activeCart) return;
      try {
        const updated = await addDiscountMutation.mutateAsync({
          cartId: activeCart.id,
          ...payload,
        });
        commitCart(updated as unknown as Cart);
        setDiscountDialogOpen(false);
        skuInputRef.current?.focus();
      } catch (err: unknown) {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          'Failed to add discount';
        enqueueSnackbar(detail, { variant: 'error' });
      }
    },
    [ensureOpenCart, addDiscountMutation, commitCart, enqueueSnackbar],
  );

  const handleOpenDeliveryDialog = useCallback(() => {
    setEditingDeliveryLineId(null);
    setDeliveryTier('5mi');
    setDeliveryName('');
    setDeliveryPhone('');
    setDeliveryAddress('');
    setDeliveryLineIds([]);
    setDeliveryIsApt(false);
    setDeliveryUnit('');
    setDeliveryNotes('');
    setDeliverySuggestions([]);
    setDeliverySuggestError(null);
    setDeliveryPicked(null);
    setDeliveryTooFarOpen(false);
    setDeliveryTooFarMiles(null);
    setDeliveryAvailabilityId('');
    setDeliveryDialogOpen(true);
  }, []);

  const handleOpenDeliveryForEdit = useCallback((line: CartLine) => {
    const meta = (line.meta ?? {}) as Record<string, unknown>;
    setEditingDeliveryLineId(line.id);
    const tier = meta.tier === '10mi' ? '10mi' : '5mi';
    setDeliveryTier(tier);
    setDeliveryName(String(meta.customer_name ?? ''));
    setDeliveryPhone(String(meta.phone ?? ''));
    setDeliveryAddress(String(meta.address ?? ''));
    setDeliveryIsApt(Boolean(meta.is_apt));
    setDeliveryUnit(String(meta.unit ?? ''));
    setDeliveryNotes(String(meta.notes ?? ''));
    const availId = meta.availability_id;
    const scheduleLater = Boolean(meta.schedule_later) || availId == null || availId === '';
    setDeliveryAvailabilityId(
      scheduleLater
        ? 'later'
        : Number.isFinite(Number(availId))
          ? Number(availId)
          : '',
    );
    const storedIds = Array.isArray(meta.cart_line_ids)
      ? meta.cart_line_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : [];
    if (storedIds.length > 0) {
      setDeliveryLineIds(storedIds);
    } else {
      const itemsText = String(meta.items_delivered ?? '');
      const parts = itemsText
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
      const merchandise = (cartRef.current?.lines ?? []).filter(
        (ln) =>
          ln.line_kind !== 'discount' &&
          ln.line_kind !== 'delivery' &&
          (ln.line_kind === 'item' || ln.line_kind === 'manual' || ln.item != null),
      );
      setDeliveryLineIds(
        merchandise
          .filter((ln) => parts.includes(ln.description.trim().toLowerCase()))
          .map((ln) => ln.id),
      );
    }
    setDeliverySuggestions([]);
    setDeliverySuggestError(null);
    setDeliveryTooFarOpen(false);
    setDeliveryTooFarMiles(null);
    const lat = meta.lat != null ? Number(meta.lat) : NaN;
    const lon = meta.lon != null ? Number(meta.lon) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      setDeliveryPicked({
        display_name: String(meta.display_name ?? meta.address ?? ''),
        address_line: String(meta.address ?? ''),
        city: '',
        state: '',
        postcode: '',
        lat,
        lon,
        store_label: '',
        distance_miles: String(meta.distance_miles ?? ''),
        distance_mode:
          meta.distance_mode === 'driving' ? 'driving' : 'straight_line',
        tier,
        fee: tier === '5mi' ? '50.00' : '75.00',
        too_far: false,
      });
    } else {
      setDeliveryPicked(null);
    }
    setDeliveryDialogOpen(true);
  }, []);

  const deliveryMerchandiseLines = useMemo(
    () =>
      (cart?.lines ?? []).filter(
        (ln) =>
          ln.line_kind !== 'discount' &&
          ln.line_kind !== 'delivery' &&
          (ln.line_kind === 'item' || ln.line_kind === 'manual' || ln.item != null),
      ),
    [cart],
  );

  const runDeliveryAddressSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 3) {
      setDeliverySuggestions([]);
      setDeliverySuggestError(null);
      setDeliverySuggestLoading(false);
      return;
    }
    const seq = ++deliverySuggestSeqRef.current;
    setDeliverySuggestLoading(true);
    setDeliverySuggestError(null);
    try {
      const { data } = await suggestDeliveryAddresses(q);
      if (seq !== deliverySuggestSeqRef.current) return;
      setDeliverySuggestions(data.results ?? []);
      if ((data.results ?? []).length === 0) {
        setDeliverySuggestError(
          'No match yet. Include street number + street name (city/ZIP help). Then pause or press Enter.',
        );
      }
    } catch (err: unknown) {
      if (seq !== deliverySuggestSeqRef.current) return;
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Address lookup failed.';
      setDeliverySuggestions([]);
      setDeliverySuggestError(detail);
    } finally {
      if (seq === deliverySuggestSeqRef.current) setDeliverySuggestLoading(false);
    }
  }, []);

  const scheduleDeliveryAddressSearch = useCallback(
    (query: string) => {
      if (deliverySuggestTimerRef.current) clearTimeout(deliverySuggestTimerRef.current);
      deliverySuggestTimerRef.current = setTimeout(() => {
        void runDeliveryAddressSearch(query);
      }, 400);
    },
    [runDeliveryAddressSearch],
  );

  const handlePickDeliverySuggestion = useCallback((suggestion: DeliveryAddressSuggestion) => {
    const composed = [
      suggestion.address_line,
      suggestion.city,
      suggestion.state,
      suggestion.postcode,
    ]
      .filter(Boolean)
      .join(', ');
    setDeliveryAddress(composed.slice(0, 200));
    setDeliveryPicked(suggestion);
    setDeliverySuggestions([]);
    setDeliverySuggestError(null);

    if (suggestion.too_far || !suggestion.tier) {
      setDeliveryTooFarMiles(suggestion.distance_miles);
      setDeliveryTooFarOpen(true);
      return;
    }
    setDeliveryTier(suggestion.tier);
    const modeLabel =
      suggestion.distance_mode === 'driving' ? 'driving' : 'straight-line';
    enqueueSnackbar(
      `${suggestion.distance_miles} mi (${modeLabel}) from store → ${suggestion.tier === '5mi' ? '$50' : '$75'} delivery`,
      { variant: 'info' },
    );
  }, [enqueueSnackbar]);

  const handleSubmitDelivery = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const selectedLines = deliveryMerchandiseLines.filter((ln) =>
        deliveryLineIds.includes(ln.id),
      );
      const itemsDelivered = selectedLines
        .map((ln) => ln.description)
        .filter(Boolean)
        .join(', ')
        .slice(0, 300);
      if (!deliveryName.trim() || !deliveryPhone.trim() || !deliveryAddress.trim()) {
        enqueueSnackbar('Name, phone, and address are required.', {
          variant: 'warning',
        });
        return;
      }
      if (selectedLines.length === 0 || !itemsDelivered) {
        enqueueSnackbar('Select at least one cart item to deliver.', { variant: 'warning' });
        return;
      }
      if (deliveryAvailabilityId === '') {
        enqueueSnackbar('Pick a delivery date, or choose Schedule later (no date).', {
          variant: 'warning',
        });
        return;
      }
      if (deliveryIsApt && !deliveryUnit.trim()) {
        enqueueSnackbar('Unit # is required for apartments.', { variant: 'warning' });
        return;
      }
      if (deliveryPicked?.too_far) {
        setDeliveryTooFarMiles(deliveryPicked.distance_miles);
        setDeliveryTooFarOpen(true);
        return;
      }
      const scheduleLater = deliveryAvailabilityId === 'later';
      const activeCart = await ensureOpenCart();
      if (!activeCart) return;
      const itemCount = selectedLines.reduce((sum, ln) => sum + (ln.quantity || 1), 0);
      try {
        const updated = await addDeliveryMutation.mutateAsync({
          cartId: activeCart.id,
          tier: deliveryTier,
          customer_name: deliveryName.trim(),
          phone: deliveryPhone.trim(),
          address: deliveryAddress.trim(),
          items_delivered: itemsDelivered,
          schedule_later: scheduleLater,
          ...(scheduleLater ? {} : { availability_id: Number(deliveryAvailabilityId) }),
          notes: deliveryNotes.trim(),
          item_count: itemCount,
          cart_line_ids: selectedLines.map((ln) => ln.id),
          ...(editingDeliveryLineId != null
            ? { replace_line_id: editingDeliveryLineId }
            : {}),
          is_apt: deliveryIsApt,
          unit: deliveryUnit.trim(),
          ...(deliveryPicked
            ? {
                distance_miles: deliveryPicked.distance_miles,
                distance_mode: deliveryPicked.distance_mode,
                lat: deliveryPicked.lat,
                lon: deliveryPicked.lon,
                display_name: deliveryPicked.display_name,
              }
            : {}),
        });
        commitCart(updated as unknown as Cart);
        setDeliveryDialogOpen(false);
        setEditingDeliveryLineId(null);
        if (scheduleLater) {
          setDeliveryUnscheduledReminderOpen(true);
        } else {
          skuInputRef.current?.focus();
        }
      } catch (err: unknown) {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          (editingDeliveryLineId != null ? 'Failed to update delivery' : 'Failed to add delivery');
        enqueueSnackbar(detail, { variant: 'error' });
      }
    },
    [
      deliveryName,
      deliveryPhone,
      deliveryAddress,
      deliveryLineIds,
      deliveryMerchandiseLines,
      deliveryAvailabilityId,
      deliveryNotes,
      deliveryIsApt,
      deliveryUnit,
      deliveryTier,
      deliveryPicked,
      editingDeliveryLineId,
      ensureOpenCart,
      addDeliveryMutation,
      commitCart,
      enqueueSnackbar,
    ],
  );

  const handleDeliveryLinesChange = useCallback((e: SelectChangeEvent<string[]>) => {
    const value = e.target.value;
    const raw = typeof value === 'string' ? value.split(',') : value;
    setDeliveryLineIds(raw.map((id) => Number(id)).filter((id) => Number.isFinite(id)));
  }, []);

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

  const handleStartEditLine = useCallback(
    (line: CartLine) => {
      if (line.line_kind === 'delivery') {
        handleOpenDeliveryForEdit(line);
        return;
      }
      setEditingLineId(line.id);
      setEditValues({
        quantity: String(line.quantity),
        description: line.description,
        unit_price: String(line.unit_price),
      });
    },
    [handleOpenDeliveryForEdit],
  );

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
      commitCart(updated as unknown as Cart);
      setEditingLineId(null);
    } catch {
      enqueueSnackbar('Failed to update line', { variant: 'error' });
    }
  }, [cart, editingLineId, editValues, updateLineMutation, commitCart, enqueueSnackbar]);

  const handleVoidSale = useCallback(async () => {
    if (!cart) return;
    try {
      await voidCartMutation.mutateAsync(cart.id);
      enqueueSnackbar('Sale voided', { variant: 'info' });
      setCart(null);
      cartRef.current = null;
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
      cartRef.current = null;
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
              <strong>Drawer in use</strong> - currently assigned to{' '}
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
                      : '-'}
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
                      : '-'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Closed:{' '}
                    {todayDrawer?.closed_at
                      ? format(new Date(todayDrawer.closed_at), 'h:mm a')
                      : '-'}
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
                        {d.current_cashier_name ? ` - ${d.current_cashier_name}` : ''}
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
          <Grid
            container
            spacing={2}
            sx={{ flex: 1, minHeight: 0, alignItems: 'stretch', height: '100%' }}
          >
            {/* Cart panel - fills leftover viewport; lines scroll; totals always pinned */}
            <Grid size={{ xs: 12, md: 7 }} sx={{ minHeight: 0, display: 'flex', height: { md: '100%' } }}>
              <Paper
                sx={{
                  p: 2,
                  width: '100%',
                  flex: 1,
                  minHeight: { xs: 320, md: 0 },
                  height: { md: '100%' },
                  maxHeight: { xs: 'min(56dvh, 560px)', md: 'none' },
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 1,
                    flexShrink: 0,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                    <Typography variant="h6">Cart</Typography>
                    <WorkCyclePill />
                  </Box>
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

                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'scroll',
                    overflowX: 'hidden',
                    scrollbarGutter: 'stable',
                    pr: 0.5,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: 'grey.50',
                  }}
                >
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
                    <List dense disablePadding>
                      {cartLines.map((line: CartLine) =>
                        editingLineId === line.id ? (
                          <ListItem
                            key={line.id}
                            ref={(el) => {
                              if (el) lineElRefs.current.set(line.id, el);
                              else lineElRefs.current.delete(line.id);
                            }}
                            sx={{ flexWrap: 'wrap', gap: 1, py: 1 }}
                          >
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
                            ref={(el) => {
                              if (el) lineElRefs.current.set(line.id, el);
                              else lineElRefs.current.delete(line.id);
                            }}
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
                              primary={
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <Typography component="span" sx={{ fontWeight: 500 }}>
                                    {line.description}
                                  </Typography>
                                  {line.line_kind === 'discount' && (
                                    <Chip size="small" label="Discount" color="warning" sx={{ height: 22 }} />
                                  )}
                                  {line.line_kind === 'delivery' && (
                                    <Chip size="small" label="Delivery" color="info" sx={{ height: 22 }} />
                                  )}
                                  {(line.line_kind === 'manual' ||
                                    (line.item == null &&
                                      line.line_kind !== 'discount' &&
                                      line.line_kind !== 'delivery')) && (
                                    <Chip
                                      size="small"
                                      label="Pink tag"
                                      sx={{
                                        height: 22,
                                        fontSize: '0.7rem',
                                        bgcolor: 'rgba(233, 30, 99, 0.14)',
                                      }}
                                    />
                                  )}
                                </Box>
                              }
                              secondary={
                                line.line_kind === 'delivery' && line.meta
                                  ? `${line.quantity} × ${formatCurrency(line.unit_price)} · ${String(line.meta.phone ?? '')} · ${String(line.meta.address ?? '')}${line.meta.is_apt ? ` Apt ${String(line.meta.unit ?? '')}` : ''}`
                                  : `${line.quantity} × ${formatCurrency(line.unit_price)}`
                              }
                              slotProps={{ primary: { component: 'div' } }}
                            />
                            <Typography variant="body2" sx={{ ml: 1, mr: 6 }}>
                              {formatCurrency(line.line_total)}
                            </Typography>
                          </ListItem>
                        ),
                      )}
                    </List>
                  )}
                </Box>

                <Box
                  sx={{
                    borderTop: 1,
                    borderColor: 'divider',
                    pt: 1.5,
                    mt: 1.5,
                    flexShrink: 0,
                  }}
                >
                  <Stack spacing={0.5}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography color="text.secondary">Subtotal</Typography>
                      <Typography>{formatCurrency(cart?.subtotal ?? 0)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography color="text.secondary">Tax</Typography>
                      <Typography>{formatCurrency(cart?.tax_amount ?? 0)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontWeight={700} variant="h6">
                        Total
                      </Typography>
                      <Typography fontWeight={700} variant="h6">
                        {formatCurrency(cart?.total ?? 0)}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              </Paper>
            </Grid>

            {/* Scan + payment panel */}
            <Grid
              size={{ xs: 12, md: 5 }}
              sx={{ minHeight: 0, display: 'flex', flexDirection: 'column', height: { md: '100%' } }}
            >
              <Paper sx={{ p: 2, mb: 2, flexShrink: 0 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Add item
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
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
                    disabled={
                      !skuInput.trim() || addItemMutation.isPending || createCartMutation.isPending
                    }
                  >
                    Add
                  </Button>
                </Box>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 1,
                  }}
                >
                  <Button
                    onClick={handleOpenUnscannableDialog}
                    disabled={addManualLineMutation.isPending}
                    sx={{
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 0.75,
                      py: 1.5,
                      px: 1,
                      minHeight: 96,
                      borderRadius: 2,
                      textTransform: 'none',
                      border: '2px solid',
                      borderColor: 'rgba(233, 30, 99, 0.45)',
                      bgcolor: 'rgba(233, 30, 99, 0.08)',
                      color: '#ad1457',
                      '&:hover': {
                        bgcolor: 'rgba(233, 30, 99, 0.16)',
                        borderColor: '#c2185b',
                      },
                    }}
                  >
                    <Sell sx={{ fontSize: 28 }} />
                    <Typography variant="subtitle2" fontWeight={700} lineHeight={1.15}>
                      Pink tag
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.85, lineHeight: 1.1 }}>
                      Unscannable
                    </Typography>
                  </Button>

                  <Button
                    onClick={handleOpenDiscountDialog}
                    disabled={addDiscountMutation.isPending}
                    sx={{
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 0.75,
                      py: 1.5,
                      px: 1,
                      minHeight: 96,
                      borderRadius: 2,
                      textTransform: 'none',
                      border: '2px solid',
                      borderColor: 'warning.light',
                      bgcolor: 'rgba(237, 108, 2, 0.08)',
                      color: 'warning.dark',
                      '&:hover': {
                        bgcolor: 'rgba(237, 108, 2, 0.16)',
                        borderColor: 'warning.main',
                      },
                    }}
                  >
                    <Percent sx={{ fontSize: 28 }} />
                    <Typography variant="subtitle2" fontWeight={700} lineHeight={1.15}>
                      Discount
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.85, lineHeight: 1.1 }}>
                      Store credit
                    </Typography>
                  </Button>

                  <Button
                    onClick={handleOpenDeliveryDialog}
                    disabled={addDeliveryMutation.isPending}
                    sx={{
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 0.75,
                      py: 1.5,
                      px: 1,
                      minHeight: 96,
                      borderRadius: 2,
                      textTransform: 'none',
                      border: '2px solid',
                      borderColor: 'info.light',
                      bgcolor: 'rgba(2, 136, 209, 0.08)',
                      color: 'info.dark',
                      '&:hover': {
                        bgcolor: 'rgba(2, 136, 209, 0.16)',
                        borderColor: 'info.main',
                      },
                    }}
                  >
                    <LocalShipping sx={{ fontSize: 28 }} />
                    <Typography variant="subtitle2" fontWeight={700} lineHeight={1.15}>
                      Delivery
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.85, lineHeight: 1.1 }}>
                      $50 / $75
                    </Typography>
                  </Button>
                </Box>
              </Paper>

              <Paper sx={{ p: 2, flex: 1, minHeight: 0 }}>
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
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        dense
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

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {renderContent()}
      </Box>

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
                commitCart(updated as unknown as Cart);
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

      <Dialog
        open={unscannableDialogOpen}
        onClose={() => {
          setUnscannableDialogOpen(false);
          skuInputRef.current?.focus();
        }}
        maxWidth="xs"
        fullWidth
      >
        <form onSubmit={handleSubmitManualLine}>
          <DialogTitle>Unscannable item</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                inputRef={manualDescriptionInputRef}
                label="Description"
                fullWidth
                size="small"
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
              />
              <TextField
                label="Price"
                type="number"
                fullWidth
                size="small"
                value={manualUnitPrice}
                onChange={(e) => setManualUnitPrice(e.target.value)}
                slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              type="button"
              onClick={() => {
                setUnscannableDialogOpen(false);
                skuInputRef.current?.focus();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={addManualLineMutation.isPending || createCartMutation.isPending}
            >
              {addManualLineMutation.isPending ? 'Adding…' : 'OK'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <DiscountDialog
        open={discountDialogOpen}
        cart={cart}
        pending={addDiscountMutation.isPending}
        onClose={() => {
          setDiscountDialogOpen(false);
          skuInputRef.current?.focus();
        }}
        onSubmit={handleSubmitDiscount}
      />

      <Dialog
        open={deliveryDialogOpen}
        onClose={() => {
          setDeliveryDialogOpen(false);
          setEditingDeliveryLineId(null);
          skuInputRef.current?.focus();
        }}
        maxWidth="sm"
        fullWidth
      >
        <form onSubmit={handleSubmitDelivery}>
          <DialogTitle>{editingDeliveryLineId != null ? 'Edit delivery' : 'Delivery'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                autoFocus
                label="Name"
                required
                value={deliveryName}
                onChange={(e) => setDeliveryName(e.target.value)}
                fullWidth
              />
              <TextField
                label="Phone"
                required
                value={deliveryPhone}
                onChange={(e) => setDeliveryPhone(e.target.value)}
                fullWidth
              />
              <FormControl fullWidth required disabled={deliveryMerchandiseLines.length === 0}>
                <InputLabel id="delivery-items-label">What is being delivered</InputLabel>
                <Select
                  labelId="delivery-items-label"
                  multiple
                  value={deliveryLineIds.map(String)}
                  onChange={handleDeliveryLinesChange}
                  input={<OutlinedInput label="What is being delivered" />}
                  renderValue={(selected) => {
                    const ids = new Set(selected);
                    return deliveryMerchandiseLines
                      .filter((ln) => ids.has(String(ln.id)))
                      .map((ln) => ln.description)
                      .join(', ');
                  }}
                >
                  {deliveryMerchandiseLines.length === 0 ? (
                    <MenuItem value="" disabled>
                      Add merchandise to the cart first
                    </MenuItem>
                  ) : (
                    deliveryMerchandiseLines.map((ln) => (
                      <MenuItem key={ln.id} value={String(ln.id)}>
                        <Checkbox checked={deliveryLineIds.includes(ln.id)} />
                        <ListItemText
                          primary={ln.description}
                          secondary={`${ln.quantity} × ${formatCurrency(ln.unit_price)}`}
                        />
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>

              <FormControl fullWidth required>
                <InputLabel id="delivery-date-label">Delivery date</InputLabel>
                <Select
                  labelId="delivery-date-label"
                  label="Delivery date"
                  value={
                    deliveryAvailabilityId === ''
                      ? ''
                      : deliveryAvailabilityId === 'later'
                        ? 'later'
                        : String(deliveryAvailabilityId)
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || v === 'later') {
                      setDeliveryAvailabilityId(v === '' ? '' : 'later');
                      return;
                    }
                    setDeliveryAvailabilityId(Number(v));
                  }}
                  disabled={deliverySlotsLoading}
                >
                  <MenuItem value="later">
                    Schedule later (no date) - book fee now, date on Deliveries
                  </MenuItem>
                  {upcomingDeliverySlots.length === 0 ? (
                    <MenuItem value="" disabled>
                      {deliverySlotsLoading
                        ? 'Loading dates…'
                        : 'No available dates yet - use Schedule later, or add dates on Deliveries'}
                    </MenuItem>
                  ) : (
                    upcomingDeliverySlots.map((slot) => {
                      const start = String(slot.time_start).slice(0, 5);
                      const end = String(slot.time_end).slice(0, 5);
                      const who = slot.assigned_to ? ` · ${slot.assigned_to}` : '';
                      const load = `${slot.delivery_count} del / ${slot.items_booked} items`;
                      return (
                        <MenuItem key={slot.id} value={String(slot.id)}>
                          {slot.date} {start}-{end} ({slot.crew_size}p){who} - {load}
                        </MenuItem>
                      );
                    })
                  )}
                </Select>
              </FormControl>

              {deliveryAvailabilityId === 'later' && (
                <Alert severity="info">
                  Delivery fee will be added with <strong>no date</strong>. Deliveries board will show
                  a “needs scheduling” warning until a Saturday is assigned.
                </Alert>
              )}

              <TextField
                label="Notes"
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                helperText="Optional - gate codes, stairs, preferred Saturday, etc."
              />

              <TextField
                label="Address"
                required
                value={deliveryAddress}
                onChange={(e) => {
                  const next = e.target.value;
                  setDeliveryAddress(next);
                  setDeliveryPicked(null);
                  scheduleDeliveryAddressSearch(next);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (deliverySuggestTimerRef.current) {
                      clearTimeout(deliverySuggestTimerRef.current);
                    }
                    void runDeliveryAddressSearch(deliveryAddress);
                  }
                }}
                fullWidth
                helperText="Type an address (pause or Enter) to look up distance to Eco-Thrift."
                slotProps={{
                  input: {
                    endAdornment: deliverySuggestLoading ? (
                      <CircularProgress color="inherit" size={18} />
                    ) : undefined,
                  },
                }}
              />

              {deliverySuggestError && (
                <Alert severity="warning" onClose={() => setDeliverySuggestError(null)}>
                  {deliverySuggestError}
                </Alert>
              )}

              {deliverySuggestions.length > 0 && (
                <Paper variant="outlined" sx={{ maxHeight: 220, overflow: 'auto' }}>
                  <List dense disablePadding>
                    {deliverySuggestions.map((s) => (
                      <ListItemButton
                        key={`${s.lat},${s.lon},${s.display_name}`}
                        onClick={() => handlePickDeliverySuggestion(s)}
                      >
                        <ListItemText
                          primary={s.display_name}
                          secondary={
                            <Typography
                              component="span"
                              variant="body2"
                              color={s.too_far ? 'error' : 'text.secondary'}
                            >
                              {s.too_far
                                ? `${s.distance_miles} mi - too far for delivery`
                                : `${s.distance_miles} mi ${s.distance_mode === 'driving' ? 'driving' : 'straight-line'} → ${s.tier === '5mi' ? '$50' : '$75'}`}
                            </Typography>
                          }
                        />
                      </ListItemButton>
                    ))}
                  </List>
                </Paper>
              )}

              {deliveryPicked && !deliveryPicked.too_far && (
                <Alert severity="success">
                  {deliveryPicked.distance_miles} miles{' '}
                  {deliveryPicked.distance_mode === 'driving' ? 'driving' : 'straight-line'} from
                  store. Fee set to{' '}
                  {deliveryPicked.tier === '5mi' ? '$50 (5 mi or less)' : '$75 (5-10 mi)'}.
                </Alert>
              )}

              <FormControl>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Fee
                </Typography>
                <RadioGroup
                  row
                  value={deliveryTier}
                  onChange={(e) => setDeliveryTier(e.target.value as '5mi' | '10mi')}
                >
                  <FormControlLabel value="5mi" control={<Radio />} label="$50 · 5 miles or less" />
                  <FormControlLabel value="10mi" control={<Radio />} label="$75 · 5 to 10 miles" />
                </RadioGroup>
              </FormControl>

              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={deliveryIsApt}
                      onChange={(e) => setDeliveryIsApt(e.target.checked)}
                    />
                  }
                  label="Apt?"
                />
                <TextField
                  label="Unit #"
                  value={deliveryUnit}
                  onChange={(e) => setDeliveryUnit(e.target.value)}
                  disabled={!deliveryIsApt}
                  sx={{ flex: 1 }}
                  required={deliveryIsApt}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Customer policy (warranty + delivery rules): open Appliance policy from Cashier nav
                or{' '}
                <Box
                  component="a"
                  href="/pos/appliance-policy.html"
                  target="_blank"
                  rel="noreferrer"
                  sx={{ color: 'primary.main' }}
                >
                  print the bilingual sheet
                </Box>
                .
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              type="button"
              onClick={() => {
                setDeliveryDialogOpen(false);
                setEditingDeliveryLineId(null);
                skuInputRef.current?.focus();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                addDeliveryMutation.isPending ||
                Boolean(deliveryPicked?.too_far) ||
                deliveryAvailabilityId === '' ||
                deliveryLineIds.length === 0
              }
            >
              {addDeliveryMutation.isPending
                ? editingDeliveryLineId != null
                  ? 'Saving…'
                  : 'Adding…'
                : editingDeliveryLineId != null
                  ? 'Save delivery'
                  : 'Add delivery'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog
        open={deliveryUnscheduledReminderOpen}
        onClose={() => {
          setDeliveryUnscheduledReminderOpen(false);
          skuInputRef.current?.focus();
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Tell the customer about delivery timing</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            This delivery has <strong>no date yet</strong>. Staff will schedule it on the Deliveries
            board.
          </Alert>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Please note for the customer:
          </Typography>
          <Typography variant="body1" component="div" sx={{ pl: 1 }}>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                Deliveries run on <strong>Saturdays</strong>.
              </li>
              <li>
                Someone <strong>must be home</strong> - we call the day of delivery and again when we
                arrive. No answer = no delivery attempt.
              </li>
              <li>Signature required; drop-off only (end of driveway / apartment lot).</li>
            </ul>
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="contained"
            onClick={() => {
              setDeliveryUnscheduledReminderOpen(false);
              skuInputRef.current?.focus();
            }}
          >
            Got it
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deliveryTooFarOpen}
        onClose={() => setDeliveryTooFarOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Too far for delivery</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            That address is about{' '}
            <strong>{deliveryTooFarMiles ?? 'more than 10'}</strong> miles from Eco-Thrift
            (8425 West Center Road). We only deliver within 10 miles.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="contained"
            onClick={() => {
              setDeliveryTooFarOpen(false);
              setDeliveryPicked(null);
            }}
          >
            OK
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

      {/* Device setup dialog - always available so users can reconfigure at any time */}
      <DeviceSetupDialog
        open={deviceSetupOpen}
        onClose={() => setDeviceSetupOpen(false)}
        onSaved={() => setDeviceSetupOpen(false)}
      />
    </Box>
  );
}
