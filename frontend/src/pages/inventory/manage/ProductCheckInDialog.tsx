import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import type { Product } from '../../../types/inventory.types';
import type { ItemCondition } from '../../../types/inventory.types';
import type { ProductCheckInOrderOption } from '../../../api/inventory.api';
import { ProductDisplayLine } from '../../../components/inventory/ProductDisplayLine';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useProductCheckIn, useProductCheckInOrders } from '../../../hooks/useInventory';
import { printedPreviewToLabelInputs } from '../../../hooks/useProcessingWorkspace';
import { LargeCheckInConfirmDialog } from '../processing/LargeCheckInConfirmDialog';
import { isLargeCheckIn } from '../processing/largeCheckIn';
import { printProcessingLabelsAndMarkPrinted } from '../processing/printProcessingLabel';
import {
  normalizeProcessingCondition,
  PROCESSING_ITEM_CONDITION_OPTIONS,
  PROCESSING_ITEM_DEFAULT_CONDITION,
  PROCESSING_ITEM_DISPATCH_OPTIONS,
} from '../processing/processingItemFormOptions';
import { manageItemsSearchUrl } from '../../../utils/richInventorySearch';
import { processingTokens } from '../processing/processingTokens';

const LS_PRINT_ON_CHECKIN = 'productCheckIn.printLabels';
const MAX_IDS_IN_URL = 150;

function readPrintPref(): boolean {
  try {
    const v = localStorage.getItem(LS_PRINT_ON_CHECKIN);
    if (v === null) return true;
    return v === 'true' || v === '1';
  } catch {
    return true;
  }
}

