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
import Build from '@mui/icons-material/Build';
import CancelOutlined from '@mui/icons-material/CancelOutlined';
import DeleteForever from '@mui/icons-material/DeleteForever';
import LocalShipping from '@mui/icons-material/LocalShipping';
import Percent from '@mui/icons-material/Percent';
import WbSunny from '@mui/icons-material/WbSunny';
import PersonOff from '@mui/icons-material/PersonOff';
import PlayArrow from '@mui/icons-material/PlayArrow';
import PointOfSale from '@mui/icons-material/PointOfSale';
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
import { useManagerOk } from '../../components/pos/ManagerOkDialog';
import TaxExemptDialog, { taxExemptText, type TaxExemptInput } from '../../components/pos/TaxExemptDialog';
import { thriftCoversSale, thriftPaymentParts } from '../../utils/posPayment';
import { SummerLinesDialog } from '../../components/pos/SummerLinesDialog';
import {
  useRegisters,
  useDrawers,
  useCreateCart,
  useAddItemToCart,
  useAddManualLineToCart,
  useAddAssemblyToCart,
  useAddDiscountToCart,
  useAddDeliveryToCart,
  useAddResaleCopyToCart,
  useSetCartLineSale,
  useSyncCartSale,
  useSaleMode,
  useSetLaborDayOverride,
  useUpdateCartLine,
  useRemoveCartLine,
  useCompleteCart,
  useVoidCart,
  useOpenDrawer,
  useOpenTrainingDrawer,
  useDrawerTakeover,
  useDeliveryAvailabilities,
} from '../../hooks/usePOS';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { CardTenderDialog } from '../../components/pos/CardTenderDialog';
import { TbAmount, tbNumber } from '../../components/thriftplus/ThriftBucks';
import {
  amountDue,
  bucksUsed,
  creditUsed,
  instantOffOnLines,
  isBucksLine,
  needsCardTender,
  practiceCardPayload,
  reringMessage,
  saleSavings,
} from '../../utils/thriftPlusRegister';
import { TrainingBanner, TrainingPaymentDialog } from '../../components/pos/TrainingRegister';
import { WorkCyclePill } from '../../components/routines/WorkCyclePill';
import { WorkCyclePromptDialog } from './WorkCyclePromptDialog';
import { writeLastActivity } from './idlePrompt';
import { useDeviceConfig } from '../../hooks/useDeviceConfig';
import { useLocalPrintStatus } from '../../hooks/useLocalPrintStatus';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCarts,
  getCartCardPreview,
  getStaffPurchaseSettings,
  logOpenDrawer,
  setTaxExempt,
  logPrintFailed,
  suggestDeliveryAddresses,
} from '../../api/pos.api';
import { PayrollPicker } from '../../components/pos/PayrollPicker';
import type { DeliveryAddressSuggestion } from '../../api/pos.api';
import { localPrintService, printErrorMessage } from '../../services/localPrintService';
import type { CardPreview, Cart, CartLine, Drawer, PaymentMethod, POSDeviceConfig, Register } from '../../types/pos.types';
import { deriveTerminalState } from './terminalState';
import { TEST_TERMINAL_TITLE, testTerminalDeviceConfig } from '../../utils/testTerminal';
import type { DenominationBreakdown } from '../../types/pos.types';
import {
  parsePosAddItemError,
  snackbarVariantForPosAddItemError,
} from '../../utils/posAddItemError';
import { buildReceiptData } from '../../utils/posReceipt';
import ReturnsPopup from '../../components/pos/ReturnsPopup';
import ThriftMemberDialog from '../../components/pos/ThriftMemberDialog';
import ThriftPlusPanel from '../../components/pos/ThriftPlusPanel';
import SuspendedSalesBar from '../../components/pos/SuspendedSalesBar';
import ThriftPlusPhoneFind from '../../components/pos/ThriftPlusPhoneFind';
import ThriftPlusSignupDialog from '../../components/pos/ThriftPlusSignupDialog';
import { useQuery } from '@tanstack/react-query';
import {
  attachThriftCard,
  getThriftRegisterStatus,
  pendingFromError,
  refreshCart,
  reringThriftCard,
  reringThriftMember,
  thriftErrorMessage,
} from '../../api/thriftplusRegister.api';
import { thriftCardCode } from '../../utils/thriftPlusCard';
import { IconConfirm as Check, IconDelete as Delete, IconEdit as Edit, IconRefresh as Refresh, IconSearch as Search } from '../../icons/ecoIcons';

// ── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_MANUAL_LINE_TITLE = 'Pink Tag Item';
const DEFAULT_MANUAL_LINE_PRICE = '0.50';

