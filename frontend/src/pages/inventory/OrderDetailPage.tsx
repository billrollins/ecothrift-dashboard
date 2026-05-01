import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChevronRight from '@mui/icons-material/ChevronRight';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import ExpandMore from '@mui/icons-material/ExpandMore';
import UploadFile from '@mui/icons-material/UploadFile';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import InlineEditableValue from '../../components/inventory/orderDetail/InlineEditableValue';
import { PO_CONDITION_OPTIONS } from '../../constants/purchaseOrderCondition';
import { formatCurrencyWhole, formatNumber } from '../../utils/format';
import { updateOrder } from '../../api/inventory.api';
import {
  useOrderDeletePreview,
  usePurgeDeleteOrder,
  usePurchaseOrder,
  useRemoveManifest,
  useUploadManifest,
} from '../../hooks/useInventory';
import type { OrderDeletePreviewResponse } from '../../api/inventory.api';
import type { PurchaseOrder } from '../../types/inventory.types';

function inventoryUploadDetail(err: unknown): string {
  const ax = err as { response?: { data?: { detail?: unknown } } };
  const d = ax.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) {
    return d.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
  }
  return 'Manifest upload failed';
}

function focusIsInEditableField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(el.isContentEditable);
}

function deriveLifecycleStatus(
  o: Pick<PurchaseOrder, 'delivered_date' | 'shipped_date' | 'paid_date'>,
): 'ordered' | 'paid' | 'shipped' | 'delivered' {
  if (o.delivered_date) return 'delivered';
  if (o.shipped_date) return 'shipped';
  if (o.paid_date) return 'paid';
  return 'ordered';
}

function parseMoney(n: string | null | undefined): number {
  if (n == null || n === '') return 0;
  const x = Number.parseFloat(n);
  return Number.isFinite(x) ? x : 0;
}

function marginPct(retail: number, totalCost: number): number | null {
  if (!(retail > 0) || !(totalCost >= 0)) return null;
  return ((retail - totalCost) / retail) * 100;
}

function manifestCategoryDistinctCount(order: PurchaseOrder): string {
  const preview = order.manifest_preview;
  if (!preview?.headers?.length || !preview.rows?.length) return '—';
  const lowered = preview.headers.map((h) => String(h).toLowerCase());
  const idx = lowered.findIndex((h) => h.includes('category') || h.includes('department') || h.includes('class'));
  if (idx < 0) return '—';
  const key = preview.headers[idx];
  const vals = new Set<string>();
  for (const r of preview.rows) {
    const raw = r.raw as Record<string, string>;
    const v = raw[key];
    if (v != null && String(v).trim()) vals.add(String(v).trim());
  }
  return vals.size ? formatNumber(vals.size) : '—';
}

const STATUS_STYLE: Record<
  string,
  { bg: string; color: string }
> = {
  ordered: { bg: '#f1f5f9', color: '#475569' },
  paid: { bg: '#fef9c3', color: '#854d0e' },
  shipped: { bg: '#dbeafe', color: '#1e40af' },
  delivered: { bg: '#d1fae5', color: '#065f46' },
  processing: { bg: '#ede9fe', color: '#5b21b6' },
  complete: { bg: '#d1fae5', color: '#065f46' },
  cancelled: { bg: '#fee2e2', color: '#991b1b' },
};

function CheckFilled() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#10b981" />
      <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CircleEmpty() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.5" stroke="#d1d5db" strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  );
}

function headerBadge(order: PurchaseOrder): { label: string; style: { bg: string; color: string } } {
  if (order.status === 'cancelled') return { label: 'CANCELLED', style: STATUS_STYLE.cancelled };
  if (order.status === 'processing') return { label: 'PROCESSING', style: STATUS_STYLE.processing };
  if (order.status === 'complete') return { label: 'COMPLETE', style: STATUS_STYLE.complete };
  const d = deriveLifecycleStatus(order);
  return {
    label: d.toUpperCase(),
    style: STATUS_STYLE[d],
  };
}

