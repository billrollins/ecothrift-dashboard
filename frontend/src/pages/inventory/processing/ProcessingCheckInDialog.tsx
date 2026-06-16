import Close from '@mui/icons-material/Close';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import Remove from '@mui/icons-material/Remove';
import Add from '@mui/icons-material/Add';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState, type WheelEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProduct } from '../../../api/inventory.api';
import type {
  ItemCheckInDTO,
  ItemCondition,
  ItemStatus,
  ProcessingWorkspaceItemDTO,
  ProcessingWorkspaceProductDTO,
  ProcessingWorkspaceRowDTO,
} from '../../../types/inventory.types';
import { preventWheelChangeNumber } from '../../../utils/formInputs';
import {
  CheckInDetailFieldsSection,
  CheckInFinalizeHint,
  CheckInFormActionRow,
  isValidCheckInPrice,
} from '../workbench/CheckInDetailsLayout';
import {
  normalizeProcessingCondition,
  PROCESSING_ITEM_DEFAULT_CONDITION,
} from './processingItemFormOptions';
import { effectiveRowQty } from './processingQueueCellText';
import { LargeCheckInConfirmDialog } from './LargeCheckInConfirmDialog';
import { isLargeCheckIn, MAX_CHECK_IN_QUANTITY } from './largeCheckIn';
import { processingTokens } from './processingTokens';
import { useWorkbenchConfirmDialog } from '../workbench/useWorkbenchConfirmDialog';

const MAX_CHECK_IN_QTY = MAX_CHECK_IN_QUANTITY;

function parseCheckInQuantity(raw: string): number {
  return Math.max(1, Math.min(MAX_CHECK_IN_QTY, Number.parseInt(raw, 10) || 1));
}

function strDefault(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

function productCategory(product: ProductLike | null | undefined): string {
  if (!product) return '';
  if (typeof product.category === 'number') return 'category_name' in product ? product.category_name || '' : '';
  return product.category || '';
}

type ProductLike = ProcessingWorkspaceProductDTO | Awaited<ReturnType<typeof getProduct>>['data'];

function productLabel(product: ProductLike | null | undefined): string {
  if (!product) return 'Attached product';
  const number = product.product_number || `#${product.id}`;
  return `${number} · ${product.title}`;
}

function QuantityControl({
  quantity,
  disabled,
  onChange,
  onBlur,
  onBump,
}: {
  quantity: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
  onBump: (delta: number) => void;
}) {
  const qtyValue = quantity.trim() === '' ? 0 : parseCheckInQuantity(quantity);

  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'inline-flex',
        alignItems: 'stretch',
        borderColor: processingTokens.border,
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: processingTokens.surfaceRaised,
      }}
    >
      <IconButton
        size="small"
        aria-label="Decrease quantity"
        disabled={disabled || qtyValue <= 1}
        onClick={() => onBump(-1)}
        sx={{ width: 34, borderRadius: 0, borderRight: 1, borderColor: processingTokens.border }}
      >
        <Remove sx={{ fontSize: 16 }} />
      </IconButton>
      <Box
        component="input"
        value={quantity}
        aria-label="Quantity"
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value.replace(/[^0-9]/g, ''))}
        onBlur={onBlur}
        onWheel={(event: WheelEvent<HTMLInputElement>) => preventWheelChangeNumber(event)}
        sx={{
          width: 64,
          border: 0,
          outline: 0,
          textAlign: 'center',
          fontSize: 22,
          fontWeight: 900,
          py: 0.65,
          fontVariantNumeric: 'tabular-nums',
          bgcolor: processingTokens.surfaceRaised,
          color: 'text.primary',
        }}
      />
      <IconButton
        size="small"
        aria-label="Increase quantity"
        disabled={disabled || qtyValue >= MAX_CHECK_IN_QTY}
        onClick={() => onBump(1)}
        sx={{ width: 34, borderRadius: 0, borderLeft: 1, borderColor: processingTokens.border }}
      >
        <Add sx={{ fontSize: 16 }} />
      </IconButton>
    </Paper>
  );
}

export interface ProcessingCheckInSeed {
  item: ProcessingWorkspaceItemDTO;
  itemCheckIn: ItemCheckInDTO | null;
}

export interface ProcessingCheckInDialogProps {
  open: boolean;
  row: ProcessingWorkspaceRowDTO;
  loading: boolean;
  initialProductId?: number | null;
  seed?: ProcessingCheckInSeed | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>, options: { printLabels: boolean }) => Promise<boolean>;
  onUpdateItemCheckIn?: (itemCheckInId: number, payload: Record<string, unknown>, options: { printLabels: boolean }) => Promise<boolean>;
}

