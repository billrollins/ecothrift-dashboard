import { useState, useCallback, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LocalOffer from '@mui/icons-material/LocalOffer';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import ArrowDownward from '@mui/icons-material/ArrowDownward';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { useSnackbar } from 'notistack';
import {
  getItems,
  quickReprice,
  duplicateItemForResale,
  markSoldItemOnShelf,
} from '../../api/inventory.api';
import type { Item, ItemStatus } from '../../types/inventory.types';
import { localPrintService } from '../../services/localPrintService';
import { useAuth } from '../../contexts/AuthContext';

const QUICK_REPRICE_ALLOWED_STATUSES = new Set<ItemStatus>([
  'intake',
  'processing',
  'on_shelf',
  'returned',
]);

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface RepriceResult {
  sku: string;
  title: string;
  status?: string;
  old_price: string;
  new_price: string;
  discount_amount: string;
  discount_type: string;
}

interface SessionEntry {
  id: number;
  sku: string;
  title: string;
  new_price: string;
}

const QUICK_REPRICE_SESSION_STORAGE_KEY = 'ecothrift_quick_reprice_session_v1';

/** Local calendar date YYYY-MM-DD (midnight boundary follows this machine's local timezone). */
function getLocalDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadPersistedSession(): { entries: SessionEntry[]; savings: number } {
  try {
    const raw = localStorage.getItem(QUICK_REPRICE_SESSION_STORAGE_KEY);
    if (!raw) return { entries: [], savings: 0 };
    const parsed = JSON.parse(raw) as {
      date?: string;
      entries?: SessionEntry[];
      sessionSavings?: number;
    };
    const today = getLocalDateKey();
    if (parsed.date !== today) return { entries: [], savings: 0 };
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      savings: Number(parsed.sessionSavings) || 0,
    };
  } catch {
    return { entries: [], savings: 0 };
  }
}

