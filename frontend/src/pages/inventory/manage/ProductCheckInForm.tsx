import { useEffect, useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';
import {
  Box,
  Button,
  CircularProgress,
  Stack,
} from '@mui/material';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import type { ItemCondition, Product } from '../../../types/inventory.types';
import type { ProductCheckInOrderOption } from '../../../api/inventory.api';
import { ProductDisplayLine } from '../../../components/inventory/ProductDisplayLine';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { useProductCheckIn } from '../../../hooks/useInventory';
import { printedPreviewToLabelInputs } from '../../../hooks/useProcessingWorkspace';
import { LargeCheckInConfirmDialog } from '../processing/LargeCheckInConfirmDialog';
import { isLargeCheckIn } from '../processing/largeCheckIn';
import { printProcessingLabelsAndMarkPrinted } from '../processing/printProcessingLabel';
import {
  normalizeProcessingCondition,
  PROCESSING_ITEM_DEFAULT_CONDITION,
} from '../processing/processingItemFormOptions';
import { processingTokens } from '../processing/processingTokens';
import { workbenchDetailTokens } from '../workbench/WorkbenchDetailShell';
import { CheckInDetailsEditor } from '../workbench/CheckInDetailsLayout';
import { ItemSpecificationsEditor, normalizeItemSpecObject } from '../workbench/ItemSpecificationsEditor';

const LS_PRINT_ON_CHECKIN = 'productCheckIn.printLabels';

function parseCheckInQuantity(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function isValidPrice(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0;
}

export interface ProductCheckInFormResult {
  created_count: number;
  item_check_in_id: number | null;
  created_item_ids: number[];
}

export interface ProductCheckInFormProps {
  product: Product;
  enabled?: boolean;
  showProductSummary?: boolean;
  onCancel?: () => void;
  onSuccess: (result: ProductCheckInFormResult) => void;
}

export function ProductCheckInForm({
  product,
  enabled = true,
  showProductSummary = true,
  onCancel,
  onSuccess,
}: ProductCheckInFormProps) {
  const { enqueueSnackbar } = useSnackbar();
  const checkInMutation = useProductCheckIn();

  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState<ItemCondition>(PROCESSING_ITEM_DEFAULT_CONDITION);
  const [dispatch, setDispatch] = useState('on_shelf');
  const [price, setPrice] = useState('');
  const [retail, setRetail] = useState('');
  const [notes, setNotes] = useState('');
  const [specifications, setSpecifications] = useState<Record<string, string>>({});
  const [selectedOrder, setSelectedOrder] = useState<ProductCheckInOrderOption | null>(null);
  const [volumeConfirm, setVolumeConfirm] = useState<boolean | null>(null);
  const [retailConfirmOpen, setRetailConfirmOpen] = useState(false);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [priceTouched, setPriceTouched] = useState(false);

  const qtyValue = useMemo(() => parseCheckInQuantity(quantity), [quantity]);
  const busy = checkInMutation.isPending;

  useEffect(() => {
    if (!enabled) return;
    setQuantity('1');
    setCondition(PROCESSING_ITEM_DEFAULT_CONDITION);
    setDispatch('on_shelf');
    setPrice('');
    setRetail('');
    setNotes('');
    setSpecifications(normalizeItemSpecObject(product.specifications));
    setSelectedOrder(null);
    setVolumeConfirm(null);
    setRetailConfirmOpen(false);
    setPendingPrint(false);
    setPriceTouched(false);
  }, [enabled, product.id]);

  const buildPayload = () => {
    if (!selectedOrder || !isValidPrice(price)) return null;
    return {
      quantity: qtyValue,
      purchase_order: selectedOrder.id,
      price: price.trim(),
      retail: retail.trim() || undefined,
      condition,
      dispatch: condition === 'salvage' ? 'salvage' : dispatch,
      notes: notes.trim() || undefined,
      specifications,
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
      if (!selectedOrder) enqueueSnackbar('Select a purchase order', { variant: 'warning' });
      else enqueueSnackbar('Shelf price is required', { variant: 'warning' });
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
      onSuccess({
        created_count: data.created_count,
        item_check_in_id: data.item_check_in_id ?? null,
        created_item_ids: data.created_item_ids ?? [],
      });
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Check-in failed', { variant: 'error' });
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
      {showProductSummary ?
        <Box
          sx={{
            p: 1.5,
            mb: 1.5,
            border: 1,
            borderColor: workbenchDetailTokens.borderSubtle,
            borderRadius: 1.5,
            bgcolor: '#f8faf8',
          }}
        >
          <ProductDisplayLine product={product} variant="selected" />
        </Box>
      : null}

      <CheckInDetailsEditor
        quantity={quantity}
        onQuantityChange={setQuantity}
        selectedOrder={selectedOrder}
        onOrderChange={setSelectedOrder}
        price={price}
        onPriceChange={setPrice}
        retail={retail}
        onRetailChange={setRetail}
        condition={condition}
        onConditionChange={(next) => setCondition(normalizeProcessingCondition(next))}
        dispatch={dispatch}
        onDispatchChange={setDispatch}
        notes={notes}
        onNotesChange={setNotes}
        priceRequired
        priceError={priceError}
        disabled={busy}
        autoSelectDefaultOrder
      />

      <ItemSpecificationsEditor
        value={specifications}
        onChange={setSpecifications}
        disabled={busy}
        helperText="Starts from product catalog specs - saved on each item as additions, not replacements."
      />

      <Stack direction="row" spacing={0.75} justifyContent="flex-end" sx={{ mt: 0.85 }}>
        {onCancel ?
          <Button size="small" variant="outlined" onClick={onCancel} disabled={busy} sx={{ mr: 'auto' }}>
            Cancel
          </Button>
        : null}
        <Button
          size="small"
          variant="outlined"
          onClick={() => handleSubmit(false)}
          disabled={!canSubmit}
        >
          Check in without printing
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={() => handleSubmit(true)}
          disabled={!canSubmit}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <LocalPrintshop />}
          sx={{
            bgcolor: processingTokens.primary,
            '&:hover': { bgcolor: processingTokens.primaryDark },
            fontWeight: 800,
          }}
        >
          Check in & print
        </Button>
      </Stack>

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
