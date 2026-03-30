import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import LabelOutlined from '@mui/icons-material/LabelOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import CheckCircle from '@mui/icons-material/CheckCircle';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import ReplayOutlined from '@mui/icons-material/ReplayOutlined';
import SwapHoriz from '@mui/icons-material/SwapHoriz';
import { useSnackbar } from 'notistack';
import {
  retagV2Lookup,
  retagV2Create,
  retagV2Stats,
  retagV2History,
  type RetagV2LookupResponse,
  type RetagV2StatsResponse,
  type RetagHistoryResponse,
} from '../../api/inventory.api';
import { localPrintService } from '../../services/localPrintService';
import { format, startOfDay } from 'date-fns';
import { useLocation } from 'react-router-dom';

// ── Types ─────────────────────────────────────────────────────────────────────

type PriceStrategy = 'keep_db2' | 'pct_of_db2' | 'estimate' | 'pct_of_retail';

interface StrategyOption {
  value: PriceStrategy;
  label: string;
  needsPct: boolean;
  tooltip: string;
}

const STRATEGY_OPTIONS: StrategyOption[] = [
  {
    value: 'keep_db2',
    label: 'Use DB2 price',
    needsPct: false,
    tooltip: 'Use the item\'s current price from DB2 as-is.',
  },
  {
    value: 'pct_of_db2',
    label: '% of DB2 price',
    needsPct: true,
    tooltip: 'Apply a percentage of the DB2 price. E.g. 80% keeps most of the original price.',
  },
  {
    value: 'estimate',
    label: 'AI / Heuristic estimate',
    needsPct: false,
    tooltip: 'Use the system estimate (retail × condition multiplier until ML model is trained).',
  },
  {
    value: 'pct_of_retail',
    label: '% of retail value',
    needsPct: true,
    tooltip: 'Price as a percentage of the vendor retail amount. E.g. 35% of retail is a typical thrift price.',
  },
];

const CONDITION_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'very_good', label: 'Very Good' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'salvage', label: 'Salvage' },
  { value: 'unknown', label: 'Unknown' },
];

const SOURCE_OPTIONS = [
  { value: 'purchased', label: 'Purchased (BStock)' },
  { value: 'consignment', label: 'Consignment' },
  { value: 'misc', label: 'Miscellaneous' },
];