function parseCheckInQuantity(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function formatOrderOrderedDate(value: string | null): string {
  if (!value) return 'date unknown';
  const d = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function orderOptionLabel(option: ProductCheckInOrderOption): string {
  const suffix = option.is_default ? ' (default)' : '';
  return `${option.order_number} · ordered ${formatOrderOrderedDate(option.ordered_date)}${suffix}`;
}

function isValidPrice(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0;
}

export interface ProductCheckInSuccessResult {
  created_count: number;
  item_check_in_id: number | null;
  created_item_ids: number[];
}

export interface ProductCheckInDialogProps {
  open: boolean;
  product: Product;
  loading?: boolean;
  onClose: () => void;
  /** Return to product CRUD without closing the parent product modal. */
  onOpenProduct: () => void;
  /** When set (workbench embedded), skip navigate-to-manage and call this instead. */
  onSuccess?: (result: ProductCheckInSuccessResult) => void;
}

export function ProductCheckInDialog({
  open,
  product,
  loading: parentLoading = false,
  onClose,
  onOpenProduct,
  onSuccess,
}: ProductCheckInDialogProps) {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const checkInMutation = useProductCheckIn();

  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState<ItemCondition>(PROCESSING_ITEM_DEFAULT_CONDITION);
  const [dispatch, setDispatch] = useState('on_shelf');
  const [price, setPrice] = useState('');
  const [retail, setRetail] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<ProductCheckInOrderOption | null>(null);
  const [orderSearch, setOrderSearch] = useState('');
  const [volumeConfirm, setVolumeConfirm] = useState<boolean | null>(null);
  const [retailConfirmOpen, setRetailConfirmOpen] = useState(false);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [priceTouched, setPriceTouched] = useState(false);

  const debouncedOrderSearch = useDebouncedValue(orderSearch, 300);
  const ordersQuery = useProductCheckInOrders(debouncedOrderSearch, open);
  const orderOptions = ordersQuery.data ?? [];

  const qtyValue = useMemo(() => parseCheckInQuantity(quantity), [quantity]);
  const salvageLocked = condition === 'salvage';
  const busy = parentLoading || checkInMutation.isPending;

  useEffect(() => {
    if (!open) return;
    setQuantity('1');
    setCondition(PROCESSING_ITEM_DEFAULT_CONDITION);
    setDispatch('on_shelf');
    setPrice('');
    setRetail('');
    setNotes('');
    setSelectedOrder(null);
    setOrderSearch('');
    setVolumeConfirm(null);
    setRetailConfirmOpen(false);
    setPendingPrint(false);
    setPriceTouched(false);
  }, [open, product.id]);

  useEffect(() => {
    if (!open || selectedOrder || !orderOptions.length) return;
    const defaultOrder = orderOptions.find((o) => o.is_default) ?? orderOptions[0];
    if (defaultOrder) setSelectedOrder(defaultOrder);
  }, [open, orderOptions, selectedOrder]);

  useEffect(() => {
    if (salvageLocked && dispatch !== 'salvage') setDispatch('salvage');
  }, [salvageLocked, dispatch]);

  const buildPayload = () => {
    if (!selectedOrder || !isValidPrice(price)) return null;
    return {
      quantity: qtyValue,
      purchase_order: selectedOrder.id,
      price: price.trim(),
      retail: retail.trim() || undefined,
      condition,
      dispatch: salvageLocked ? 'salvage' : dispatch,
      notes: notes.trim() || undefined,
    };
  };

  const continueCheckIn = (doPrint: boolean) => {
    if (!retail.trim()) {
      setPendingPrint(doPrint);
      setRetailConfirmOpen(true);
      return;
    }
    void runCheckIn(doPrint);
  };

  const runCheckIn = async (doPrint: boolean) => {
    const payload = buildPayload();
    if (!payload) {
      if (!selectedOrder) {
        enqueueSnackbar('Select a purchase order', { variant: 'warning' });
      } else {
        enqueueSnackbar('Shelf price is required', { variant: 'warning' });
      }
      return;
    }
    try {
      localStorage.setItem(LS_PRINT_ON_CHECKIN, String(doPrint));
      const data = await checkInMutation.mutateAsync({ productId: product.id, payload });
      if (doPrint && data.printed_items_preview?.length) {
        const result = await printProcessingLabelsAndMarkPrinted(
          printedPreviewToLabelInputs(data.printed_items_preview),
        );
        if (result.failed > 0) {
          enqueueSnackbar(`Checked in ${data.created_count}; ${result.failed} label(s) failed`, { variant: 'warning' });
        } else if (result.succeeded > 0) {
          enqueueSnackbar(`Checked in ${data.created_count} and printed ${result.succeeded} label(s)`, { variant: 'success' });
        }
        if (result.markFailed) {
          enqueueSnackbar('Labels printed but printed status could not be saved.', { variant: 'warning' });
        }
      } else {
        enqueueSnackbar(`Checked in ${data.created_count} item(s)`, { variant: 'success' });
      }
      if (onSuccess) {
        onSuccess({
          created_count: data.created_count,
          item_check_in_id: data.item_check_in_id ?? null,
          created_item_ids: data.created_item_ids ?? [],
        });
      } else {
        const filters: Record<string, string | number> = { product: product.id };
        if (data.item_check_in_id) {
          filters.checkin = data.item_check_in_id;
        } else if (
          data.created_item_ids.length > 0
          && data.created_item_ids.length <= MAX_IDS_IN_URL
        ) {
          filters.ids = data.created_item_ids.join(',');
        }
        navigate(manageItemsSearchUrl({ filters }));
      }
      onClose();
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      enqueueSnackbar(detail || 'Check-in failed', { variant: 'error' });
    }
  };

  const handleSubmit = (doPrint: boolean) => {
    if (!selectedOrder) {
      enqueueSnackbar('Select a purchase order', { variant: 'warning' });
      return;
    }
    setPriceTouched(true);
    if (!isValidPrice(price)) {
      enqueueSnackbar('Shelf price is required', { variant: 'warning' });
      return;
    }
    if (isLargeCheckIn(qtyValue)) {
      setVolumeConfirm(doPrint);
      return;
    }
    continueCheckIn(doPrint);
  };

  const priceError = priceTouched && !isValidPrice(price);
  const canSubmit = Boolean(selectedOrder) && isValidPrice(price) && !busy;

  return (
    <>
      <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <IconButton
              size="small"
              aria-label="Open product"
              onClick={onOpenProduct}
              disabled={busy}
              sx={{ mt: 0.25 }}
            >
              <ArrowBackOutlinedIcon fontSize="small" />
            </IconButton>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Check in items
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Product is locked — edit identity from the product modal.
              </Typography>
            </Box>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Box
            sx={{
              p: 1.5,
              mb: 2,
              border: 1,
              borderColor: processingTokens.border,
              borderRadius: 1.5,
              bgcolor: '#f8faf8',
            }}
          >
            <ProductDisplayLine product={product} variant="selected" />
            {product.model?.trim() ?
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                Model: {product.model}
              </Typography>
            : null}
            {product.category_name ?
              <Typography variant="caption" color="text.secondary" display="block">
                Category: {product.category_name}
              </Typography>
            : null}
          </Box>

          <Stack spacing={2}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 1.5 }}>
              <Autocomplete
                size="small"
                options={orderOptions}
                value={selectedOrder}
                onChange={(_, value) => setSelectedOrder(value)}
                inputValue={orderSearch}
                onInputChange={(_, value) => setOrderSearch(value)}
                getOptionLabel={orderOptionLabel}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                loading={ordersQuery.isFetching}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Purchase order"
                    required
                    helperText={
                      selectedOrder
                        ? [selectedOrder.hint, `Ordered ${formatOrderOrderedDate(selectedOrder.ordered_date)}`]
                            .filter(Boolean)
                            .join(' · ')
                        : 'Default misfit / manual check-in orders shown first'
                    }
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {option.order_number}
                        {option.is_default ? ' (default)' : ''}
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                          {' '}
                          · ordered {formatOrderOrderedDate(option.ordered_date)}
                        </Typography>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[option.vendor_name, option.hint].filter(Boolean).join(' · ')}
                      </Typography>
                    </Box>
                  </li>
                )}
              />
              <TextField
                size="small"
                label="Quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
                onBlur={() => setQuantity(String(parseCheckInQuantity(quantity)))}
                inputProps={{ inputMode: 'numeric', min: 1 }}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField
                select
                size="small"
                label="Condition"
                value={condition}
                onChange={(e) => setCondition(normalizeProcessingCondition(e.target.value))}
              >
                {PROCESSING_ITEM_CONDITION_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Dispatch / location"
                value={salvageLocked ? 'salvage' : dispatch}
                onChange={(e) => setDispatch(e.target.value)}
                disabled={salvageLocked}
              >
                {PROCESSING_ITEM_DISPATCH_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Price"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onBlur={() => setPriceTouched(true)}
                error={priceError}
                helperText={priceError ? 'Enter a shelf price before check-in' : undefined}
                inputProps={{ inputMode: 'decimal' }}
              />
              <TextField
                size="small"
                label="Retail / cost basis"
                value={retail}
                onChange={(e) => setRetail(e.target.value)}
                helperText="Recommended — you can check in without it"
                inputProps={{ inputMode: 'decimal' }}
              />
              <TextField
                size="small"
                label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                multiline
                minRows={2}
                sx={{ gridColumn: '1 / -1' }}
              />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1, gap: 0.75, borderTop: 1, borderColor: processingTokens.border, flexWrap: 'wrap' }}>
          <Button onClick={onClose} disabled={busy} sx={{ mr: 'auto' }}>
            Cancel
          </Button>
          <Button variant="outlined" disabled={!canSubmit} onClick={() => handleSubmit(false)}>
            Check in without printing
          </Button>
          <Button
            variant="contained"
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <LocalPrintshop />}
            disabled={!canSubmit}
            onClick={() => handleSubmit(true)}
          >
            Check in & print
          </Button>
        </DialogActions>
      </Dialog>

      <LargeCheckInConfirmDialog
        open={volumeConfirm != null}
        quantity={qtyValue}
        printLabels={volumeConfirm === true}
        loading={busy}
        onCancel={() => setVolumeConfirm(null)}
        onConfirm={() => {
          const doPrint = volumeConfirm === true;
          setVolumeConfirm(null);
          continueCheckIn(doPrint);
        }}
      />

      <ConfirmDialog
        open={retailConfirmOpen}
        title="Check in without retail?"
        message="Retail / cost basis is empty. Check in anyway, or go back and add a retail value for margin tracking."
        confirmLabel="Check in anyway"
        cancelLabel="Go back"
        severity="warning"
        loading={busy}
        onCancel={() => setRetailConfirmOpen(false)}
        onConfirm={() => {
          setRetailConfirmOpen(false);
          void runCheckIn(pendingPrint);
        }}
      />
    </>
  );
}