function formatCurrency(value: string | number | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function moneyCents(value: number): number {
  return Math.round(value * 100) / 100;
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

// ── Component ──────────────────────────────────────────────────────────────

/** Thrift+ re-ring works for 30 minutes after a sale (apps/thriftplus/services/register.py). */
const RERING_WINDOW_MS = 30 * 60 * 1000;

export default function TerminalPage({ testRegister }: { testRegister?: Register } = {}) {
  // The test terminal (/pos/test, 2026-10-16) brings the training register itself and never reads or changes the
  // computer's saved device config; /pos/terminal (no testRegister) is exactly as before.
  const testMode = testRegister != null;
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  // The owner (Admin or superuser) turns the store sale on and off (REG-21).
  const isOwner = Boolean(user?.is_superuser || user?.role === 'Admin');
  const skuInputRef = useRef<HTMLInputElement>(null);
  const manualDescriptionInputRef = useRef<HTMLInputElement>(null);
  const cartRef = useRef<Cart | null>(null);
  // A double tap on Complete fires twice before the button greys out: the second tap stops here (2026-10-21).
  const completingRef = useRef(false);
  // One cart per sale, and one add per scan, however slow the server is (see startCart).
  const pendingCartRef = useRef<Promise<Cart> | null>(null);
  const scanInFlightRef = useRef('');
  const pendingScrollLineIdRef = useRef<number | null>(null);
  const lineElRefs = useRef<Map<number, HTMLElement>>(new Map());
  const savedDevice = useDeviceConfig({ ignoreSaved: testMode });
  const testConfig = useMemo(
    () => (testRegister ? testTerminalDeviceConfig(testRegister) : null),
    [testRegister],
  );
  const config: POSDeviceConfig | null = testConfig ?? savedDevice.config;
  const isRegister = testConfig ? true : savedDevice.isRegister;
  const registerId = testConfig ? (testConfig.registerId ?? null) : savedDevice.registerId;
  const thriftStatus = useQuery({
    queryKey: ['thriftplus', 'register-status', config?.registerCode ?? ''],
    queryFn: () => getThriftRegisterStatus(config?.registerCode ?? ''),
    enabled: Boolean(config?.registerCode),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
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
  const thriftLive = Boolean(cart?.thrift_plus?.live || thriftStatus.data?.live);
  const [skuInput, setSkuInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const [payrollEmployee, setPayrollEmployee] = useState<number | ''>('');
  // Payroll deduction is offered only while the owner has it switched on (Settings → Store).
  const staffPurchases = useQuery({
    queryKey: ['pos', 'staff-purchase-settings'],
    queryFn: async () => (await getStaffPurchaseSettings()).data,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const payrollOn = Boolean(staffPurchases.data?.payroll_deduction);
  const [cardTenderOpen, setCardTenderOpen] = useState(false);
  // Training register: the sale waits here for the "THIS IS JUST A TEST" screen (2026-10-10).
  const [trainingPayload, setTrainingPayload] = useState<Record<string, unknown> | null>(null);
  const [cardPreview, setCardPreview] = useState<CardPreview | null>(null);
  // Thrift+ re-ring: the last completed sale on this terminal, and whether the next member QR scan re-rings it.
  const [lastSale, setLastSale] = useState<{ id: number; total: string; at: number; live: boolean } | null>(null);
  const [reringArmed, setReringArmed] = useState(false);
  const [thriftSignupOpen, setThriftSignupOpen] = useState(false);
  // The one "Thrift+ member" button (owner 2026-10-20): Find, or the member's card. ``personId``: open on that card
  // (a pending join's QR was scanned, J8).
  const [memberDialog, setMemberDialog] = useState<{ open: boolean; personId: number | null }>({ open: false, personId: null });
  // After a member's sale with a 3-day-return item: the date to say (owner 2026-10-20).
  const [returnsPopup, setReturnsPopup] = useState<{ until: string; note: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openDrawerDialog, setOpenDrawerDialog] = useState(false);
  const [openingCount, setOpeningCount] = useState<DenominationBreakdown>(EMPTY_BREAKDOWN);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState({ quantity: '', description: '', unit_price: '' });
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  // A receipt that did not print (2026-10-21, REG-03): a box that stays until someone deals with it. For a cash sale
  // the drawer rode in the same print job, so it did not open either.
  const [printProblem, setPrintProblem] = useState<{ cart: Cart | null; message: string; drawerShut: boolean } | null>(
    null,
  );
  const [kicking, setKicking] = useState(false);
  // A tax-exempt sale to a non-profit (2026-10-21).
  const [taxExemptOpen, setTaxExemptOpen] = useState(false);
  const [taxExemptBusy, setTaxExemptBusy] = useState(false);
  const [taxExemptError, setTaxExemptError] = useState('');
  const [soldScanDialog, setSoldScanDialog] = useState<{
    itemId: number;
    sku?: string;
    title?: string;
  } | null>(null);
  const [laborDayConfirmOpen, setLaborDayConfirmOpen] = useState(false);
  const [summerDialogOpen, setSummerDialogOpen] = useState(false);
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
    // The test terminal's drawer is shared by every computer on /pos/test: pick up only this person's open cart.
    const restoreParams: Record<string, unknown> = { drawer: activeDrawerId, status: 'open' };
    if (testMode && user?.id != null) restoreParams.cashier = user.id;
    getCarts(restoreParams).then(({ data }) => {
      const openCarts = ((data as unknown as { results?: Cart[] })?.results ?? []) as Cart[];
      if (openCarts.length > 0) {
        setCart((prev) => prev ?? (openCarts[0] as Cart));
      }
    }).catch(() => {});
  }, [activeDrawerId, testMode, user?.id]);

  const terminalState = deriveTerminalState({
    config,
    isRegister,
    loading: drawerLoading,
    todayDrawer,
    cart,
    userId: user?.id,
    sharedDrawer: testMode,
  });

  const markRegisterActivity = useCallback(() => {
    if (registerId != null) writeLastActivity(registerId, new Date().toISOString());
  }, [registerId]);

  useEffect(() => {
    markRegisterActivity();
  }, [markRegisterActivity]);

  const createCartMutation = useCreateCart();
  const addItemMutation = useAddItemToCart();
  const addManualLineMutation = useAddManualLineToCart();
  const addAssemblyMutation = useAddAssemblyToCart();
  const setLineSaleMutation = useSetCartLineSale();
  const syncCartSaleMutation = useSyncCartSale();
  const { data: saleMode } = useSaleMode();
  const setLaborDayOverrideMutation = useSetLaborDayOverride();
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
  const { run: runWithManagerOk, dialog: managerOkDialog } = useManagerOk();
  const openDrawerMutation = useOpenDrawer();
  const openTrainingDrawerMutation = useOpenTrainingDrawer();
  const takeoverMutation = useDrawerTakeover();

  // The test terminal is always usable: no open practice drawer today means the server opens (or reopens) the
  // shared training drawer for whoever is here, with a zero count. Once per gap, never in a loop.
  const trainingOpenAskedRef = useRef(false);
  const needsTrainingDrawer = testMode && (terminalState === 'no_drawer' || terminalState === 'drawer_closed');
  const [trainingOpenError, setTrainingOpenError] = useState('');
  const openTrainingDrawerAsync = openTrainingDrawerMutation.mutateAsync;
  const askForTrainingDrawer = useCallback(
    (id: number) => {
      trainingOpenAskedRef.current = true;
      setTrainingOpenError('');
      openTrainingDrawerAsync(id).catch((err: unknown) => {
        setTrainingOpenError(
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            'Could not open the practice drawer.',
        );
      });
    },
    [openTrainingDrawerAsync],
  );
  useEffect(() => {
    if (!needsTrainingDrawer) {
      trainingOpenAskedRef.current = false;
      return;
    }
    if (registerId == null || trainingOpenAskedRef.current) return;
    askForTrainingDrawer(registerId);
  }, [needsTrainingDrawer, registerId, askForTrainingDrawer]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * The open cart, or the one being made. Every caller that needs a cart while one is on its way waits for that
   * same cart. On 2026-10-06 a slow server (right after a deploy) turned repeated scans into 3-4 carts holding the
   * same item, and voiding the extras put the sold item back on the shelf.
   */
  const startCart = useCallback(
    (drawerId: number): Promise<Cart> => {
      if (cartRef.current) return Promise.resolve(cartRef.current);
      if (!pendingCartRef.current) {
        pendingCartRef.current = createCartMutation
          .mutateAsync({ drawer: drawerId })
          .then((created) => {
            const next = created as unknown as Cart;
            cartRef.current = next;
            setCart(next);
            return next;
          })
          .finally(() => {
            pendingCartRef.current = null;
          });
      }
      return pendingCartRef.current;
    },
    [createCartMutation],
  );

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
      await startCart(targetDrawerId);
      markRegisterActivity();
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
  }, [isRegister, managerDrawerId, startCart, enqueueSnackbar, markRegisterActivity]);

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
    // The same scan again (Enter pressed twice, a re-scan) while the first is still on its way: the first one adds it.
    if (scanInFlightRef.current === input) return;
    scanInFlightRef.current = input;
    try {
      let activeCart = cart ?? cartRef.current;
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
          activeCart = await startCart(targetDrawerId);
          markRegisterActivity();
        } catch {
          enqueueSnackbar('Failed to create cart', { variant: 'error' });
          return;
        }
      }

      const cardCode = thriftCardCode(
        input,
        Boolean(activeCart.thrift_plus?.live || thriftStatus.data?.live || (reringArmed && lastSale?.live)),
      );
      if (cardCode) {
        try {
          if (reringArmed && lastSale) {
            const rerung = await reringThriftCard(lastSale.id, cardCode);
            setReringArmed(false);
            setLastSale(null);
            enqueueSnackbar(reringMessage(rerung.thrift_plus?.member?.name, rerung), { variant: 'success' });
          } else {
            const updated = await attachThriftCard(activeCart.id, cardCode);
            commitCart(updated, { scroll: false });
            enqueueSnackbar(`Thrift+ member: ${updated.thrift_plus?.member?.name ?? ''}`, { variant: 'info' });
          }
        } catch (err: unknown) {
          // Joined online and not finished (J8): open their card to Finalize instead of an error.
          const pending = pendingFromError(err);
          if (pending) setMemberDialog({ open: true, personId: pending.person_id });
          else enqueueSnackbar(thriftErrorMessage(err), { variant: 'error' });
        }
        setSkuInput('');
        skuInputRef.current?.focus();
        return;
      }

      try {
        const updated = await addItemMutation.mutateAsync({ cartId: activeCart.id, sku: input });
        commitCart(updated as unknown as Cart);
        const swapped = (updated as unknown as Cart).unit_swapped;
        if (swapped) {
          enqueueSnackbar(`${swapped.scanned_sku} was already used. Added the next unit, ${swapped.added_sku}.`, {
            variant: 'info',
          });
        }
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
    } finally {
      scanInFlightRef.current = '';
    }
  }, [
    cart,
    isRegister,
    managerDrawerId,
    skuInput,
    startCart,
    addItemMutation,
    commitCart,
    enqueueSnackbar,
    markRegisterActivity,
    reringArmed,
    lastSale,
    thriftStatus.data?.live,
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

  const handleConfirmLaborDayToggle = useCallback(async () => {
    const currentlyOn = Boolean(saleMode?.active);
    const today = format(new Date(), 'yyyy-MM-dd');
    const inWindow = Boolean(
      saleMode?.start && saleMode?.end && today >= saleMode.start && today <= saleMode.end,
    );
    const nextOverride: boolean | null = currentlyOn ? false : inWindow ? null : true;
    try {
      await setLaborDayOverrideMutation.mutateAsync(nextOverride);
      if (cart) {
        const updated = await syncCartSaleMutation.mutateAsync(cart.id);
        commitCart(updated as unknown as Cart, { scroll: false });
      }
      setLaborDayConfirmOpen(false);
    } catch {
      enqueueSnackbar(`Failed to update the ${saleMode?.name || 'Labor Day'} sale`, { variant: 'error' });
    }
  }, [
    saleMode,
    cart,
    setLaborDayOverrideMutation,
    syncCartSaleMutation,
    commitCart,
    enqueueSnackbar,
  ]);

  const handleSaveSummerLines = useCallback(
    async (changes: { lineId: number; sale: 'summer' | 'none' }[]) => {
      if (!cart) {
        setSummerDialogOpen(false);
        return;
      }
      try {
        let latest: Cart = cart;
        for (const change of changes) {
          latest = (await setLineSaleMutation.mutateAsync({
            cartId: cart.id,
            lineId: change.lineId,
            sale: change.sale,
          })) as unknown as Cart;
        }
        if (changes.length) commitCart(latest, { scroll: false });
        setSummerDialogOpen(false);
      } catch {
        enqueueSnackbar(`Failed to update the ${saleMode?.line_sale?.name || 'line'} sale`, { variant: 'error' });
      }
    },
    [cart, setLineSaleMutation, commitCart, enqueueSnackbar, saleMode?.line_sale?.name],
  );

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
          activeCart = await startCart(targetDrawerId);
          markRegisterActivity();
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
      startCart,
      addManualLineMutation,
      commitCart,
      enqueueSnackbar,
      markRegisterActivity,
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
      const created = await startCart(targetDrawerId);
      markRegisterActivity();
      return created;
    } catch {
      enqueueSnackbar('Failed to create cart', { variant: 'error' });
      return null;
    }
  }, [cart, isRegister, managerDrawerId, startCart, enqueueSnackbar, markRegisterActivity]);

  const handleAddAssembly = useCallback(async () => {
    const activeCart = await ensureOpenCart();
    if (!activeCart) return;
    try {
      const updated = await addAssemblyMutation.mutateAsync({ cartId: activeCart.id });
      commitCart(updated as unknown as Cart);
    } catch {
      enqueueSnackbar('Failed to add assembly', { variant: 'error' });
    }
  }, [ensureOpenCart, addAssemblyMutation, commitCart, enqueueSnackbar]);

  const handleOpenDiscountDialog = useCallback(() => {
    setDiscountDialogOpen(true);
  }, []);

  const handleSubmitDiscount = useCallback(
    async (payload: DiscountSubmitPayload) => {
      const activeCart = await ensureOpenCart();
      if (!activeCart) return;
      try {
        // Over the owner's cap (pos.discount_cap_percent) the server asks for a manager's PIN; the discount's own
        // reason is the why.
        const updated = await runWithManagerOk(
          (extra) => addDiscountMutation.mutateAsync({ cartId: activeCart.id, ...payload, ...extra }),
          { reason: payload.reason },
        );
        if (!updated) return;
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
    [ensureOpenCart, addDiscountMutation, commitCart, enqueueSnackbar, runWithManagerOk],
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
      // A changed price asks for a manager's PIN and a reason (2026-10-21); the same price sent back does not.
      const updated = await runWithManagerOk((extra) =>
        updateLineMutation.mutateAsync({
          cartId: cart.id,
          lineId: editingLineId,
          data: { quantity: newQty, description: editValues.description, unit_price: newPrice, ...extra },
        }),
      );
      if (!updated) return;
      commitCart(updated as unknown as Cart);
      setEditingLineId(null);
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      enqueueSnackbar(detail || 'Failed to update line', { variant: 'error' });
    }
  }, [cart, editingLineId, editValues, updateLineMutation, commitCart, enqueueSnackbar, runWithManagerOk]);

  const handleTaxExempt = async (input: TaxExemptInput | { off: true }) => {
    if (!cart) return;
    setTaxExemptBusy(true);
    setTaxExemptError('');
    try {
      const { data } = await setTaxExempt(cart.id, input);
      commitCart(data as unknown as Cart);
      setTaxExemptOpen(false);
      enqueueSnackbar('off' in input ? 'Tax is back on this sale' : 'Tax exempt sale: no tax', { variant: 'success' });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if ('off' in input) enqueueSnackbar(detail || 'Could not take tax exempt off', { variant: 'error' });
      else setTaxExemptError(detail || 'Could not make the sale tax exempt');
    } finally {
      setTaxExemptBusy(false);
    }
  };

  const handleToggleNoTax = useCallback(
    async (line: CartLine) => {
      if (!cart) return;
      try {
        const updated = await updateLineMutation.mutateAsync({
          cartId: cart.id,
          lineId: line.id,
          data: { tax_exempt: !line.tax_exempt },
        });
        commitCart(updated as unknown as Cart);
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        enqueueSnackbar(detail || 'Could not change the tax on that line', { variant: 'error' });
      }
    },
    [cart, updateLineMutation, commitCart, enqueueSnackbar],
  );

  const handleVoidSale = useCallback(async () => {
    if (!cart) return;
    setVoidConfirmOpen(false);
    try {
      // Every void needs a manager's PIN and a reason (2026-10-21), whoever is signed in.
      const voided = await runWithManagerOk((extra) => voidCartMutation.mutateAsync({ cartId: cart.id, ...extra }));
      if (!voided) return;
      enqueueSnackbar('Sale voided', { variant: 'info' });
      markRegisterActivity();
      setCart(null);
      cartRef.current = null;
      setCashTendered('');
      setPayrollEmployee('');
      setEditingLineId(null);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(detail || 'Failed to void sale', { variant: 'error' });
    }
  }, [cart, voidCartMutation, enqueueSnackbar, markRegisterActivity, runWithManagerOk]);

  /** The drawer this terminal rings on: today's drawer at a register, the picked drawer at a manager terminal. */
  const ringingDrawerId = (): number | undefined => {
    if (isRegister) {
      const live = todayDrawerRef.current;
      return typeof live?.id === 'number' ? live.id : undefined;
    }
    return typeof managerDrawerId === 'number' ? managerDrawerId : undefined;
  };

  /**
   * The Open drawer button (2026-10-21, REG-03): Dash logs who and when first, then the print server kicks the drawer.
   * `cartId` when it is for a sale whose receipt did not print.
   */
  const handleKickDrawer = async (cartId?: number, reason?: string) => {
    const drawerId = ringingDrawerId();
    if (drawerId === undefined) {
      enqueueSnackbar('Open a drawer first.', { variant: 'warning' });
      return;
    }
    setKicking(true);
    try {
      await logOpenDrawer(drawerId, { ...(cartId ? { cart: cartId } : {}), ...(reason ? { reason } : {}) });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(detail || 'Could not log the drawer opening, so it was not opened.', { variant: 'error' });
      setKicking(false);
      return;
    }
    try {
      await localPrintService.openCashDrawer();
      enqueueSnackbar('Drawer opened', { variant: 'info' });
      if (cartId) setPrintProblem(null);
    } catch (err) {
      setPrintProblem((prev) => ({
        cart: prev?.cart ?? null,
        message: printErrorMessage(err),
        drawerShut: true,
      }));
    } finally {
      setKicking(false);
    }
  };

  const handlePrintAgain = async () => {
    const problem = printProblem;
    if (!problem?.cart) return;
    setKicking(true);
    try {
      await localPrintService.printReceipt(buildReceiptData(problem.cart), problem.drawerShut);
      enqueueSnackbar(problem.drawerShut ? 'Receipt printed and the drawer opened' : 'Receipt printed', {
        variant: 'success',
      });
      setPrintProblem(null);
    } catch (err) {
      setPrintProblem({ ...problem, message: printErrorMessage(err) });
    } finally {
      setKicking(false);
    }
  };

  /** The sale in progress, made first when there is none (picking a Thrift+ member needs one). */
  const ensureSale = useCallback(async (): Promise<Cart | null> => {
    const current = cartRef.current;
    if (current) return current;
    const liveDrawer = todayDrawerRef.current;
    const targetDrawerId: number | undefined = isRegister
      ? (typeof liveDrawer?.id === 'number' ? liveDrawer.id : undefined)
      : typeof managerDrawerId === 'number'
        ? managerDrawerId
        : undefined;
    if (typeof targetDrawerId !== 'number') {
      enqueueSnackbar('Open a drawer first before starting a sale.', { variant: 'warning' });
      return null;
    }
    try {
      const made = await startCart(targetDrawerId);
      markRegisterActivity();
      return made;
    } catch {
      enqueueSnackbar('Failed to create cart', { variant: 'error' });
      return null;
    }
  }, [isRegister, managerDrawerId, startCart, enqueueSnackbar, markRegisterActivity]);

  /** Refresh (owner 2026-10-20): the sale from the server, with the Thrift+ member's ThriftBucks, credit and status of now. */
  const handleRefresh = useCallback(async () => {
    const current = cartRef.current;
    if (!current) return;
    setRefreshing(true);
    try {
      commitCart(await refreshCart(current.id), { scroll: false });
      enqueueSnackbar('Sale refreshed', { variant: 'info' });
    } catch (err: unknown) {
      enqueueSnackbar(thriftErrorMessage(err, 'Could not refresh the sale.'), { variant: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, [commitCart, enqueueSnackbar]);

  /** Suspend (owner 2026-10-20): put another sale on screen (null = empty, the next scan starts a new one). */
  const swapCart = useCallback(
    (next: Cart | null) => {
      pendingScrollLineIdRef.current = null;
      cartRef.current = next;
      setCart(next);
      setCashTendered('');
      setPayrollEmployee('');
      setEditingLineId(null);
      markRegisterActivity();
    },
    [markRegisterActivity],
  );

  const finishCompletedSale = useCallback(
    async (
      completedCart: Cart,
      method: PaymentMethod,
    ) => {
      const practice = completedCart.status === 'training';
      enqueueSnackbar(practice ? 'Practice sale done. Nothing was sold.' : 'Sale completed', {
        variant: 'success',
      });
      markRegisterActivity();

      // A practice sale never opens the cash drawer: no money changes hands.
      const shouldOpenDrawer = !practice && (method === 'cash' || method === 'split');
      try {
        const printed = await localPrintService.printReceipt(
          buildReceiptData(completedCart),
          shouldOpenDrawer,
        );
        if (shouldOpenDrawer && printed.drawer_opened === false) {
          setPrintProblem({
            cart: completedCart,
            message: 'The receipt printed, but the cash drawer did not open.',
            drawerShut: true,
          });
        }
      } catch (err) {
        // Loud, and it stays (2026-10-21, REG-03): never a quiet "sent".
        const message = printErrorMessage(err);
        setPrintProblem({ cart: completedCart, message, drawerShut: shouldOpenDrawer });
        if (!practice) void logPrintFailed(completedCart.id, message).catch(() => undefined);
      }

      // Owner 2026-10-20: a member's sale with a 3-day-return item ends with the date to say, tapped through.
      const returnsUntil = completedCart.thrift_plus?.member ? completedCart.thrift_plus.returns_until : undefined;
      if (returnsUntil) setReturnsPopup({ until: returnsUntil, note: completedCart.thrift_plus?.return_note ?? '' });
      setLastSale({
        id: completedCart.id,
        total: completedCart.total,
        at: Date.now(),
        live: Boolean(completedCart.thrift_plus?.live) && !practice,
      });
      setReringArmed(false);
      setCart(null);
      cartRef.current = null;
      setCashTendered('');
      setPayrollEmployee('');
      setCardTenderOpen(false);
      setCardPreview(null);
    },
    [enqueueSnackbar, markRegisterActivity],
  );

  const sendComplete = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!cart || completingRef.current) return;
      completingRef.current = true;
      try {
        const completedCart = (await completeCartMutation.mutateAsync({
          cartId: cart.id,
          data: payload,
        })) as unknown as Cart;
        await finishCompletedSale(completedCart, payload.payment_method as PaymentMethod);
      } catch (err: unknown) {
        const detail =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : undefined;
        enqueueSnackbar(detail || 'Failed to complete sale', { variant: 'error' });
      } finally {
        completingRef.current = false;
      }
    },
    [cart, completeCartMutation, enqueueSnackbar, finishCompletedSale],
  );

  // On the training register every payment stops at the "THIS IS JUST A TEST" screen first.
  const postComplete = useCallback(
    async (payload: Record<string, unknown>) => {
      if (todayDrawerRef.current?.register_is_training) {
        setTrainingPayload(payload);
        return;
      }
      await sendComplete(payload);
    },
    [sendComplete],
  );

  const handleComplete = useCallback(async () => {
    if (!cart || (cart.lines ?? []).length === 0) {
      enqueueSnackbar('Add at least one item before completing the sale.', { variant: 'warning' });
      return;
    }
    // Thrift+ pays it all (Bill, 2026-10-21): nothing to take, no cash or card step, the drawer stays shut.
    if (thriftCoversSale(cart)) {
      await postComplete({ payment_method: 'thrift' });
      return;
    }
    const total = amountDue(cart);
    const cash = parseFloat(cashTendered) || 0;
    const cardDue =
      paymentMethod === 'split' ? moneyCents(Math.max(0, total - cash)) : total;

    if (paymentMethod === 'cash' && cash < total) {
      enqueueSnackbar('Cash tendered is less than total', { variant: 'error' });
      return;
    }
    if (paymentMethod === 'split') {
      if (!cashTendered.trim()) {
        enqueueSnackbar('Enter the cash portion first.', { variant: 'error' });
        return;
      }
      if (cash >= total) {
        enqueueSnackbar('Cash covers the total - switch to Cash.', { variant: 'error' });
        return;
      }
    }

    if (paymentMethod === 'payroll') {
      if (payrollEmployee === '') {
        enqueueSnackbar('Pick the staff member who is buying.', { variant: 'error' });
        return;
      }
      await postComplete({ payment_method: 'payroll', payroll_employee: payrollEmployee });
      return;
    }

    const payload: Record<string, unknown> = { payment_method: paymentMethod };
    if (paymentMethod === 'cash' || paymentMethod === 'split')
      payload.cash_tendered = cashTendered ? parseFloat(cashTendered) : 0;
    if (paymentMethod === 'card' || paymentMethod === 'split')
      payload.card_amount = cardDue;

    if (paymentMethod === 'cash') {
      await postComplete(payload);
      return;
    }

    // Training register (C1): the "THIS IS JUST A TEST" screen comes first and no card step ever opens, so a
    // trainee is never asked to run a real card. The practice sale is recorded as a debit card with no surcharge.
    if (!needsCardTender(paymentMethod, Boolean(todayDrawerRef.current?.register_is_training))) {
      await postComplete(practiceCardPayload(payload));
      return;
    }

    try {
      const { data: preview } = await getCartCardPreview(cart.id, {
        payment_method: paymentMethod,
        card_amount: payload.card_amount as number,
      });
      if (!preview.enabled) {
        await postComplete({
          ...payload,
          card_type: 'debit',
          card_charged_total: preview.no_surcharge,
        });
        return;
      }
      setCardPreview(preview);
      setCardTenderOpen(true);
    } catch {
      enqueueSnackbar('Could not load card totals from the server.', { variant: 'error' });
    }
  }, [cart, paymentMethod, cashTendered, payrollEmployee, postComplete, enqueueSnackbar]);

  // Thrift+ credit and/or ThriftBucks leave nothing due (Bill, 2026-10-21): one button, no cash or card step.
  const thriftCovers = thriftCoversSale(cart);

  const changeDue = (() => {
    if (paymentMethod !== 'cash' && paymentMethod !== 'split') return 0;
    const total = amountDue(cart);
    return Math.max(0, (parseFloat(cashTendered) || 0) - total);
  })();

  // ── State panels ───────────────────────────────────────────────────────────

  const renderContent = () => {
    if (needsTrainingDrawer) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          {trainingOpenError ? (
            <Alert
              severity="error"
              sx={{ maxWidth: 560 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    if (registerId != null) askForTrainingDrawer(registerId);
                  }}
                >
                  Try again
                </Button>
              }
            >
              {trainingOpenError}
            </Alert>
          ) : (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={22} />
              <Typography>Opening the practice drawer…</Typography>
            </Stack>
          )}
        </Box>
      );
    }
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
                    {thriftLive && (
                      <Button
                        size="small"
                        variant="outlined"
                        color={cart?.thrift_plus?.member ? 'success' : 'primary'}
                        onClick={() => setMemberDialog({ open: true, personId: null })}
                        data-testid="thrift-member-button"
                      >
                        Thrift+ member
                      </Button>
                    )}
                    {cart && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Refresh />}
                        onClick={() => void handleRefresh()}
                        disabled={refreshing}
                        data-testid="cart-refresh"
                      >
                        Refresh
                      </Button>
                    )}
                    {cart && !cart.tax_exempt_at && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setTaxExemptError('');
                          setTaxExemptOpen(true);
                        }}
                        data-testid="tax-exempt-button"
                      >
                        Tax exempt sale
                      </Button>
                    )}
                    {!todayDrawer?.register_is_training && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => void handleKickDrawer(undefined, 'Open drawer button')}
                        disabled={kicking}
                        data-testid="open-cash-drawer"
                      >
                        Open drawer
                      </Button>
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
                              // The Thrift+ ThriftBucks line belongs to the server's sync: no edit, no delete.
                              isBucksLine(cart, line) ? undefined : (
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
                              )
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
                                    isBucksLine(cart, line)
                                      ? <Chip size="small" label="Thrift+" color="success" sx={{ height: 22 }} />
                                      : <Chip size="small" label="Discount" color="warning" sx={{ height: 22 }} />
                                  )}
                                  {line.line_kind === 'delivery' && (
                                    <Chip size="small" label="Delivery" color="info" sx={{ height: 22 }} />
                                  )}
                                  {line.line_kind === 'assembly' && (
                                    <Chip size="small" label="Assembly" color="secondary" sx={{ height: 22 }} />
                                  )}
                                  {(line.line_kind === 'manual' ||
                                    (line.item == null &&
                                      line.line_kind !== 'discount' &&
                                      line.line_kind !== 'delivery' &&
                                      line.line_kind !== 'assembly')) && (
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
                                  {line.sale_label === 'labor_day' && Number(line.sale_percent) > 0 && (
                                    <Chip
                                      size="small"
                                      color="warning"
                                      label={line.sale_display || `${Number(line.sale_percent)}% Labor Day`}
                                      sx={{ height: 22 }}
                                    />
                                  )}
                                  {line.sale_label === 'summer' && (
                                    <Chip
                                      size="small"
                                      color="success"
                                      label={line.sale_display || `${Number(line.sale_percent || 50)}% Summer`}
                                      sx={{ height: 22 }}
                                    />
                                  )}
                                  {line.line_kind !== 'discount' && (
                                    // "No tax" (Bill, 2026-10-21: pop): one tap, no PIN; the rest of the sale is taxed.
                                    <Chip
                                      size="small"
                                      label="No tax"
                                      color={line.tax_exempt ? 'warning' : 'default'}
                                      variant={line.tax_exempt ? 'filled' : 'outlined'}
                                      onClick={() => void handleToggleNoTax(line)}
                                      aria-pressed={Boolean(line.tax_exempt)}
                                      data-testid={`no-tax-${line.id}`}
                                      sx={{ height: 22, opacity: line.tax_exempt ? 1 : 0.7 }}
                                    />
                                  )}
                                </Box>
                              }
                              secondary={
                                isBucksLine(cart, line)
                                  ? 'Kept ThriftBucks, taken off before tax'
                                  : line.line_kind === 'delivery' && line.meta
                                  ? `${line.quantity} × ${formatCurrency(line.unit_price)} · ${String(line.meta.phone ?? '')} · ${String(line.meta.address ?? '')}${line.meta.is_apt ? ` Apt ${String(line.meta.unit ?? '')}` : ''}`
                                  : Number(line.thrift_savings) > 0
                                    ? `${line.quantity} × ${formatCurrency(line.unit_price)} → ${formatCurrency(line.line_total)} (redeemed instantly −${formatCurrency(line.thrift_savings ?? 0)})`
                                    : Number(line.sale_percent) > 0
                                      ? `${line.quantity} × ${formatCurrency(line.unit_price)} → ${formatCurrency(line.line_total)}`
                                      : `${line.quantity} × ${formatCurrency(line.unit_price)}`
                              }
                              slotProps={{ primary: { component: 'div' } }}
                            />
                            {isBucksLine(cart, line) ? (
                              // ThriftBucks are a number next to the word, never "$" (V8).
                              <Typography variant="body2" sx={{ ml: 1, mr: 6 }}>
                                <TbAmount value={line.line_total} sign="-" />
                              </Typography>
                            ) : (
                              <Typography variant="body2" sx={{ ml: 1, mr: 6 }}>
                                {formatCurrency(line.line_total)}
                              </Typography>
                            )}
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
                    {saleSavings(cart) > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography color="success.main">Sale savings</Typography>
                        <Typography color="success.main">
                          −
                          {formatCurrency(saleSavings(cart))}
                        </Typography>
                      </Box>
                    )}
                    {instantOffOnLines(cart) > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography color="success.main">Redeemed instantly</Typography>
                        <Typography color="success.main">−{formatCurrency(instantOffOnLines(cart))}</Typography>
                      </Box>
                    )}
                    {bucksUsed(cart) > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography color="success.main">ThriftBucks used</Typography>
                        <Typography color="success.main">{tbNumber(bucksUsed(cart))}</Typography>
                      </Box>
                    )}
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
                    {creditUsed(cart) > 0 && (
                      <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography color="success.main">Thrift+ credit</Typography>
                          <Typography color="success.main">−{formatCurrency(creditUsed(cart))}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontWeight={700}>Due</Typography>
                          <Typography fontWeight={700}>{formatCurrency(amountDue(cart))}</Typography>
                        </Box>
                      </>
                    )}
                  </Stack>
                </Box>
              </Paper>
            </Grid>

            {/* Scan + payment panel */}
            <Grid
              size={{ xs: 12, md: 5 }}
              sx={{ minHeight: 0, display: 'flex', flexDirection: 'column', height: { md: '100%' } }}
            >
              {cart?.thrift_plus ? (
                <ThriftPlusPanel
                  cart={cart}
                  onCart={(next) => commitCart(next, { scroll: false })}
                  onOpenCard={() => setMemberDialog({ open: true, personId: null })}
                />
              ) : null}
              {!cart?.thrift_plus?.member && lastSale?.live && Date.now() - lastSale.at < RERING_WINDOW_MS ? (
                <Paper variant="outlined" sx={{ p: 1.5, mb: 2, flexShrink: 0 }}>
                  <Typography variant="body2">
                    {reringArmed
                      ? `Scan the QR in the member's Thrift+ app, or find them by phone, to re-ring the last sale (${formatCurrency(lastSale.total)}).`
                      : `Signed up after paying? Re-ring the last sale (${formatCurrency(lastSale.total)}) as a member.`}
                  </Typography>
                  {reringArmed ? (
                    <Box sx={{ mt: 1 }}>
                      <ThriftPlusPhoneFind
                        onPick={async (person) => {
                          try {
                            const rerung = await reringThriftMember(lastSale.id, person.person_id);
                            setReringArmed(false);
                            setLastSale(null);
                            enqueueSnackbar(reringMessage(rerung.thrift_plus?.member?.name, rerung), { variant: 'success' });
                          } catch (err: unknown) {
                            enqueueSnackbar(thriftErrorMessage(err), { variant: 'error' });
                          }
                        }}
                      />
                    </Box>
                  ) : null}
                  <Button
                    size="small"
                    sx={{ mt: 0.5 }}
                    onClick={() => {
                      setReringArmed((v) => !v);
                      skuInputRef.current?.focus();
                    }}
                  >
                    {reringArmed ? 'Cancel re-ring' : 'Re-ring as a member'}
                  </Button>
                </Paper>
              ) : null}
              <Paper sx={{ p: 2, mb: 2, flexShrink: 0 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Add item
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                  <TextField
                    inputRef={skuInputRef}
                    fullWidth
                    size="small"
                    placeholder={thriftLive ? 'Scan a SKU or a Thrift+ member QR' : 'Scan or type SKU'}
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
                    onClick={handleAddAssembly}
                    disabled={addAssemblyMutation.isPending}
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
                      borderColor: 'secondary.light',
                      bgcolor: 'rgba(123, 31, 162, 0.08)',
                      color: 'secondary.dark',
                      '&:hover': {
                        bgcolor: 'rgba(123, 31, 162, 0.16)',
                        borderColor: 'secondary.main',
                      },
                    }}
                  >
                    <Build sx={{ fontSize: 28 }} />
                    <Typography variant="subtitle2" fontWeight={700} lineHeight={1.15}>
                      Assembly
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.85, lineHeight: 1.1 }}>
                      $35
                    </Typography>
                  </Button>

                  {/* The line sale (was the always-on Summer 50% tile): only while the owner has it on (REG-21). */}
                  {saleMode?.line_sale?.on ? (
                  <Button
                    onClick={() => setSummerDialogOpen(true)}
                    disabled={!cart || setLineSaleMutation.isPending}
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
                      borderColor: 'success.light',
                      bgcolor: 'rgba(46, 125, 50, 0.08)',
                      color: 'success.dark',
                      '&:hover': {
                        bgcolor: 'rgba(46, 125, 50, 0.16)',
                        borderColor: 'success.main',
                      },
                    }}
                  >
                    <WbSunny sx={{ fontSize: 28 }} />
                    <Typography variant="subtitle2" fontWeight={700} lineHeight={1.15}>
                      {saleMode.line_sale.name}
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.85, lineHeight: 1.1 }}>
                      {Number(saleMode.line_sale.percent)}% off
                    </Typography>
                  </Button>
                  ) : null}

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
                {cart?.tax_exempt_at && (
                  <Alert
                    severity="info"
                    sx={{ mb: 1 }}
                    data-testid="tax-exempt-banner"
                    action={
                      <Button color="inherit" size="small" disabled={taxExemptBusy} onClick={() => void handleTaxExempt({ off: true })}>
                        Remove
                      </Button>
                    }
                  >
                    <Typography fontWeight={700}>{taxExemptText(cart)}</Typography>
                    <Typography variant="body2">No tax on this sale.</Typography>
                  </Alert>
                )}
                {thriftCovers ? (
                  <Alert severity="success" icon={false} sx={{ mb: 1 }}>
                    <Typography fontWeight={700}>Nothing to pay: Thrift+ covers this sale.</Typography>
                    <Typography variant="body2">{thriftPaymentParts(cart).join(' · ')}</Typography>
                  </Alert>
                ) : (
                <>
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
                    {(payrollOn || paymentMethod === 'payroll') && (
                      <MenuItem value="payroll">Payroll deduction (staff)</MenuItem>
                    )}
                  </Select>
                </FormControl>
                {paymentMethod === 'payroll' && (
                  <PayrollPicker amount={amountDue(cart)} value={payrollEmployee} onChange={setPayrollEmployee} />
                )}

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
                {paymentMethod === 'split' && (
                  <Typography variant="body2" fontWeight={600} sx={{ mb: 2 }}>
                    Card: {formatCurrency(moneyCents(Math.max(0, amountDue(cart) - (parseFloat(cashTendered) || 0))))}
                  </Typography>
                )}
                </>
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
                  {completeCartMutation.isPending
                    ? 'Processing…'
                    : thriftCovers
                      ? 'Complete: paid with Thrift+'
                      : 'Complete sale'}
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
      {(testMode || todayDrawer?.register_is_training) && <TrainingBanner />}
      <PageHeader
        dense
        title={
          testMode
            ? TEST_TERMINAL_TITLE
            : todayDrawer?.register_is_training
              ? 'Training Terminal'
              : 'POS Terminal'
        }
        subtitle={
          testMode
            ? `Training Terminal · ${deviceLabel} · this computer's own register setup is not changed`
            : deviceLabel
        }
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* The Labor Day sale is retired (owner 2026-10-16): the chip shows only while a sale is actually on, so it
                can be turned off, never on by accident. */}
            {/* Only the owner turns it off (REG-21); everyone else sees it. */}
            {saleMode?.active && (
            <Chip
              size="small"
              clickable={isOwner}
              onClick={isOwner ? () => setLaborDayConfirmOpen(true) : undefined}
              label={`${saleMode.name || 'Labor Day'} Sale · ${Number(saleMode.percent || 10)}% off`}
              color="warning"
              variant="filled"
              title={isOwner ? 'Click to turn off' : 'The owner turns this sale on and off'}
            />
            )}
            <Chip
              size="small"
              label={printStatus.online ? 'Print server online' : 'Print server offline'}
              color={printStatus.online ? 'success' : 'default'}
              variant="outlined"
            />
            {/* The test terminal has no device setup: it is always TRAIN and leaves this computer's setup alone. */}
            {!testMode && (
            <Tooltip title={config ? 'Change device configuration' : 'Configure this device'}>
              <IconButton
                size="small"
                onClick={() => setDeviceSetupOpen(true)}
                color={config ? 'default' : 'warning'}
              >
                <Settings />
              </IconButton>
            </Tooltip>
            )}
          </Box>
        }
      />

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {(terminalState === 'ready' || terminalState === 'active_sale') && (
          <SuspendedSalesBar
            drawerId={cart?.drawer ?? todayDrawer?.id}
            cashierId={testMode ? user?.id : undefined}
            cart={cart}
            disabled={createCartMutation.isPending || completeCartMutation.isPending || cardTenderOpen}
            onSuspended={() => swapCart(null)}
            onResumed={(fresh) => swapCart(fresh)}
          />
        )}
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

      <SummerLinesDialog
        open={summerDialogOpen}
        name={saleMode?.line_sale?.name ?? 'Summer'}
        percent={Number(saleMode?.line_sale?.percent ?? 50)}
        cart={cart}
        pending={setLineSaleMutation.isPending}
        onClose={() => setSummerDialogOpen(false)}
        onSave={handleSaveSummerLines}
      />

      <ConfirmDialog
        open={laborDayConfirmOpen}
        title={`Turn ${saleMode?.name || 'Labor Day'} sale ${saleMode?.active ? 'off' : 'on'}?`}
        message={
          saleMode?.active
            ? `Merchandise lines will return to list price. Lines marked ${saleMode?.line_sale?.name || 'Summer'} keep their sale. Assembly and Delivery stay full price.`
            : `Eligible merchandise will be ${Number(saleMode?.percent || 10)}% off. Assembly and Delivery stay full price.`
        }
        confirmLabel={saleMode?.active ? 'Turn off' : 'Turn on'}
        severity="info"
        confirmColor="warning"
        onConfirm={handleConfirmLaborDayToggle}
        onCancel={() => setLaborDayConfirmOpen(false)}
        loading={setLaborDayOverrideMutation.isPending || syncCartSaleMutation.isPending}
      />

      {managerOkDialog}

      <TaxExemptDialog
        open={taxExemptOpen}
        pending={taxExemptBusy}
        error={taxExemptError}
        onSubmit={(input) => void handleTaxExempt(input)}
        onCancel={() => setTaxExemptOpen(false)}
      />

      {/* A receipt that did not print (REG-03): loud, and it stays until someone deals with it. */}
      <Dialog open={printProblem !== null} maxWidth="xs" fullWidth data-testid="print-problem">
        <DialogTitle sx={{ color: 'error.main', fontWeight: 800 }}>
          {printProblem?.message.startsWith('The receipt printed') ? 'The drawer did not open' : 'Receipt did not print'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Alert severity="error">{printProblem?.message}</Alert>
            {printProblem?.drawerShut && (
              <Typography fontWeight={700}>
                The cash drawer did not open. Use Open drawer to take the cash and give change.
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              The sale is finished and saved. Reprints later from Transactions say COPY.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={() => setPrintProblem(null)} disabled={kicking}>Close</Button>
          {printProblem?.drawerShut && (
            <Button
              variant="outlined"
              onClick={() => void handleKickDrawer(printProblem?.cart?.id, 'Receipt did not print')}
              disabled={kicking}
            >
              Open drawer
            </Button>
          )}
          {printProblem?.cart && (
            <Button variant="contained" onClick={() => void handlePrintAgain()} disabled={kicking}>
              Print again
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Void sale confirmation */}
      <ConfirmDialog
        open={voidConfirmOpen}
        title="Void this sale?"
        message="The sale is kept as voided and its items stay free for the next sale. A manager's PIN and a reason come next. This cannot be undone."
        confirmLabel="Void sale"
        severity="error"
        onConfirm={handleVoidSale}
        onCancel={() => setVoidConfirmOpen(false)}
        loading={voidCartMutation.isPending}
      />

      <ThriftMemberDialog
        open={memberDialog.open}
        personId={memberDialog.personId}
        onClose={() => {
          setMemberDialog({ open: false, personId: null });
          skuInputRef.current?.focus();
        }}
        cart={cart}
        ensureCart={ensureSale}
        onCart={(next) => commitCart(next, { scroll: false })}
        onPracticeSignup={
          todayDrawer?.register_is_training
            ? () => {
                setMemberDialog({ open: false, personId: null });
                setThriftSignupOpen(true);
              }
            : undefined
        }
      />
      <ThriftPlusSignupDialog
        open={thriftSignupOpen}
        onClose={() => {
          setThriftSignupOpen(false);
          skuInputRef.current?.focus();
        }}
        cart={cart}
        lastSale={lastSale?.live && Date.now() - lastSale.at < RERING_WINDOW_MS ? lastSale : null}
        onCart={(next) => commitCart(next, { scroll: false })}
        training={Boolean(todayDrawer?.register_is_training)}
        onFinishJoin={(person) => setMemberDialog({ open: true, personId: person.person_id })}
      />
      <ReturnsPopup
        until={returnsPopup?.until ?? null}
        note={returnsPopup?.note}
        onClose={() => {
          setReturnsPopup(null);
          skuInputRef.current?.focus();
        }}
      />

      <CardTenderDialog
        open={cardTenderOpen}
        preview={cardPreview}
        pending={completeCartMutation.isPending}
        onCancel={() => {
          setCardTenderOpen(false);
          setCardPreview(null);
        }}
        onConfirm={({ card_type, card_charged_total }) => {
          const total = amountDue(cart);
          const payload: Record<string, unknown> = { payment_method: paymentMethod };
          if (paymentMethod === 'cash' || paymentMethod === 'split') {
            payload.cash_tendered = cashTendered ? parseFloat(cashTendered) : 0;
          }
          if (paymentMethod === 'card' || paymentMethod === 'split') {
            const cash = parseFloat(cashTendered) || 0;
            payload.card_amount =
              paymentMethod === 'split' ? moneyCents(Math.max(0, total - cash)) : total;
          }
          void postComplete({ ...payload, card_type, card_charged_total });
        }}
      />

      <TrainingPaymentDialog
        open={trainingPayload !== null}
        onBack={() => setTrainingPayload(null)}
        onFinish={() => {
          const payload = trainingPayload;
          setTrainingPayload(null);
          if (payload) void sendComplete(payload);
        }}
      />

      {/* Device setup dialog - always available so users can reconfigure at any time (not on the test terminal) */}
      {!testMode && (
        <DeviceSetupDialog
          open={deviceSetupOpen}
          onClose={() => setDeviceSetupOpen(false)}
          onSaved={() => setDeviceSetupOpen(false)}
        />
      )}

      {/* The idle work-cycle prompt starts a real routine: not on the practice terminal. */}
      {!testMode && (
        <WorkCyclePromptDialog
          terminalState={terminalState}
          registerId={registerId}
        />
      )}
    </Box>
  );
}