/** Visual tokens copied from `order-detail-v2.jsx` mock — single source for parity */
const TOKENS = {
  pageBg: '#eef1f5',
  borderCard: '#dde2e9',
  borderInner: '#eef0f4',
  borderRow: '#f5f6f8',
  textPrimary: '#0f172a',
  textBody: '#1e293b',
  textMuted: '#64748b',
  textSoft: '#94a3b8',
  textPlaceholder: '#c4c9d1',
  textDisabledRow: '#a1a8b4',
  insetBg: '#f4f6f9',
  shellMaxW: 1400,
  topBarH: 52,
  shellPt: 32,
  shellPx: 36,
  shellPb: 60,
  headerMb: 12,
  radiusCard: 12,
  radiusBtn: 10,
  radiusPill: 5,
  radiusSmall: 6,
  sectionHeaderPx: 24,
  sectionHeaderPt: 18,
  sectionHeaderPb: 14,
  lifecycleBodyPt: 8,
  lifecycleBodyPb: 20,
  panelBodyPt: 16,
  panelBodyPb: 20,
  bottomBarMt: 20,
  bottomBarGap: 12,
  btnPadY: 14,
  btnPadXPrimary: 20,
  btnPadXDelete: 16,
} as const;

const S = {
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700 as const,
    color: TOKENS.textBody,
    letterSpacing: '-0.01em',
  },
  fieldLabel: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600 as const,
    color: TOKENS.textSoft,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
};

function ArrowLeftIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export default function OrderDetailPage() {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down(900));
  const { id } = useParams<{ id: string }>();
  const orderId = id ? Number.parseInt(id, 10) : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data: order, isLoading } = usePurchaseOrder(orderId);
  const orderDeletePreview = useOrderDeletePreview();
  const purgeDeleteOrder = usePurgeDeleteOrder();
  const uploadManifestMutation = useUploadManifest();
  const removeManifestMutation = useRemoveManifest();

  const manifestInputRef = useRef<HTMLInputElement>(null);
  const manifestDropDepth = useRef(0);
  const [manifestDropOver, setManifestDropOver] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletePreview, setDeletePreview] = useState<OrderDeletePreviewResponse | null>(null);

  const pendingRef = useRef<Record<string, unknown>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [successFlashKey, setSuccessFlashKey] = useState<string | null>(null);
  const [errorFlashKey, setErrorFlashKey] = useState<string | null>(null);

  const flushPatch = useCallback(async () => {
    if (orderId == null) return;
    const payload = { ...pendingRef.current };
    pendingRef.current = {};
    const keys = Object.keys(payload);
    if (keys.length === 0) return;

    const lifecycleKeys = [
      'ordered_date',
      'paid_date',
      'shipped_date',
      'expected_delivery',
      'delivered_date',
    ] as const;

    const base = queryClient.getQueryData<PurchaseOrder>(['purchaseOrders', orderId]);
    if (!base) return;

    const merged: PurchaseOrder = { ...base };
    let touchesLifecycle = false;
    for (const k of lifecycleKeys) {
      if (Object.prototype.hasOwnProperty.call(payload, k)) {
        touchesLifecycle = true;
        (merged as unknown as Record<string, unknown>)[k] = payload[k];
      }
    }

    const lifecycleEligible = ['ordered', 'paid', 'shipped', 'delivered'].includes(base.status);
    if (touchesLifecycle && lifecycleEligible) {
      payload.status = deriveLifecycleStatus({
        delivered_date: merged.delivered_date,
        shipped_date: merged.shipped_date,
        paid_date: merged.paid_date,
      });
    }

    try {
      const { data: updated } = await updateOrder(orderId, payload);
      queryClient.setQueryData(['purchaseOrders', orderId], updated);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'], exact: false });
      setSuccessFlashKey(keys.join(','));
      window.setTimeout(() => setSuccessFlashKey(null), 600);
    } catch (e) {
      console.error(e);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', orderId] });
      setErrorFlashKey(keys.join(','));
      window.setTimeout(() => setErrorFlashKey(null), 600);
    }
  }, [orderId, queryClient]);

  const queuePatch = useCallback(
    (partial: Record<string, unknown>) => {
      Object.assign(pendingRef.current, partial);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void flushPatch();
      }, 500);
    },
    [flushPatch],
  );

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'n') return;
      if (focusIsInEditableField()) return;
      e.preventDefault();
      navigate('/inventory/orders', { state: { openCreatePo: true } });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (focusIsInEditableField()) return;
      navigate('/inventory/orders');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  const uploadManifestFile = async (file: File | undefined) => {
    if (!file || !orderId || !order) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.tsv')) return;
    try {
      const updated = await uploadManifestMutation.mutateAsync({ orderId, file });
      queryClient.setQueryData(['purchaseOrders', orderId], updated as PurchaseOrder);
    } catch (err) {
      enqueueSnackbar(inventoryUploadDetail(err), { variant: 'error' });
    }
  };

  const onPickManifestFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    void uploadManifestFile(f);
    e.target.value = '';
  };

  const handleManifestDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    manifestDropDepth.current += 1;
    setManifestDropOver(true);
  };

  const handleManifestDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    manifestDropDepth.current -= 1;
    if (manifestDropDepth.current <= 0) {
      manifestDropDepth.current = 0;
      setManifestDropOver(false);
    }
  };

  const handleManifestDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleManifestDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    manifestDropDepth.current = 0;
    setManifestDropOver(false);
    const f = e.dataTransfer.files?.[0];
    void uploadManifestFile(f);
  };

  const handleOpenDeleteDialog = async () => {
    if (!orderId) return;
    setDeleteDialogOpen(true);
    setDeleteConfirmation('');
    setDeletePreview(null);
    try {
      const preview = await orderDeletePreview.mutateAsync(orderId);
      setDeletePreview(preview);
    } catch {
      enqueueSnackbar('Failed to load order deletion preview', { variant: 'error' });
      setDeleteDialogOpen(false);
    }
  };

  const handlePurgeDeleteOrder = async () => {
    if (!orderId || !order) return;
    if (deleteConfirmation.trim() !== order.order_number) {
      enqueueSnackbar(`Type ${order.order_number} to confirm deletion`, { variant: 'warning' });
      return;
    }
    try {
      const result = await purgeDeleteOrder.mutateAsync({
        orderId,
        data: { confirm_order_number: deleteConfirmation.trim() },
      });
      enqueueSnackbar(`Deleted order ${result.order_number} and related artifacts`, { variant: 'success' });
      navigate('/inventory/orders');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete order artifacts';
      enqueueSnackbar(message, { variant: 'error' });
    }
  };

  const handleRemoveManifest = async () => {
    if (!orderId) return;
    if (!window.confirm('Remove manifest?')) return;
    try {
      await removeManifestMutation.mutateAsync(orderId);
    } catch (e) {
      console.error(e);
      enqueueSnackbar('Could not remove manifest', { variant: 'error' });
    }
  };

  if (isLoading && !order) {
    return (
      <Box sx={{ bgcolor: TOKENS.pageBg, minHeight: '100vh' }}>
        <Skeleton variant="rectangular" height={TOKENS.topBarH} sx={{ borderRadius: 0 }} />
        <Box
          sx={{
            maxWidth: TOKENS.shellMaxW,
            mx: 'auto',
            pt: `${TOKENS.shellPt}px`,
            pb: `${TOKENS.shellPb}px`,
            px: { xs: '16px', sm: `${TOKENS.shellPx}px` },
          }}
        >
          <Skeleton variant="text" width={280} height={40} />
          <Skeleton variant="text" width={180} height={28} sx={{ mb: 3 }} />
          <Skeleton variant="rectangular" height={420} sx={{ borderRadius: `${TOKENS.radiusCard}px` }} />
        </Box>
      </Box>
    );
  }

  if (!order) return <Typography sx={{ p: 3 }}>Order not found.</Typography>;

  const badge = headerBadge(order);
  const purchase = parseMoney(order.purchase_cost);
  const fees = parseMoney(order.fees);
  const ship = parseMoney(order.shipping_cost);
  const totalCost = parseMoney(order.total_cost) || purchase + fees + ship;
  const retail = parseMoney(order.retail_value);
  const mPct = marginPct(retail, totalCost);
  const derived = deriveLifecycleStatus(order);

  const dateStr = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

  const milestones = [
    { key: 'ordered_date' as const, label: 'Ordered', apiKey: 'ordered_date' as const },
    { key: 'paid_date' as const, label: 'Paid', apiKey: 'paid_date' as const },
    { key: 'shipped_date' as const, label: 'Shipped', apiKey: 'shipped_date' as const },
    { key: 'expected_delivery' as const, label: 'Expected', apiKey: 'expected_delivery' as const },
    { key: 'delivered_date' as const, label: 'Delivered', apiKey: 'delivered_date' as const },
  ];

  const showCurrent = (mKey: string) => {
    if (mKey === 'expected_delivery') return false;
    if (['cancelled', 'processing', 'complete'].includes(order.status)) return false;
    return (
      (mKey === 'delivered_date' && derived === 'delivered') ||
      (mKey === 'shipped_date' && derived === 'shipped') ||
      (mKey === 'paid_date' && derived === 'paid') ||
      (mKey === 'ordered_date' && derived === 'ordered')
    );
  };

  const fmtMoney = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const canGoToPreprocessing = Boolean(order.manifest_file);
  const canGoToProcessing = ['delivered', 'processing', 'complete'].includes(order.status);

  const manifestRows = order.manifest_preview?.row_count ?? 0;

  const gridTemplateAreas = compact
    ? `"life" "costs" "manifest"`
    : `"life costs manifest"`;

  return (
    <Box
      sx={{
        bgcolor: TOKENS.pageBg,
        minHeight: '100vh',
        color: TOKENS.textBody,
        fontFamily: '"DM Sans", system-ui, sans-serif',
      }}
    >
      <Box
        sx={{
          bgcolor: 'white',
          borderBottom: `1px solid ${TOKENS.borderCard}`,
          px: { xs: '16px', sm: `${TOKENS.shellPx}px` },
          height: TOKENS.topBarH,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Button
          variant="text"
          size="small"
          onClick={() => navigate('/inventory/orders')}
          sx={{
            textTransform: 'none',
            fontSize: 13,
            fontWeight: 500,
            color: TOKENS.textMuted,
            minWidth: 0,
            px: 0,
            gap: '6px',
            '&:hover': { color: TOKENS.textPrimary, bgcolor: 'transparent' },
          }}
        >
          <ArrowLeftIcon />
          Orders
        </Button>
      </Box>

      <Box
        sx={{
          maxWidth: TOKENS.shellMaxW,
          mx: 'auto',
          pt: `${TOKENS.shellPt}px`,
          pb: `${TOKENS.shellPb}px`,
          px: { xs: '16px', sm: `${TOKENS.shellPx}px` },
        }}
      >
        <Box sx={{ mb: `${TOKENS.headerMb}px` }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap', mb: '10px' }}>
            <Typography
              component="h1"
              sx={{
                fontSize: 22,
                fontWeight: 700,
                m: 0,
                fontFamily: "'DM Mono', ui-monospace, monospace",
                letterSpacing: '-0.01em',
                color: TOKENS.textPrimary,
              }}
            >
              #{order.order_number}
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>{order.vendor_name}</Typography>
            <Typography sx={{ fontSize: 12, color: TOKENS.textSoft }}>
              {order.vendor_code ? `{${order.vendor_code}}` : ''}
            </Typography>
            <Box
              component="span"
              sx={{
                fontSize: 11,
                fontWeight: 700,
                px: '10px',
                py: '3px',
                borderRadius: `${TOKENS.radiusPill}px`,
                bgcolor: badge.style.bg,
                color: badge.style.color,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {badge.label}
            </Box>
          </Box>
          <Box
            sx={{
              bgcolor: 'white',
              border: `1px solid ${TOKENS.borderCard}`,
              borderRadius: `${TOKENS.radiusCard}px`,
              px: `${TOKENS.sectionHeaderPx}px`,
              py: `${TOKENS.panelBodyPt}px`,
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                md: 'minmax(0, 1fr) minmax(140px, 220px) 82px 82px',
              },
              gap: { xs: 2, md: '32px' },
              alignItems: 'start',
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ ...S.fieldLabel, mb: 0.5 }}>Description</Typography>
              <InlineEditableValue
                fieldId="description"
                value={order.description ?? ''}
                multiline
                placeholder="Add description"
                onCommit={(next) => queuePatch({ description: next })}
                successFlashKey={successFlashKey}
                errorFlashKey={errorFlashKey}
              />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ ...S.fieldLabel, mb: 0.5 }}>Condition</Typography>
              <Box sx={{ position: 'relative', mt: 0.5 }}>
                <Box
                  component="select"
                  value={order.condition ?? ''}
                  onChange={(e) => queuePatch({ condition: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') e.stopPropagation();
                  }}
                  sx={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: order.condition ? TOKENS.textBody : TOKENS.textSoft,
                    border: 'none',
                    borderBottom: '1px dashed transparent',
                    bgcolor: 'transparent',
                    appearance: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    pr: 2.5,
                    outline: 'none',
                    width: '100%',
                    py: 0.5,
                    '&:hover': { borderBottomColor: '#cbd5e1' },
                  }}
                >
                  <option value="">Select…</option>
                  {PO_CONDITION_OPTIONS.filter((o) => o.value !== '').map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Box>
                <ExpandMore
                  sx={{
                    position: 'absolute',
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: TOKENS.textPlaceholder,
                    pointerEvents: 'none',
                    fontSize: 20,
                  }}
                />
              </Box>
            </Box>
            <Box>
              <Typography sx={{ ...S.fieldLabel, mb: 0.5 }}>Items</Typography>
              <InlineEditableValue
                fieldId="item_count"
                value={String(order.item_count ?? '')}
                type="integer"
                displayFormatter={(v) => formatNumber(Number.parseInt(v, 10) || 0)}
                onCommit={(next) => queuePatch({ item_count: Number.parseInt(next, 10) || 0 })}
                successFlashKey={successFlashKey}
                errorFlashKey={errorFlashKey}
              />
            </Box>
            <Box>
              <Typography sx={{ ...S.fieldLabel, mb: 0.5 }}># Pallets</Typography>
              <InlineEditableValue
                fieldId="order_pallet_count"
                value={
                  order.order_pallet_count != null ? String(order.order_pallet_count) : ''
                }
                type="integer"
                placeholder="Optional"
                displayFormatter={(v) => formatNumber(Number.parseInt(v, 10) || 0)}
                onCommit={(next) => {
                  const t = next.trim();
                  if (!t) {
                    queuePatch({ order_pallet_count: null });
                    return;
                  }
                  const n = Number.parseInt(t, 10);
                  if (!Number.isFinite(n) || n < 0) return;
                  queuePatch({ order_pallet_count: n });
                }}
                successFlashKey={successFlashKey}
                errorFlashKey={errorFlashKey}
              />
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.05fr) minmax(0, 1fr) minmax(280px, 0.75fr)',
            gridTemplateAreas,
            gap: '12px',
            alignItems: 'stretch',
          }}
        >
          {/* Costs */}
          <Box
            sx={{
              gridArea: 'costs',
              bgcolor: 'white',
              border: `1px solid ${TOKENS.borderCard}`,
              borderRadius: `${TOKENS.radiusCard}px`,
              overflow: 'hidden',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box
              sx={{
                px: `${TOKENS.sectionHeaderPx}px`,
                pt: `${TOKENS.sectionHeaderPt}px`,
                pb: `${TOKENS.sectionHeaderPb}px`,
                borderBottom: `1px solid ${TOKENS.borderInner}`,
                minHeight: 52,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Typography sx={S.sectionTitle}>Costs</Typography>
            </Box>
            <Box
              sx={{
                px: `${TOKENS.sectionHeaderPx}px`,
                pt: `${TOKENS.panelBodyPt}px`,
                pb: `${TOKENS.panelBodyPb}px`,
                flex: 1,
              }}
            >
              {(
                [
                  ['purchase_cost', 'Purchase Cost'],
                  ['fees', 'Fees'],
                  ['shipping_cost', 'Shipping'],
                ] as const
              ).map(([field, label]) => (
                <Box
                  key={field}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    py: '10px',
                    borderBottom: `1px solid ${TOKENS.borderRow}`,
                  }}
                >
                  <Typography sx={S.fieldLabel}>{label}</Typography>
                  <Box sx={{ minWidth: 120, textAlign: 'right' }}>
                    <InlineEditableValue
                      fieldId={field}
                      value={order[field] ?? ''}
                      type="currency"
                      mono
                      displayFormatter={(v) => formatCurrencyWhole(v)}
                      onCommit={(next) => queuePatch({ [field]: next.trim() ? next.trim() : null })}
                      successFlashKey={successFlashKey}
                      errorFlashKey={errorFlashKey}
                    />
                  </Box>
                </Box>
              ))}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: '14px', pb: '4px' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: TOKENS.textBody }}>Total Cost</Typography>
                <Typography sx={{ fontSize: 20, fontWeight: 700, color: TOKENS.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtMoney(totalCost)}
                </Typography>
              </Box>

              <Box
                sx={{
                  mt: '16px',
                  px: '16px',
                  py: '14px',
                  bgcolor: TOKENS.insetBg,
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                <Box>
                  <Typography sx={{ ...S.fieldLabel, mb: 0.5 }}>Retail Value</Typography>
                  <InlineEditableValue
                    fieldId="retail_value"
                    value={order.retail_value ?? ''}
                    type="currency"
                    mono
                    displayFormatter={(v) => formatCurrencyWhole(v)}
                    onCommit={(next) => queuePatch({ retail_value: next.trim() ? next.trim() : null })}
                    successFlashKey={successFlashKey}
                    errorFlashKey={errorFlashKey}
                  />
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ ...S.fieldLabel, mb: 0.5 }}>Margin</Typography>
                  <Typography
                    sx={{
                      fontSize: 15,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      color: mPct == null ? '#94a3b8' : mPct >= 60 ? '#059669' : '#d97706',
                    }}
                  >
                    {mPct == null ? '—' : `${mPct.toFixed(1)}%`}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>

          {/* Lifecycle */}
          <Box
            sx={{
              gridArea: 'life',
              bgcolor: 'white',
              border: `1px solid ${TOKENS.borderCard}`,
              borderRadius: `${TOKENS.radiusCard}px`,
              overflow: 'hidden',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box
              sx={{
                px: `${TOKENS.sectionHeaderPx}px`,
                pt: `${TOKENS.sectionHeaderPt}px`,
                pb: `${TOKENS.sectionHeaderPb}px`,
                borderBottom: `1px solid ${TOKENS.borderInner}`,
                minHeight: 52,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Typography component="span" sx={S.sectionTitle}>
                Lifecycle
              </Typography>
              <Typography component="span" sx={{ fontSize: 11, color: TOKENS.textSoft, ml: 1.5 }}>
                dates drive status
              </Typography>
            </Box>
            <Box
              sx={{
                px: `${TOKENS.sectionHeaderPx}px`,
                pt: `${TOKENS.lifecycleBodyPt}px`,
                pb: `${TOKENS.lifecycleBodyPb}px`,
                flex: 1,
              }}
            >
              {milestones.map((m, i, arr) => {
                const val = order[m.key];
                const filled = Boolean(val);
                const cur = showCurrent(m.apiKey);
                return (
                  <Box key={m.key}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', py: '10px' }}>
                      {filled ? <CheckFilled /> : <CircleEmpty />}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          component="span"
                          sx={{
                            fontSize: 13,
                            fontWeight: filled ? 600 : 500,
                            color: filled ? TOKENS.textBody : TOKENS.textDisabledRow,
                          }}
                        >
                          {m.label}
                          {cur && filled && (
                            <Box
                              component="span"
                              sx={{
                                ml: 1,
                                fontSize: 9,
                                fontWeight: 700,
                                px: 0.75,
                                py: 0.25,
                                borderRadius: '3px',
                                bgcolor: '#d1fae5',
                                color: '#065f46',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                verticalAlign: 'middle',
                              }}
                            >
                              Current
                            </Box>
                          )}
                        </Typography>
                      </Box>
                      <Box
                        component="input"
                        type="date"
                        value={dateStr(val)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (m.apiKey === 'ordered_date' && !v) return;
                          queuePatch({
                            [m.apiKey]: v || null,
                          });
                        }}
                        sx={{
                          border: `1px solid ${filled ? TOKENS.borderCard : TOKENS.borderInner}`,
                          borderRadius: `${TOKENS.radiusSmall}px`,
                          py: '6px',
                          px: '8px',
                          fontSize: 13,
                          color: filled ? TOKENS.textBody : TOKENS.textPlaceholder,
                          bgcolor: filled ? 'white' : '#f8f9fb',
                          outline: 'none',
                          width: 140,
                          fontVariantNumeric: 'tabular-nums',
                          fontFamily: 'inherit',
                        }}
                      />
                    </Box>
                    {i < arr.length - 1 && (
                      <Box
                        sx={{
                          ml: '8px',
                          width: 2,
                          height: 12,
                          borderRadius: 0.5,
                          bgcolor: filled ? '#a7f3d0' : TOKENS.borderInner,
                        }}
                      />
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>

          {/* Manifest */}
          <Box
            sx={{
              gridArea: 'manifest',
              bgcolor: 'white',
              border: `1px solid ${TOKENS.borderCard}`,
              borderRadius: `${TOKENS.radiusCard}px`,
              overflow: 'hidden',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box
              sx={{
                px: `${TOKENS.sectionHeaderPx}px`,
                pt: `${TOKENS.sectionHeaderPt}px`,
                pb: `${TOKENS.sectionHeaderPb}px`,
                borderBottom: `1px solid ${TOKENS.borderInner}`,
                minHeight: 52,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Typography sx={S.sectionTitle}>Manifest</Typography>
            </Box>
            <Box
              sx={{
                px: `${TOKENS.sectionHeaderPx}px`,
                pt: `${TOKENS.panelBodyPt}px`,
                pb: `${TOKENS.panelBodyPb}px`,
                flex: 1,
              }}
            >
              <input
                ref={manifestInputRef}
                type="file"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                hidden
                onChange={onPickManifestFile}
              />
              {order.manifest_file ? (
                <>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      py: '10px',
                      px: '12px',
                      bgcolor: '#f8f9fb',
                      borderRadius: '8px',
                      mb: 2,
                    }}
                  >
                    <DescriptionOutlined sx={{ color: TOKENS.textMuted, fontSize: 20 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: TOKENS.textBody,
                      wordBreak: 'break-all',
                    }}
                  >
                        {order.manifest_file.filename}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: TOKENS.textSoft }}>
                        Uploaded{' '}
                        {order.manifest_file.uploaded_at
                          ? format(new Date(order.manifest_file.uploaded_at), 'MMM d, yyyy')
                          : '—'}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      aria-label="Remove manifest"
                      onClick={() => void handleRemoveManifest()}
                      disabled={removeManifestMutation.isPending}
                      sx={{
                        minWidth: 0,
                        color: TOKENS.textPlaceholder,
                        '&:hover': { color: '#ef4444', bgcolor: 'transparent' },
                      }}
                    >
                      {removeManifestMutation.isPending ? <CircularProgress size={18} /> : <DeleteOutline fontSize="small" />}
                    </Button>
                  </Box>
                  <Box sx={{ display: 'flex', gap: '8px' }}>
                    {[
                      { label: 'Rows', value: formatNumber(manifestRows) },
                      { label: 'Categories', value: manifestCategoryDistinctCount(order) },
                      { label: 'Est. Value', value: retail > 0 ? formatCurrencyWhole(String(retail)) : '—', green: true },
                    ].map((s) => (
                      <Box
                        key={s.label}
                        sx={{ flex: 1, py: '10px', px: '12px', bgcolor: '#f8f9fb', borderRadius: `${TOKENS.radiusSmall}px` }}
                      >
                        <Typography sx={{ ...S.fieldLabel, mb: 0.375 }}>{s.label}</Typography>
                        <Typography
                          sx={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: s.green ? '#059669' : TOKENS.textBody,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {s.value}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </>
              ) : (
                <Box
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') manifestInputRef.current?.click();
                  }}
                  onDragEnter={handleManifestDragEnter}
                  onDragLeave={handleManifestDragLeave}
                  onDragOver={handleManifestDragOver}
                  onDrop={handleManifestDrop}
                  onClick={() => !uploadManifestMutation.isPending && manifestInputRef.current?.click()}
                  sx={{
                    border: `2px dashed ${manifestDropOver ? TOKENS.textMuted : TOKENS.borderCard}`,
                    borderRadius: '8px',
                    py: '28px',
                    px: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1,
                    bgcolor: manifestDropOver ? '#f8f9fb' : 'transparent',
                    cursor: uploadManifestMutation.isPending ? 'wait' : 'pointer',
                  }}
                >
                  {uploadManifestMutation.isPending ? (
                    <CircularProgress size={28} />
                  ) : (
                    <UploadFile sx={{ color: '#94a3b8' }} />
                  )}
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: TOKENS.textMuted }}>
                    Drop CSV or TSV or click to browse
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            mt: `${TOKENS.bottomBarMt}px`,
            display: 'flex',
            gap: `${TOKENS.bottomBarGap}px`,
            alignItems: 'stretch',
            flexWrap: compact ? 'wrap' : 'nowrap',
          }}
        >
          <Button
            fullWidth={compact}
            variant="contained"
            disabled={!canGoToPreprocessing}
            onClick={() => navigate(`/inventory/preprocessing/${order.id}`)}
            sx={{
              flex: compact ? '1 1 100%' : 1,
              py: `${TOKENS.btnPadY}px`,
              px: `${TOKENS.btnPadXPrimary}px`,
              borderRadius: `${TOKENS.radiusBtn}px`,
              bgcolor: TOKENS.textPrimary,
              textTransform: 'none',
              justifyContent: 'space-between',
              boxShadow: 'none',
              '&:hover': { bgcolor: '#1e293b', boxShadow: 'none' },
              '&.Mui-disabled': {
                bgcolor: '#e2e8f0',
                color: TOKENS.textSoft,
              },
            }}
          >
            <Box sx={{ textAlign: 'left' }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'white' }}>Start Preprocessing</Typography>
              <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', mt: '1px' }}>
                Standardize manifest data
              </Typography>
            </Box>
            <ChevronRight sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 16 }} />
          </Button>
          <Button
            fullWidth={compact}
            variant="outlined"
            disabled={!canGoToProcessing}
            onClick={() => navigate(`/inventory/processing/${order.id}`)}
            sx={{
              flex: compact ? '1 1 100%' : 1,
              py: `${TOKENS.btnPadY}px`,
              px: `${TOKENS.btnPadXPrimary}px`,
              borderRadius: `${TOKENS.radiusBtn}px`,
              borderColor: TOKENS.borderCard,
              color: TOKENS.textBody,
              textTransform: 'none',
              justifyContent: 'space-between',
              '&:hover': { borderColor: '#475569' },
              '&.Mui-disabled': {
                borderColor: '#e2e8f0',
                color: TOKENS.textSoft,
              },
            }}
          >
            <Box sx={{ textAlign: 'left' }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Start Processing</Typography>
              <Typography sx={{ fontSize: 11, color: TOKENS.textSoft, mt: '1px' }}>Batches, check-in, item ops</Typography>
            </Box>
            <ChevronRight sx={{ color: TOKENS.textPlaceholder, fontSize: 16 }} />
          </Button>
          <Button
            variant="outlined"
            onClick={handleOpenDeleteDialog}
            disabled={orderDeletePreview.isPending || purgeDeleteOrder.isPending}
            sx={{
              flex: compact ? '1 1 100%' : 'none',
              py: `${TOKENS.btnPadY}px`,
              px: `${TOKENS.btnPadXDelete}px`,
              borderRadius: `${TOKENS.radiusBtn}px`,
              borderColor: '#fecaca',
              color: '#dc2626',
              textTransform: 'none',
              fontSize: 12,
              fontWeight: 500,
              '&:hover': { bgcolor: '#fef2f2', borderColor: '#fecaca' },
              '&.Mui-disabled': {
                borderColor: '#e2e8f0',
                color: TOKENS.textSoft,
              },
            }}
          >
            <DeleteOutline sx={{ mr: 0.75, fontSize: 18 }} />
            Delete
          </Button>
        </Box>
      </Box>

      <Dialog open={deleteDialogOpen} onClose={() => { if (purgeDeleteOrder.isPending) return; setDeleteDialogOpen(false); }} maxWidth="md" fullWidth>
        <DialogTitle>Delete Order and All Artifacts</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This action is permanent. Artifacts will be deleted in reverse sequence.
          </Typography>
          {orderDeletePreview.isPending && <Typography variant="body2">Loading deletion preview...</Typography>}
          {!orderDeletePreview.isPending && deletePreview && (
            <>
              {deletePreview.warnings.map((warning) => (
                <Typography key={warning} variant="body2" color="warning.main" sx={{ mb: 1 }}>{warning}</Typography>
              ))}
              <Typography variant="subtitle2" sx={{ mt: 1.5, mb: 1 }}>Reverse Deletion Sequence</Typography>
              <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width={60}>Step</TableCell>
                      <TableCell>Action</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell align="right">Count</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {deletePreview.steps.map((step, index) => (
                      <TableRow key={step.key}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{step.label}</TableCell>
                        <TableCell>{step.description}</TableCell>
                        <TableCell align="right">{step.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Items to Be Deleted ({deletePreview.items.length})</Typography>
              <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 200 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>SKU</TableCell>
                      <TableCell>Title</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Tier</TableCell>
                      <TableCell>Batch</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {deletePreview.items.length === 0 && (
                      <TableRow><TableCell colSpan={5}>No items linked to this order.</TableCell></TableRow>
                    )}
                    {deletePreview.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.sku}</TableCell>
                        <TableCell>{item.title}</TableCell>
                        <TableCell>{item.status}</TableCell>
                        <TableCell>{item.processing_tier}</TableCell>
                        <TableCell>{item.batch_number || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
          {!orderDeletePreview.isPending && !deletePreview && (
            <Typography variant="body2" color="error">Could not load deletion preview.</Typography>
          )}
          <TextField
            fullWidth sx={{ mt: 2 }}
            label={`Type ${order.order_number} to confirm`}
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            disabled={purgeDeleteOrder.isPending}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={purgeDeleteOrder.isPending}>Cancel</Button>
          <Button
            variant="contained" color="error"
            onClick={handlePurgeDeleteOrder}
            disabled={purgeDeleteOrder.isPending || orderDeletePreview.isPending || deleteConfirmation.trim() !== order.order_number}
          >
            {purgeDeleteOrder.isPending ? 'Deleting...' : 'Delete All in Reverse Order'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