interface SessionEntry {
  seq: number;
  oldSku: string;
  newSku: string;
  title: string;
  price: number;
  strategy: PriceStrategy;
  taggedAt: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val: string | number | null | undefined): string {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function computeAppliedPrice(
  strategy: PriceStrategy,
  strategyPct: number,
  db2Price: string,
  retailAmt: string | null | undefined,
  estimatedPrice: string | undefined,
): number {
  const db2 = parseFloat(db2Price) || 0;
  const retail = parseFloat(retailAmt || '0') || 0;
  const est = parseFloat(estimatedPrice || '0') || 0;

  switch (strategy) {
    case 'keep_db2':
      return db2;
    case 'pct_of_db2':
      return parseFloat(((db2 * strategyPct) / 100).toFixed(2));
    case 'estimate':
      return est;
    case 'pct_of_retail':
      return parseFloat(((retail * strategyPct) / 100).toFixed(2));
    default:
      return db2;
  }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RetagPage() {
  const { enqueueSnackbar } = useSnackbar();
  const location = useLocation();

  // ── Session settings (persist across scans) ──
  const [strategy, setStrategy] = useState<PriceStrategy>('pct_of_retail');
  const [strategyPct, setStrategyPct] = useState(35);
  const [autoPrint, setAutoPrint] = useState(true);
  const [defaultSource, setDefaultSource] = useState('purchased');
  const [defaultCondition, setDefaultCondition] = useState('good');

  // ── Scan / lookup state ──
  const [skuInput, setSkuInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Current item state ──
  const [lookupResult, setLookupResult] = useState<RetagV2LookupResponse | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCondition, setEditCondition] = useState('good');
  const [editLocation, setEditLocation] = useState('');
  const [priceOverridden, setPriceOverridden] = useState(false);

  // ── Session history (in-memory, drives "this session" filter) ──
  const [history, setHistory] = useState<SessionEntry[]>([]);
  const [seqCounter, setSeqCounter] = useState(1);

  // ── DB stats ──
  const [stats, setStats] = useState<RetagV2StatsResponse | null>(null);

  // ── History panel state ──
  const [historyData, setHistoryData] = useState<RetagHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [sessionOnly, setSessionOnly] = useState(true);
  const dayStartIsoRef = useRef<string>(startOfDay(new Date()).toISOString());
  const sessionOnlyRef = useRef(sessionOnly);
  sessionOnlyRef.current = sessionOnly;
  const historySearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const skuRef = useRef<HTMLInputElement>(null);
  const lookupLoadingRef = useRef(false);
  const createLoadingRef = useRef(false);
  lookupLoadingRef.current = lookupLoading;
  createLoadingRef.current = createLoading;

  // Load DB stats on mount and after each successful tag
  const refreshStats = useCallback(() => {
    retagV2Stats()
      .then(r => setStats(r.data))
      .catch(() => null);
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // ── History panel fetch ──────────────────────────────────────────────────
  const fetchHistory = useCallback((page: number, search: string, sessionOnlyMode: boolean) => {
    setHistoryLoading(true);
    setHistoryError(null);
    retagV2History({
      page,
      page_size: 25,
      search: search || undefined,
      since: sessionOnlyMode ? dayStartIsoRef.current : undefined,
    })
      .then(r => {
        setHistoryData(r.data);
        setHistoryLoading(false);
        setHistoryError(null);
      })
      .catch(() => {
        setHistoryData(null);
        setHistoryLoading(false);
        setHistoryError('Could not load retag history. Check your connection and try again.');
      });
  }, []);

  // Fetch history on mount and after each retag
  const refreshHistory = useCallback(() => {
    fetchHistory(historyPage, historySearch, sessionOnly);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchHistory, historyPage, historySearch, sessionOnly]);

  useEffect(() => {
    fetchHistory(1, '', true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep scan field focused at all times unless a modal/dropdown is open
  useEffect(() => {
    if (!createLoading && !lookupLoading) {
      setTimeout(() => skuRef.current?.focus(), 80);
    }
  }, [lookupResult, createLoading, lookupLoading, history.length]);

  // Focus scan field after navigating to this route (sidebar / SPA)
  useEffect(() => {
    if (location.pathname !== '/inventory/retag') return;
    if (createLoading || lookupLoading) return;
    const t = setTimeout(() => skuRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [location.pathname, createLoading, lookupLoading]);

  // Refocus scan when the browser tab becomes visible again
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (lookupLoadingRef.current || createLoadingRef.current) return;
      setTimeout(() => skuRef.current?.focus(), 50);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // ── Reactive applied price ──
  const legacy = lookupResult?.legacy_item;
  const suggested = lookupResult?.suggested;

  const appliedPrice = useMemo(() => {
    if (!legacy) return 0;
    return computeAppliedPrice(
      strategy,
      strategyPct,
      legacy.price,
      legacy.retail_amt,
      suggested?.estimated_price,
    );
  }, [strategy, strategyPct, legacy, suggested]);

  // When strategy changes or a new item loads, update the price field unless staff overrode it
  useEffect(() => {
    if (legacy && !priceOverridden) {
      setEditPrice(appliedPrice > 0 ? String(appliedPrice) : '');
    }
  }, [appliedPrice, legacy, priceOverridden]);

  // When a new item loads, reset the override flag and set defaults
  useEffect(() => {
    if (legacy) {
      setPriceOverridden(false);
      setEditCondition(legacy.condition || defaultCondition);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacy?.sku]);

  // ── Handlers ──

  const clearItem = useCallback(() => {
    setLookupResult(null);
    setEditTitle('');
    setEditPrice('');
    setEditCondition(defaultCondition);
    setEditLocation('');
    setPriceOverridden(false);
    setError('');
    setSkuInput('');
    setTimeout(() => skuRef.current?.focus(), 50);
  }, [defaultCondition]);

  // ── Core create logic — accepts explicit payload so it can be called
  //    immediately from handleLookup (auto-print mode) without waiting for
  //    the editPrice/editTitle/editCondition state to settle via useEffect.
  const executeCreate = useCallback(async (
    legacyItem: NonNullable<RetagV2LookupResponse['legacy_item']>,
    price: number,
    title: string,
    condition: string,
    shouldPrint: boolean,
  ) => {
    if (isNaN(price) || price <= 0) {
      setError('Price could not be determined. Check the strategy settings and try again.');
      return;
    }

    setError('');
    setCreateLoading(true);

    try {
      const { data } = await retagV2Create({
        old_sku: legacyItem.sku,
        title: title.trim() || legacyItem.title,
        brand: legacyItem.brand,
        condition,
        source: defaultSource,
        price,
        location: editLocation.trim() || undefined,
      });

      const isReprint = !!data.already_retagged;

      let printOk = true;
      if (shouldPrint && data.print_payload) {
        printOk = await localPrintService
          .printLabel({
            qr_data: data.print_payload.qr_data,
            text: data.print_payload.text,
            product_title: data.print_payload.product_title,
            product_brand: data.print_payload.product_brand?.trim() || undefined,
            product_model: data.print_payload.product_model?.trim() || undefined,
            include_text: true,
          })
          .then(() => true)
          .catch(() => false);
      }

      const entry: SessionEntry = {
        seq: seqCounter,
        oldSku: data.old_sku,
        newSku: data.new_sku,
        title: data.title,
        price,
        strategy,
        taggedAt: new Date(),
      };
      setHistory(h => [entry, ...h].slice(0, 50));
      setSeqCounter(c => c + 1);

      if (isReprint) {
        enqueueSnackbar(
          `Reprinted existing tag: ${data.old_sku} → ${data.new_sku}${!printOk ? ' (print server offline)' : ''}`,
          {
            variant: !printOk ? 'warning' : 'info',
            autoHideDuration: 4000,
            anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
          },
        );
      } else {
        enqueueSnackbar(
          `Tagged! ${data.old_sku} → ${data.new_sku}${shouldPrint && !printOk ? ' (print server offline)' : ''}`,
          { variant: shouldPrint && !printOk ? 'warning' : 'success', autoHideDuration: 2500 },
        );
      }

      refreshStats();
      fetchHistory(1, historySearch, sessionOnly);
      setHistoryPage(1);
      clearItem();
    } catch (err: unknown) {
      const axiosDetail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(axiosDetail ?? 'Create failed — check the Django logs for details.');
    } finally {
      setCreateLoading(false);
    }
  }, [
    defaultSource, editLocation, strategy, seqCounter,
    enqueueSnackbar, refreshStats, clearItem, fetchHistory, historySearch, sessionOnly,
  ]);

  const handleLookup = useCallback(async () => {
    const sku = skuInput.trim().toUpperCase();
    if (!sku) return;
    setError('');
    setLookupLoading(true);

    try {
      const { data } = await retagV2Lookup(sku);

      if (!data.found) {
        setError(`No DB2 item found for SKU: ${sku}. Ensure import_db2_staging has been run.`);
        setSkuInput('');
        return;
      }

      setLookupResult(data);
      setSkuInput('');

      if (!data.legacy_item) return;

      // Non-blocking warning — workflow continues normally
      if (data.already_retagged) {
        const prevSku = data.existing_item?.sku ?? 'unknown';
        const prevDate = data.existing_item?.retagged_at
          ? format(new Date(data.existing_item.retagged_at), 'MMM d, h:mm a')
          : null;
        enqueueSnackbar(
          `⚠ Already retagged → ${prevSku}${prevDate ? ` on ${prevDate}` : ''}. Continuing anyway.`,
          { variant: 'warning', autoHideDuration: 5000, anchorOrigin: { vertical: 'bottom', horizontal: 'left' } },
        );
      }

      setEditTitle(data.legacy_item.title);

      // Auto-print mode: compute price immediately from the fresh response data
      // and create + print right away — no confirm step needed.
      if (autoPrint) {
        const immediatePrice = computeAppliedPrice(
          strategy,
          strategyPct,
          data.legacy_item.price,
          data.legacy_item.retail_amt,
          data.suggested?.estimated_price,
        );
        const immediateCondition = data.legacy_item.condition || defaultCondition;
        // Short delay so the item panel renders before the loading state kicks in
        await new Promise(r => setTimeout(r, 80));
        await executeCreate(
          data.legacy_item,
          immediatePrice,
          data.legacy_item.title,
          immediateCondition,
          true,
        );
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Lookup failed. Check the SKU and try again.';
      setError(msg);
      setSkuInput('');
    } finally {
      setLookupLoading(false);
    }
  }, [skuInput, autoPrint, strategy, strategyPct, defaultCondition, executeCreate]);

  // Manual confirm — used when auto-print is OFF so staff can review/edit first
  const handleCreate = useCallback(async () => {
    if (!lookupResult?.legacy_item) return;
    const price = parseFloat(editPrice);
    await executeCreate(
      lookupResult.legacy_item,
      price,
      editTitle,
      editCondition,
      false,  // no print in manual mode
    );
  }, [lookupResult, editPrice, editTitle, editCondition, executeCreate]);

  const handleSkuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLookup();
  };

  const currentStrategy = STRATEGY_OPTIONS.find(s => s.value === strategy)!;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 2 }}>
      <Alert severity="info" sx={{ mb: 2 }}>
        Retag migration: scan legacy DB2 shelf tags to create DB3 items and print new labels. Staging
        data comes from <code>import_db2_staging</code>; remove this page after retag week per ops docs.
      </Alert>

      {/* ── Header + Stats Bar ── */}
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap">
        <Stack direction="row" alignItems="center" spacing={1}>
          <LabelOutlined color="primary" sx={{ fontSize: 28 }} />
          <Box>
            <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
              Retag — DB2 to DB3
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Scan shelf items to create new DB3 tags
            </Typography>
          </Box>
        </Stack>

        {stats && (
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" sx={{ ml: { xs: 0, sm: 'auto' } }}>
            <Chip
              label={`${stats.total_retagged.toLocaleString()} / ${stats.total_staged.toLocaleString()} retagged`}
              color="primary"
              size="small"
              variant="outlined"
            />
            <Chip
              label={`${stats.remaining.toLocaleString()} remaining`}
              size="small"
              color={stats.remaining > 0 ? 'warning' : 'success'}
              variant="outlined"
            />
            {history.length > 0 && (
              <Chip
                label={`${history.length} this session`}
                size="small"
                color="success"
              />
            )}
          </Stack>
        )}
        {stats && (
          <Box sx={{ width: '100%', mt: 0.5 }}>
            <LinearProgress
              variant="determinate"
              value={stats.pct_complete}
              sx={{ height: 4, borderRadius: 2 }}
            />
          </Box>
        )}
      </Stack>

      {/* ── Main Grid: Settings | Item Panel ── */}
      <Grid container spacing={2} alignItems="flex-start">

        {/* LEFT: Settings + Scan ── */}
        <Grid size={{ xs: 12, md: 4 }}>

          {/* Settings Panel */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
              Session Settings
            </Typography>

            <Stack spacing={1.5}>
              {/* Price Strategy */}
              <FormControl size="small" fullWidth>
                <InputLabel>Price Strategy</InputLabel>
                <Select
                  value={strategy}
                  label="Price Strategy"
                  onChange={e => {
                    setStrategy(e.target.value as PriceStrategy);
                    setPriceOverridden(false);
                  }}
                >
                  {STRATEGY_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>{opt.label}</span>
                        <Tooltip title={opt.tooltip} placement="right">
                          <InfoOutlined sx={{ fontSize: 14, color: 'text.disabled', ml: 0.5 }} />
                        </Tooltip>
                      </Stack>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Percentage input — only shown for pct strategies */}
              {currentStrategy.needsPct && (
                <TextField
                  label={strategy === 'pct_of_retail' ? '% of Retail' : '% of DB2 Price'}
                  value={strategyPct}
                  onChange={e => {
                    setStrategyPct(Number(e.target.value));
                    setPriceOverridden(false);
                  }}
                  type="number"
                  inputProps={{ min: 1, max: 200, step: 1 }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                  size="small"
                  fullWidth
                  helperText={
                    strategy === 'pct_of_retail'
                      ? 'Typical thrift: 30–40% of retail'
                      : 'E.g. 80% keeps most of original price'
                  }
                />
              )}

              <Divider />

              {/* Default Source */}
              <FormControl size="small" fullWidth>
                <InputLabel>Default Source</InputLabel>
                <Select
                  value={defaultSource}
                  label="Default Source"
                  onChange={e => setDefaultSource(e.target.value)}
                >
                  {SOURCE_OPTIONS.map(o => (
                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Default Condition */}
              <FormControl size="small" fullWidth>
                <InputLabel>Default Condition</InputLabel>
                <Select
                  value={defaultCondition}
                  label="Default Condition"
                  onChange={e => setDefaultCondition(e.target.value)}
                >
                  {CONDITION_OPTIONS.map(o => (
                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Divider />

              {/* Auto Print Toggle */}
              <FormControlLabel
                control={
                  <Switch
                    checked={autoPrint}
                    onChange={e => setAutoPrint(e.target.checked)}
                    color="primary"
                  />
                }
                label={
                  <Stack>
                    <Typography variant="body2">Print on scan</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {autoPrint
                        ? 'Scan → create + print immediately'
                        : 'Scan → review → confirm manually'}
                    </Typography>
                  </Stack>
                }
              />
            </Stack>
          </Paper>

          {/* Scan Bar — always visible */}
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderColor: 'primary.main',
              borderWidth: 2,
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
              <QrCodeScanner color="primary" />
              <Typography variant="subtitle2" fontWeight={700}>Scan Item</Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                inputRef={skuRef}
                fullWidth
                label="Barcode / DB2 SKU"
                value={skuInput}
                onChange={e => setSkuInput(e.target.value.toUpperCase())}
                onKeyDown={handleSkuKeyDown}
                disabled={lookupLoading}
                placeholder="e.g. ITMNDMA68E"
                size="small"
                autoFocus
              />
              <Button
                variant="contained"
                onClick={handleLookup}
                disabled={!skuInput.trim() || lookupLoading}
                sx={{ minWidth: 80, flexShrink: 0 }}
              >
                {lookupLoading ? '...' : 'Scan'}
              </Button>
            </Stack>
          </Paper>
        </Grid>

        {/* RIGHT: Item Info Panel ── */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              minHeight: 420,
              borderColor: legacy ? 'primary.light' : 'divider',
              borderWidth: legacy ? 2 : 1,
            }}
          >
            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {/* Empty state */}
            {!legacy && !lookupLoading && (
              <Stack alignItems="center" justifyContent="center" sx={{ height: 360 }} spacing={1}>
                <QrCodeScanner sx={{ fontSize: 56, color: 'text.disabled' }} />
                <Typography variant="body1" color="text.secondary">
                  Scan an item to begin
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  Strategy: <strong>{currentStrategy.label}</strong>
                  {currentStrategy.needsPct && ` · ${strategyPct}%`}
                </Typography>
              </Stack>
            )}

            {lookupLoading && (
              <Stack alignItems="center" justifyContent="center" sx={{ height: 360 }}>
                <Typography variant="body2" color="text.secondary">Looking up...</Typography>
              </Stack>
            )}

            {/* Item panel — always shown when a legacy item is loaded */}
            {legacy && (
              <Stack spacing={2}>
                {/* Identity row */}
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box flex={1} mr={2}>
                    <Typography variant="overline" color="text.secondary" lineHeight={1}>
                      DB2 Item
                    </Typography>
                    <Typography variant="body2" color="text.secondary" fontFamily="monospace" fontSize={12}>
                      {legacy.sku}
                    </Typography>
                    <Stack direction="row" spacing={0.5} mt={0.5} flexWrap="wrap">
                      <Chip
                        label={legacy.legacy_status}
                        size="small"
                        color={legacy.legacy_status === 'on_shelf' ? 'success' : 'default'}
                      />
                      {legacy.brand && <Chip label={legacy.brand} size="small" variant="outlined" />}
                      {legacy.model && <Chip label={legacy.model} size="small" variant="outlined" />}
                    </Stack>
                  </Box>
                  <Button size="small" startIcon={<ReplayOutlined />} onClick={clearItem} color="inherit">
                    Clear
                  </Button>
                </Stack>

                {/* Editable title */}
                <TextField
                  label="Title"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  fullWidth
                  size="small"
                  helperText={`DB2: ${legacy.title}`}
                />

                {/* Price Grid */}
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.75}>
                    Price Reference
                  </Typography>
                  <Grid container spacing={1.5}>
                    {/* DB2 Price */}
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Paper
                        variant="outlined"
                        sx={{ p: 1.25, textAlign: 'center', bgcolor: 'action.hover' }}
                      >
                        <Typography variant="caption" color="text.secondary" display="block">
                          DB2 Price
                        </Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {fmt(legacy.price)}
                        </Typography>
                      </Paper>
                    </Grid>

                    {/* Retail Amt */}
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Paper
                        variant="outlined"
                        sx={{ p: 1.25, textAlign: 'center', bgcolor: 'action.hover' }}
                      >
                        <Typography variant="caption" color="text.secondary" display="block">
                          Retail Amt
                        </Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {legacy.retail_amt ? fmt(legacy.retail_amt) : '—'}
                        </Typography>
                      </Paper>
                    </Grid>

                    {/* Estimate */}
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Tooltip
                        title={
                          suggested
                            ? `${suggested.price_method === 'heuristic'
                                ? `Heuristic: retail × condition multiplier`
                                : 'ML model prediction'
                              } · Range: ${fmt(suggested.price_low)}–${fmt(suggested.price_high)} · Confidence: ${Math.round((suggested.price_confidence ?? 0) * 100)}%`
                            : ''
                        }
                        placement="top"
                      >
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 1.25, textAlign: 'center',
                            borderColor: strategy === 'estimate' ? 'primary.main' : 'divider',
                            borderWidth: strategy === 'estimate' ? 2 : 1,
                            cursor: 'help',
                          }}
                        >
                          <Typography variant="caption" color="text.secondary" display="block">
                            Estimate {suggested?.price_method === 'heuristic' ? '(H)' : '(ML)'}
                          </Typography>
                          <Typography
                            variant="body1"
                            fontWeight={600}
                            color={strategy === 'estimate' ? 'primary.main' : 'text.primary'}
                          >
                            {suggested ? fmt(suggested.estimated_price) : '—'}
                          </Typography>
                          {suggested && (
                            <Typography variant="caption" color="text.disabled" display="block" fontSize={10}>
                              {fmt(suggested.price_low)}–{fmt(suggested.price_high)}
                            </Typography>
                          )}
                        </Paper>
                      </Tooltip>
                    </Grid>

                    {/* Applied Price (big) */}
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1.25, textAlign: 'center',
                          borderColor: 'success.main',
                          borderWidth: 2,
                          bgcolor: 'success.50',
                        }}
                      >
                        <Typography variant="caption" color="success.dark" display="block" fontWeight={600}>
                          {currentStrategy.label}
                          {currentStrategy.needsPct ? ` (${strategyPct}%)` : ''}
                        </Typography>
                        <Typography variant="h5" fontWeight={800} color="success.dark">
                          {fmt(appliedPrice)}
                        </Typography>
                        {priceOverridden && (
                          <Typography variant="caption" color="warning.main">overridden</Typography>
                        )}
                      </Paper>
                    </Grid>
                  </Grid>
                </Box>

                <Divider />

                {/* Editable fields row */}
                <Stack direction="row" spacing={1.5} flexWrap="wrap">
                  <TextField
                    label="Price"
                    value={editPrice}
                    onChange={e => {
                      setEditPrice(e.target.value);
                      setPriceOverridden(true);
                    }}
                    type="number"
                    inputProps={{ min: 0.01, step: 0.01 }}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    }}
                    size="small"
                    sx={{ width: 140 }}
                  />

                  <FormControl size="small" sx={{ width: 150 }}>
                    <InputLabel>Condition</InputLabel>
                    <Select
                      value={editCondition}
                      label="Condition"
                      onChange={e => setEditCondition(e.target.value)}
                    >
                      {CONDITION_OPTIONS.map(o => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <TextField
                    label="Location (optional)"
                    value={editLocation}
                    onChange={e => setEditLocation(e.target.value)}
                    size="small"
                    placeholder="e.g. Aisle 3"
                    sx={{ width: 200 }}
                  />
                </Stack>

                {/* Comparables — shown if estimate has them */}
                {suggested?.comparables && suggested.comparables.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                      Similar sold items
                    </Typography>
                    <Stack spacing={0.25}>
                      {suggested.comparables.slice(0, 3).map((c, i) => (
                        <Stack key={i} direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" fontFamily="monospace" color="text.disabled" width={90}>
                            {c.sku}
                          </Typography>
                          <Typography variant="caption" flex={1} noWrap>
                            {c.title}
                          </Typography>
                          <Typography variant="caption" fontWeight={700} color="success.dark">
                            {fmt(c.sold_for)}
                          </Typography>
                          <Typography variant="caption" color="text.disabled">
                            {c.sold_at}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </Box>
                )}

                {/* Action row — confirm button only shown in manual mode */}
                <Stack direction="row" justifyContent="flex-end" spacing={1.5} pt={0.5}>
                  <Button onClick={clearItem} color="inherit" disabled={createLoading} size="small">
                    Skip
                  </Button>
                  {autoPrint ? (
                    <Chip
                      icon={<CheckCircle />}
                      label="Will create + print on next scan"
                      color="primary"
                      variant="outlined"
                      size="medium"
                      sx={{ height: 40, fontSize: '0.85rem' }}
                    />
                  ) : (
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<SwapHoriz />}
                      onClick={handleCreate}
                      disabled={createLoading || !editPrice || Number(editPrice) <= 0}
                      size="large"
                      sx={{ minWidth: 220 }}
                    >
                      {createLoading ? 'Creating...' : 'Create DB3 Tag (no print)'}
                    </Button>
                  )}
                </Stack>
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* ── History Panel ── */}
      <Box mt={4}>
        <Typography variant="h6" fontWeight={700} mb={2}>
          Retag History
        </Typography>

        {/* Summary tiles */}
        <Stack direction="row" spacing={2} flexWrap="wrap" mb={2}>
          {[
            { label: 'Total Tagged (all time)', value: historyData?.total_retagged ?? '—' },
            { label: 'Sum DB2 Price', value: historyData ? fmt(parseFloat(historyData.sum_price)) : '—' },
            { label: 'Sum Retail', value: historyData ? fmt(parseFloat(historyData.sum_retail)) : '—' },
            { label: 'Tags this visit', value: history.length },
          ].map(tile => (
            <Paper
              key={tile.label}
              variant="outlined"
              sx={{ px: 2.5, py: 1.5, minWidth: 140, textAlign: 'center' }}
            >
              <Typography variant="caption" color="text.secondary" display="block">
                {tile.label}
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {tile.value}
              </Typography>
            </Paper>
          ))}
        </Stack>

        {/* Search + Session Toggle */}
        <Stack direction="row" spacing={2} alignItems="center" mb={1.5}>
          <TextField
            size="small"
            label="Search old SKU or title"
            value={historySearch}
            disabled={sessionOnly}
            onChange={e => {
              const val = e.target.value;
              setHistorySearch(val);
              setHistoryPage(1);
              if (historySearchTimerRef.current) clearTimeout(historySearchTimerRef.current);
              historySearchTimerRef.current = setTimeout(() => {
                fetchHistory(1, val, sessionOnlyRef.current);
              }, 300);
            }}
            sx={{ width: 300 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={sessionOnly}
                onChange={e => {
                  const val = e.target.checked;
                  setSessionOnly(val);
                  setHistoryPage(1);
                  setHistorySearch('');
                  fetchHistory(1, '', val);
                }}
                size="small"
              />
            }
            label={
              <Typography variant="body2">
                Today only (local day)
                {sessionOnly && historyData != null && (
                  <Typography component="span" variant="caption" color="text.secondary" ml={0.5}>
                    ({historyData.count} since midnight local)
                  </Typography>
                )}
              </Typography>
            }
          />
          {historyLoading && (
            <Typography variant="caption" color="text.secondary">Loading...</Typography>
          )}
        </Stack>

        {historyError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setHistoryError(null)}>
            {historyError}
          </Alert>
        )}

        {/* Table */}
        <Paper variant="outlined">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Old SKU</TableCell>
                <TableCell>New SKU</TableCell>
                <TableCell>Title</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Retail</TableCell>
                <TableCell>Tagged At</TableCell>
                <TableCell width={48} />
              </TableRow>
            </TableHead>
            <TableBody>
              {historyData && historyData.results.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No retag events yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {historyData?.results.map(row => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Typography variant="caption" fontFamily="monospace">{row.legacy_sku}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" fontFamily="monospace" color="primary.main">
                      {row.new_item_sku}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" noWrap sx={{ maxWidth: 300, display: 'block' }}>
                      {row.title}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption" fontWeight={700}>{fmt(parseFloat(row.price))}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption" color="text.secondary">
                      {row.retail_amt ? fmt(parseFloat(row.retail_amt)) : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {format(new Date(row.retagged_at), 'MMM d, h:mm:ss a')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={`Reprint label for ${row.new_item_sku}`}>
                      <IconButton
                        size="small"
                        onClick={() =>
                          localPrintService
                            .printLabel({
                              qr_data: row.new_item_sku,
                              text: `$${parseFloat(row.price).toFixed(2)}`,
                              product_title: row.title,
                              include_text: true,
                            })
                            .then(() =>
                              enqueueSnackbar(`Reprinted ${row.new_item_sku}`, {
                                variant: 'success',
                                autoHideDuration: 2000,
                              }),
                            )
                            .catch(() =>
                              enqueueSnackbar('Print server offline', {
                                variant: 'warning',
                                autoHideDuration: 3000,
                              }),
                            )
                        }
                      >
                        <PrintOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        {/* Pagination */}
        {historyData && historyData.num_pages > 1 && (
          <Stack alignItems="center" mt={1.5}>
            <Pagination
              count={historyData.num_pages}
              page={historyPage}
              onChange={(_e, p) => {
                setHistoryPage(p);
                fetchHistory(p, historySearch, sessionOnly);
              }}
              size="small"
              color="primary"
            />
          </Stack>
        )}
      </Box>
    </Box>
  );
}