export function ProcessingCheckInDialog({
  open,
  row,
  loading,
  initialProductId = null,
  seed = null,
  onClose,
  onSubmit,
  onUpdateItemCheckIn,
}: ProcessingCheckInDialogProps) {
  const editCheckIn = seed?.itemCheckIn && onUpdateItemCheckIn ? seed.itemCheckIn : null;
  const isEditMode = editCheckIn != null;
  const originalQty = editCheckIn?.quantity ?? 0;

  const seededProduct = editCheckIn?.product ?? null;
  const rowProduct = row.product ?? null;
  const productId = seededProduct?.id ?? initialProductId ?? rowProduct?.id ?? null;
  const productQuery = useQuery({
    queryKey: ['products', 'processing-check-in-dialog', productId],
    queryFn: async () => (await getProduct(productId!)).data,
    enabled: open && productId != null && seededProduct == null && rowProduct?.id !== productId,
  });
  const product = seededProduct ?? (rowProduct?.id === productId ? rowProduct : null) ?? productQuery.data ?? null;

  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState<ItemCondition>(PROCESSING_ITEM_DEFAULT_CONDITION);
  const [status, setStatus] = useState<ItemStatus>('on_shelf');
  const [dispatch, setDispatch] = useState(row.dispatch || 'on_shelf');
  const [retail, setRetail] = useState(row.unitRetail ?? '');
  const [price, setPrice] = useState(row.price ?? '');
  const [notes, setNotes] = useState('');
  const [specifications, setSpecifications] = useState<Record<string, string>>({});
  const [volumeConfirm, setVolumeConfirm] = useState<boolean | null>(null);
  const { confirm, ConfirmDialogHost } = useWorkbenchConfirmDialog();

  const qtyValue = useMemo(() => parseCheckInQuantity(quantity), [quantity]);
  const qtyDelta = isEditMode ? qtyValue - originalQty : 0;
  const effQty = effectiveRowQty(row);
  const qtyLeftAfter = Math.max(0, effQty.remaining - qtyValue);
  const salvageLocked = condition === 'salvage';
  const busy = loading || productQuery.isFetching;

  useEffect(() => {
    if (!open) return;
    const defaults = seed?.itemCheckIn?.defaults ?? {};
    setQuantity(editCheckIn ? String(editCheckIn.quantity) : '1');
    setCondition(normalizeProcessingCondition(seed?.item.condition || seed?.item.condition_label || row.condition));
    setStatus((seed?.item.status as ItemStatus | undefined) || 'on_shelf');
    setDispatch(seed?.item.dispatch || strDefault(defaults.dispatch) || row.dispatch || 'on_shelf');
    setRetail(seed?.item.retail ?? (strDefault(defaults.retail) || row.unitRetail || ''));
    setPrice(seed?.item.price ?? (strDefault(defaults.price) || row.price || ''));
    setNotes(strDefault(defaults.notes) || seed?.item.notes || row.manifestNotes || '');
    setSpecifications((defaults.specifications as Record<string, string> | undefined) ?? {});
    setVolumeConfirm(null);
  }, [open, seed, editCheckIn, row]);

  useEffect(() => {
    if (salvageLocked) setDispatch('salvage');
  }, [salvageLocked]);

  function handleQuantityBlur() {
    setQuantity((prev) => String(parseCheckInQuantity(prev)));
  }

  function bumpQuantity(delta: number) {
    setQuantity(String(parseCheckInQuantity(String(Math.max(0, qtyValue || 1) + delta))));
  }

  function buildPayload(): Record<string, unknown> {
    return {
      product_mode: 'existing',
      product_id: productId,
      quantity: qtyValue,
      condition,
      status,
      dispatch: salvageLocked ? 'salvage' : dispatch,
      retail: retail || undefined,
      price: price || undefined,
      notes,
      specifications,
    };
  }

  async function doSubmit(printLabels: boolean) {
    if (productId == null) return;
    const ok = await onSubmit(buildPayload(), { printLabels });
    if (ok) onClose();
  }

  async function submitEdit(printLabels: boolean) {
    if (!editCheckIn || !onUpdateItemCheckIn) return;
    if (qtyDelta > 0) {
      const ok = await confirm({
        title: 'Add items?',
        message: `Add ${qtyDelta.toLocaleString()} item${qtyDelta === 1 ? '' : 's'} to this check-in?`,
        confirmLabel: 'Add items',
        severity: 'warning',
      });
      if (!ok) return;
    } else if (qtyDelta < 0) {
      const n = -qtyDelta;
      const ok = await confirm({
        title: 'Remove items?',
        message: `Delete ${n.toLocaleString()} item${n === 1 ? '' : 's'} from this check-in? Their tags are removed from inventory.`,
        confirmLabel: 'Delete items',
        severity: 'error',
        confirmColor: 'error',
      });
      if (!ok) return;
    }
    const ok = await onUpdateItemCheckIn(editCheckIn.id, buildPayload(), { printLabels });
    if (ok) onClose();
  }

  async function submit(printLabels: boolean) {
    if (isEditMode) {
      await submitEdit(printLabels);
      return;
    }
    if (isLargeCheckIn(qtyValue)) {
      setVolumeConfirm(printLabels);
      return;
    }
    await doSubmit(printLabels);
  }

  const canSubmit = productId != null && isValidCheckInPrice(price) && !busy;

  return (
    <>
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          width: 'min(920px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 48px)',
          overflow: 'hidden',
          borderRadius: 3,
        },
      }}
    >
      <DialogTitle sx={{ px: 2.75, py: 1.5, borderBottom: 1, borderColor: processingTokens.border }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
              {isEditMode ? `Edit check-in #${editCheckIn.id}` : 'Check in'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35, fontWeight: 700 }} noWrap>
              {productLabel(product)} · Row {row.rowNum}
            </Typography>
          </Box>
          {!isEditMode ?
            <Stack direction="row" spacing={0.75} sx={{ display: { xs: 'none', md: 'flex' } }}>
              <Paper variant="outlined" sx={{ px: 1, py: 0.55, borderColor: processingTokens.border }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase' }}>
                  Left after
                </Typography>
                <Typography sx={{ fontWeight: 900, color: qtyLeftAfter === 0 ? processingTokens.accentGreen : processingTokens.accentAmber }}>
                  {qtyLeftAfter}
                </Typography>
              </Paper>
            </Stack>
          : null}
          <IconButton aria-label="Close check-in" onClick={onClose} disabled={busy} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 2.75, bgcolor: processingTokens.cardDeckBg, overflow: 'auto' }}>
        {productId == null ?
          <Typography color="text.secondary">
            Attach a product to this row before checking in.
          </Typography>
        : (
          <Stack spacing={1.25}>
            <Paper variant="outlined" sx={{ p: 1.25, borderColor: processingTokens.border, bgcolor: processingTokens.surfaceRaised }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 800, textTransform: 'uppercase', mb: 0.35 }}>
                Product
              </Typography>
              <Typography sx={{ fontWeight: 900 }}>{productLabel(product)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {[product?.brand, product?.model, productCategory(product)].filter(Boolean).join(' · ') || 'Catalog product'}
              </Typography>
            </Paper>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', fontSize: '0.62rem', mb: 0.4 }}
                >
                  Quantity
                </Typography>
                <QuantityControl
                  quantity={quantity}
                  disabled={busy}
                  onChange={setQuantity}
                  onBlur={handleQuantityBlur}
                  onBump={bumpQuantity}
                />
              </Box>
              {isEditMode && qtyDelta !== 0 ?
                <Typography variant="body2" sx={{ color: qtyDelta > 0 ? processingTokens.accentGreen : 'error.main', fontWeight: 800 }}>
                  {qtyDelta > 0 ?
                    `Will ADD ${qtyDelta} item${qtyDelta === 1 ? '' : 's'} to this check-in (you'll confirm).`
                  : `Will DELETE ${-qtyDelta} item${qtyDelta === -1 ? '' : 's'} from this check-in (you'll confirm).`}
                </Typography>
              : null}
            </Box>

            <CheckInFormActionRow left={!isEditMode ? <CheckInFinalizeHint /> : undefined} />
            <CheckInDetailFieldsSection
              price={price}
              onPriceChange={setPrice}
              retail={retail}
              onRetailChange={setRetail}
              condition={condition}
              onConditionChange={(next) => {
                setCondition(normalizeProcessingCondition(next));
                if (next === 'salvage') setDispatch('salvage');
              }}
              status={status}
              onStatusChange={setStatus}
              dispatch={dispatch}
              onDispatchChange={setDispatch}
              specifications={specifications}
              onSpecificationsChange={setSpecifications}
              notes={notes}
              onNotesChange={setNotes}
              specsHelperText="Supplements product catalog specs; saved on each item in this check-in."
              disabled={busy}
              highlightRequired={!isEditMode}
            />
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.75, py: 1.25, gap: 1, borderTop: 1, borderColor: processingTokens.border, flexWrap: 'wrap' }}>
        <Button onClick={onClose} disabled={busy} sx={{ mr: 'auto' }}>
          Cancel
        </Button>
        {isEditMode ?
          <>
            {qtyDelta > 0 ?
              <Button variant="outlined" startIcon={<LocalPrintshop />} disabled={!canSubmit} onClick={() => void submit(true)}>
                Save & print {qtyDelta} new label{qtyDelta === 1 ? '' : 's'}
              </Button>
            : null}
            <Button variant="contained" disabled={!canSubmit} onClick={() => void submit(false)}>
              Save changes
            </Button>
          </>
        : <>
            <Button variant="outlined" disabled={!canSubmit} onClick={() => void submit(false)}>
              Check in without printing
            </Button>
            <Button variant="contained" startIcon={<LocalPrintshop />} disabled={!canSubmit} onClick={() => void submit(true)}>
              Check in & print
            </Button>
          </>}
      </DialogActions>
    </Dialog>

      <LargeCheckInConfirmDialog
        open={volumeConfirm != null}
        quantity={qtyValue}
        printLabels={volumeConfirm === true}
        loading={loading}
        onCancel={() => setVolumeConfirm(null)}
        onConfirm={() => {
          const printLabels = volumeConfirm === true;
          setVolumeConfirm(null);
          void doSubmit(printLabels);
        }}
      />
      {ConfirmDialogHost}
    </>
  );
}