export default function QuickRepricePage() {
  const { enqueueSnackbar } = useSnackbar();
  const { hasRole } = useAuth();
  const isManager = hasRole('Manager') || hasRole('Admin');
  const [searchParams, setSearchParams] = useSearchParams();

  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('10');
  const [minPrice, setMinPrice] = useState('0.50');
  const [skuInput, setSkuInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<RepriceResult | null>(null);
  const [sessionEntries, setSessionEntries] = useState<SessionEntry[]>(
    () => loadPersistedSession().entries,
  );
  const [sessionSavings, setSessionSavings] = useState(
    () => loadPersistedSession().savings,
  );
  const [sessionListOpen, setSessionListOpen] = useState(false);
  const [error, setError] = useState('');
  const [resolvedPreview, setResolvedPreview] = useState<Pick<Item, 'sku' | 'title' | 'status'> | null>(null);

  const [soldDialogOpen, setSoldDialogOpen] = useState(false);
  const [blockedItem, setBlockedItem] = useState<Item | null>(null);
  const [soldDialogBusy, setSoldDialogBusy] = useState(false);
  const [soldDialogError, setSoldDialogError] = useState('');

  const skuRef = useRef<HTMLInputElement>(null);
  /** Calendar day `sessionEntries` / savings belong to; rolls over at local midnight. */
  const sessionDateRef = useRef<string>(getLocalDateKey());

  const rolloverIfNeeded = useCallback(() => {
    const today = getLocalDateKey();
    if (sessionDateRef.current !== today) {
      sessionDateRef.current = today;
      setSessionEntries([]);
      setSessionSavings(0);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        QUICK_REPRICE_SESSION_STORAGE_KEY,
        JSON.stringify({
          date: getLocalDateKey(),
          entries: sessionEntries,
          sessionSavings,
        }),
      );
    } catch {
      // ignore quota / private mode
    }
  }, [sessionEntries, sessionSavings]);

  useEffect(() => {
    const tick = () => {
      const today = getLocalDateKey();
      if (sessionDateRef.current !== today) {
        sessionDateRef.current = today;
        setSessionEntries([]);
        setSessionSavings(0);
      }
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    skuRef.current?.focus();
  }, [lastResult, loading]);

  useEffect(() => {
    const skuParam = searchParams.get('sku');
    if (!skuParam?.trim()) return;
    setSkuInput(skuParam.trim().toUpperCase());
    const next = new URLSearchParams(searchParams);
    next.delete('sku');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const runQuickReprice = useCallback(
    async (item: Item) => {
      rolloverIfNeeded();
      const val = Number(discountValue);
      const { data: result } = await quickReprice(item.id, {
        discount_type: discountType,
        discount_value: val,
        min_price: Number(minPrice) || 0.50,
      });

      setLastResult({
        sku: result.sku,
        title: result.title,
        status: result.status ?? item.status,
        old_price: result.old_price,
        new_price: result.new_price,
        discount_amount: result.discount_amount,
        discount_type: result.discount_type,
      });
      setSessionEntries(prev => [
        {
          id: item.id,
          sku: result.sku,
          title: result.title,
          new_price: result.new_price,
        },
        ...prev,
      ]);
      setSessionSavings(s => s + Number(result.discount_amount));

      const printOk = await localPrintService
        .printLabel({
          qr_data: result.sku,
          text: `$${Number(result.new_price).toFixed(2)}`,
          product_title: result.title,
          product_brand: result.brand?.trim() || undefined,
          product_model: result.product_number?.trim() || undefined,
          include_text: true,
        })
        .then(() => true)
        .catch(() => false);

      if (!printOk) {
        enqueueSnackbar('Label printed — but print server may be offline', { variant: 'warning' });
      }
    },
    [discountType, discountValue, minPrice, enqueueSnackbar, rolloverIfNeeded],
  );

  const closeSoldDialog = useCallback(() => {
    setSoldDialogOpen(false);
    setBlockedItem(null);
    setSoldDialogError('');
    setSoldDialogBusy(false);
  }, []);

  const handleDuplicateForResale = useCallback(async () => {
    if (!blockedItem) return;
    setSoldDialogError('');
    setSoldDialogBusy(true);
    try {
      const { data: newItem } = await duplicateItemForResale(blockedItem.id);
      closeSoldDialog();
      setResolvedPreview({ sku: newItem.sku, title: newItem.title, status: newItem.status });
      enqueueSnackbar(`Created ${newItem.sku} — applying discount…`, { variant: 'info' });
      try {
        await runQuickReprice(newItem);
      } catch (repriceErr: unknown) {
        const axiosErr = repriceErr as { response?: { data?: { detail?: string } } };
        const detail = axiosErr?.response?.data?.detail;
        setError(typeof detail === 'string' ? detail : 'Discount could not be applied to the new item.');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      const detail = axiosErr?.response?.data?.detail;
      setSoldDialogError(typeof detail === 'string' ? detail : 'Could not create duplicate.');
    } finally {
      setSoldDialogBusy(false);
    }
  }, [blockedItem, closeSoldDialog, enqueueSnackbar, runQuickReprice]);

  const handleMarkOnShelf = useCallback(async () => {
    if (!blockedItem) return;
    setSoldDialogError('');
    setSoldDialogBusy(true);
    try {
      const { data: item } = await markSoldItemOnShelf(blockedItem.id);
      closeSoldDialog();
      setResolvedPreview({ sku: item.sku, title: item.title, status: item.status });
      enqueueSnackbar(`${item.sku} marked on shelf — applying discount…`, { variant: 'info' });
      try {
        await runQuickReprice(item);
      } catch (repriceErr: unknown) {
        const axiosErr = repriceErr as { response?: { data?: { detail?: string } } };
        const detail = axiosErr?.response?.data?.detail;
        setError(typeof detail === 'string' ? detail : 'Discount could not be applied.');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      const detail = axiosErr?.response?.data?.detail;
      setSoldDialogError(typeof detail === 'string' ? detail : 'Could not update item.');
    } finally {
      setSoldDialogBusy(false);
    }
  }, [blockedItem, closeSoldDialog, enqueueSnackbar, runQuickReprice]);

  const handleScan = useCallback(async () => {
    const raw = skuInput.trim();
    const sku = raw.toUpperCase();
    if (!raw) return;
    if (!discountValue || isNaN(Number(discountValue))) {
      setError('Set a discount value before scanning.');
      return;
    }
    const val = Number(discountValue);
    if (discountType === 'percent' && (val <= 0 || val > 100)) {
      setError('Percent discount must be between 1 and 100.');
      return;
    }
    if (val <= 0) {
      setError('Discount value must be greater than 0.');
      return;
    }

    setError('');
    setResolvedPreview(null);
    setLoading(true);
    setSkuInput('');

    try {
      const { data: listData } = await getItems({ sku, page_size: 5 });
      const rows = listData.results ?? [];
      const item = rows[0] as Item | undefined;

      if (!item) {
        setError(`Item not found: ${sku}`);
        setLoading(false);
        return;
      }

      setResolvedPreview({ sku: item.sku, title: item.title, status: item.status });

      if (item.status === 'sold') {
        setBlockedItem(item);
        setSoldDialogOpen(true);
        setLoading(false);
        return;
      }

      if (!QUICK_REPRICE_ALLOWED_STATUSES.has(item.status as ItemStatus)) {
        setError(
          `Cannot reprice — status is "${formatStatusLabel(item.status)}". ` +
            'Quick reprice only applies to intake, processing, on shelf, or returned items.',
        );
        setLoading(false);
        return;
      }

      await runQuickReprice(item);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      const detail = axiosErr?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Reprice failed.');
    } finally {
      setLoading(false);
      setTimeout(() => skuRef.current?.focus(), 50);
    }
  }, [skuInput, discountType, discountValue, minPrice, runQuickReprice]);

  const handleSkuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleScan();
  };

  const isConfigured = discountValue && !isNaN(Number(discountValue)) && Number(discountValue) > 0;

  return (
    <Box sx={{ p: 3, maxWidth: 680, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} mb={3}>
        <LocalOffer color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>Quick Reprice</Typography>
          <Typography variant="body2" color="text.secondary">
            Defaults to 10% off the current price — set discount in the panel below, then scan items to reprice and
            print labels automatically.
          </Typography>
        </Box>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} mb={2}>Discount Settings</Typography>

        <Stack spacing={2}>
          <RadioGroup
            row
            value={discountType}
            onChange={e => {
              const next = e.target.value as 'percent' | 'fixed';
              setDiscountType(next);
              if (next === 'percent') {
                setDiscountValue(v => (v.trim() === '' ? '10' : v));
              }
            }}
          >
            <FormControlLabel
              value="percent"
              control={<Radio />}
              label="% off current price (default 10%)"
            />
            <FormControlLabel value="fixed" control={<Radio />} label="Fixed amount off (e.g. $5.00)" />
          </RadioGroup>

          <Stack direction="row" spacing={2}>
            <TextField
              label={discountType === 'percent' ? 'Discount %' : 'Discount Amount ($)'}
              value={discountValue}
              onChange={e => setDiscountValue(e.target.value)}
              type="number"
              inputProps={{ min: 0.01, step: discountType === 'percent' ? 1 : 0.01 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    {discountType === 'percent' ? '%' : '$'}
                  </InputAdornment>
                ),
              }}
              sx={{ width: 180 }}
              size="small"
            />
            <TextField
              label="Minimum price floor ($)"
              value={minPrice}
              onChange={e => setMinPrice(e.target.value)}
              type="number"
              inputProps={{ min: 0, step: 0.01 }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              sx={{ width: 180 }}
              size="small"
              helperText="Won't discount below this"
            />
          </Stack>
        </Stack>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          p: 2.5, mb: 3,
          borderColor: isConfigured ? 'primary.main' : 'divider',
          borderWidth: isConfigured ? 2 : 1,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <QrCodeScanner color={isConfigured ? 'primary' : 'disabled'} sx={{ fontSize: 28 }} />
          <TextField
            inputRef={skuRef}
            fullWidth
            label="Scan barcode or type SKU"
            value={skuInput}
            onChange={e => setSkuInput(e.target.value)}
            onKeyDown={handleSkuKeyDown}
            disabled={!isConfigured || loading}
            placeholder={isConfigured ? 'Ready to scan...' : 'Set discount above first'}
            size="small"
          />
          <Button
            variant="contained"
            onClick={handleScan}
            disabled={!isConfigured || !skuInput.trim() || loading}
            sx={{ minWidth: 90 }}
          >
            {loading ? 'Repricing...' : 'Apply'}
          </Button>
        </Stack>
      </Paper>

      {resolvedPreview && (
        <Stack direction="row" alignItems="center" spacing={1} mb={2} flexWrap="wrap">
          <Typography variant="caption" color="text.secondary">Resolved:</Typography>
          <Typography variant="body2" fontWeight={600}>{resolvedPreview.title}</Typography>
          <Typography variant="caption" fontFamily="monospace">{resolvedPreview.sku}</Typography>
          <Chip size="small" label={formatStatusLabel(resolvedPreview.status)} variant="outlined" />
        </Stack>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {lastResult && (
        <Card variant="outlined" sx={{ mb: 3, borderColor: 'success.main', borderWidth: 2 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
              <CheckCircleOutline color="success" />
              <Typography variant="subtitle1" fontWeight={600} color="success.main">
                Repriced and label printed
              </Typography>
            </Stack>
            <Typography variant="body1" fontWeight={600} mb={0.5}>
              {lastResult.title}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
              <Typography variant="body2" color="text.secondary">
                SKU: {lastResult.sku}
              </Typography>
              {lastResult.status && (
                <Chip size="small" label={formatStatusLabel(lastResult.status)} variant="outlined" />
              )}
            </Stack>
            <Stack direction="row" spacing={3} alignItems="center">
              <Box textAlign="center">
                <Typography variant="caption" color="text.secondary">Old Price</Typography>
                <Typography variant="h6" sx={{ textDecoration: 'line-through', color: 'text.secondary' }}>
                  ${Number(lastResult.old_price).toFixed(2)}
                </Typography>
              </Box>
              <ArrowDownward color="success" sx={{ fontSize: 28 }} />
              <Box textAlign="center">
                <Typography variant="caption" color="success.main">New Price</Typography>
                <Typography variant="h4" fontWeight={700} color="success.main">
                  ${Number(lastResult.new_price).toFixed(2)}
                </Typography>
              </Box>
              <Box textAlign="center">
                <Typography variant="caption" color="text.secondary">Discount</Typography>
                <Typography variant="h6" color="error.main">
                  −${Number(lastResult.discount_amount).toFixed(2)}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      {sessionEntries.length > 0 && (
        <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 2, py: 1.5, pr: 1 }}
          >
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                This Session
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                This browser · today (local time) · new list after midnight
              </Typography>
            </Box>
            <IconButton
              size="small"
              aria-label={sessionListOpen ? 'Hide item list' : 'Show item list'}
              onClick={() => setSessionListOpen(o => !o)}
              sx={{
                transform: sessionListOpen ? 'rotate(180deg)' : 'none',
                transition: theme => theme.transitions.create('transform'),
              }}
            >
              <ExpandMore />
            </IconButton>
          </Stack>
          <Box sx={{ px: 2, pb: 2 }}>
            <Stack direction="row" spacing={4}>
              <Box>
                <Typography variant="h5" fontWeight={700}>{sessionEntries.length}</Typography>
                <Typography variant="caption" color="text.secondary">Items Repriced</Typography>
              </Box>
              <Box>
                <Typography variant="h5" fontWeight={700} color="error.main">
                  −${sessionSavings.toFixed(2)}
                </Typography>
                <Typography variant="caption" color="text.secondary">Total Discounted</Typography>
              </Box>
            </Stack>
          </Box>
          <Collapse in={sessionListOpen}>
            <List dense disablePadding sx={{ borderTop: 1, borderColor: 'divider' }}>
              {sessionEntries.map((row, index) => (
                <ListItem key={`${row.id}-${index}`} disablePadding>
                  <ListItemButton
                    component={Link}
                    to={`/inventory/items/${row.id}`}
                    sx={{ py: 1, px: 2 }}
                  >
                    <ListItemText
                      primary={
                        <Typography variant="body2" component="span" fontFamily="monospace">
                          {row.sku}
                        </Typography>
                      }
                      secondary={
                        <>
                          <Typography variant="caption" color="text.secondary" display="block" noWrap>
                            {row.title}
                          </Typography>
                          <Typography variant="body2" fontWeight={600} color="success.main" component="span">
                            ${Number(row.new_price).toFixed(2)}
                          </Typography>
                        </>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Collapse>
        </Paper>
      )}

      <Dialog open={soldDialogOpen} onClose={soldDialogBusy ? undefined : closeSoldDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Item is sold</DialogTitle>
        <DialogContent>
          {blockedItem && (
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              <Typography variant="body2">
                <strong>{blockedItem.title}</strong>
                {' '}
                <Typography component="span" fontFamily="monospace" variant="body2">{blockedItem.sku}</Typography>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Quick reprice cannot change the price on a unit that has already sold. Create a new shelf item
                copied from this record (same order / product links where applicable), or — if you are a manager
                and this sale was never completed on the register — mark this unit on shelf again.
              </Typography>
              {soldDialogError && (
                <Alert severity="warning" onClose={() => setSoldDialogError('')}>
                  {soldDialogError}
                </Alert>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, pb: 2 }}>
          <Button onClick={closeSoldDialog} disabled={soldDialogBusy}>
            Cancel
          </Button>
          {isManager && (
            <Button
              variant="outlined"
              onClick={handleMarkOnShelf}
              disabled={soldDialogBusy}
            >
              Mark on shelf again
            </Button>
          )}
          <Button
            variant="contained"
            onClick={handleDuplicateForResale}
            disabled={soldDialogBusy}
          >
            {soldDialogBusy ? 'Working…' : 'Create unsold copy & reprice'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
