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
  Alert,
  Chip,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProduct } from '../../../api/inventory.api';
import type {
  ItemCheckInDTO,
  ItemCondition,
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
  normalizeProcessingDispatch,
  PROCESSING_ITEM_DEFAULT_CONDITION,
} from './processingItemFormOptions';
import {
  ProcessingSendToRestorationDialog,
  buildRestorationCardItemFromProcessing,
} from './ProcessingSendToRestorationDialog';
import type { RestorationGradeConfig } from '../../restoration/tars/TarsGradeValuesCard';
import { scaleRowAmountForProductId } from './processingManifestAccounting';
import { effectiveRowQty } from './processingQueueCellText';
import { LargeCheckInConfirmDialog } from './LargeCheckInConfirmDialog';
import { isLargeCheckIn, MAX_CHECK_IN_QUANTITY } from './largeCheckIn';
import { processingTokens } from './processingTokens';
import { ProcessingCheckInEditStats, ProductSummaryCard } from './ProcessingCheckInEditStats';
import { useWorkbenchConfirmDialog } from '../workbench/useWorkbenchConfirmDialog';

const MAX_CHECK_IN_QTY = MAX_CHECK_IN_QUANTITY;

function parseCheckInQuantity(raw: string): number {
  return Math.max(1, Math.min(MAX_CHECK_IN_QTY, Number.parseInt(raw, 10) || 1));
}

function strDefault(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

type ProductLike = ProcessingWorkspaceProductDTO | Awaited<ReturnType<typeof getProduct>>['data'];

function productSummary(product: ProductLike | null | undefined) {
  if (!product) return null;
  return {
    id: product.id,
    product_number: product.product_number,
    title: product.title,
    brand: product.brand,
    model: product.model,
  };
}

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
        sx={{ width: 30, borderRadius: 0, borderRight: 1, borderColor: processingTokens.border }}
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
          width: 56,
          border: 0,
          outline: 0,
          textAlign: 'center',
          fontSize: 18,
          fontWeight: 900,
          py: 0.45,
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
        sx={{ width: 30, borderRadius: 0, borderLeft: 1, borderColor: processingTokens.border }}
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
  const [dispatch, setDispatch] = useState(row.dispatch || 'on_shelf');
  const [retail, setRetail] = useState(row.unitRetail ?? '');
  const [price, setPrice] = useState(row.price ?? '');
  const [notes, setNotes] = useState('');
  const [specifications, setSpecifications] = useState<Record<string, string>>({});
  const [volumeConfirm, setVolumeConfirm] = useState<boolean | null>(null);
  const [restorationDialogOpen, setRestorationDialogOpen] = useState(false);
  const [restorationConfig, setRestorationConfig] = useState<RestorationGradeConfig | null>(null);
  const dispatchBeforeRestorationRef = useRef('on_shelf');
  const { confirm, ConfirmDialogHost } = useWorkbenchConfirmDialog();

  const qtyValue = useMemo(() => parseCheckInQuantity(quantity), [quantity]);
  const qtyDelta = isEditMode ? qtyValue - originalQty : 0;
  const effQty = effectiveRowQty(row);
  const qtyLeftAfter = Math.max(0, effQty.remaining - qtyValue);
  const scaledRowRetail = useMemo(
    () => scaleRowAmountForProductId(row.unitRetail, productId, row.productLinks),
    [row.unitRetail, row.productLinks, productId],
  );
  const scaledRowPrice = useMemo(
    () => scaleRowAmountForProductId(row.price, productId, row.productLinks),
    [row.price, row.productLinks, productId],
  );
  const salvageLocked = condition === 'salvage';
  const busy = loading || productQuery.isFetching;

  useEffect(() => {
    if (!open) return;
    const defaults = seed?.itemCheckIn?.defaults ?? {};
    setQuantity(editCheckIn ? String(editCheckIn.quantity) : '1');
    setCondition(normalizeProcessingCondition(seed?.item.condition || seed?.item.condition_label || row.condition));
    setDispatch(seed?.item.dispatch || strDefault(defaults.dispatch) || row.dispatch || 'on_shelf');
    setRetail(seed?.item.retail ?? (strDefault(defaults.retail) || scaledRowRetail || ''));
    setPrice(seed?.item.price ?? (strDefault(defaults.price) || scaledRowPrice || ''));
    setNotes(strDefault(defaults.notes) || seed?.item.notes || row.manifestNotes || '');
    setSpecifications((defaults.specifications as Record<string, string> | undefined) ?? {});
    setVolumeConfirm(null);
    setRestorationDialogOpen(false);
    setRestorationConfig(null);
    dispatchBeforeRestorationRef.current = seed?.item.dispatch || strDefault(defaults.dispatch) || row.dispatch || 'on_shelf';
  }, [open, seed, editCheckIn, row, scaledRowRetail, scaledRowPrice]);

  useEffect(() => {
    if (salvageLocked) setDispatch('salvage');
  }, [salvageLocked]);

  function handleDispatchChange(next: string) {
    if (salvageLocked) return;
    const normalized = normalizeProcessingDispatch(next);
    if (normalized === 'restoration') {
      if (dispatch !== 'restoration') {
        dispatchBeforeRestorationRef.current = dispatch;
      }
      setDispatch('restoration');
      setRestorationDialogOpen(true);
      return;
    }
    setRestorationConfig(null);
    setRestorationDialogOpen(false);
    setDispatch(normalized);
  }

  function handleRestorationCancel() {
    setRestorationDialogOpen(false);
    setRestorationConfig(null);
    setDispatch(dispatchBeforeRestorationRef.current);
  }

  function handleRestorationConfirm(config: RestorationGradeConfig) {
    setRestorationConfig(config);
    setRestorationDialogOpen(false);
  }

  const restorationCardItem = useMemo(
    () =>
      buildRestorationCardItemFromProcessing({
        productTitle: product?.title ?? row.title,
        brand: product?.brand ?? row.brand,
        model: product?.model ?? row.model,
        category: product?.category ?? row.category,
        productNumber: product?.product_number,
        upc: product?.upc,
        retail: retail || scaledRowRetail,
        price: price || scaledRowPrice,
        condition: String(condition),
      }),
    [product, row, retail, price, scaledRowRetail, scaledRowPrice, condition],
  );

  function handleQuantityBlur() {
    setQuantity((prev) => String(parseCheckInQuantity(prev)));
  }

  function bumpQuantity(delta: number) {
    setQuantity(String(parseCheckInQuantity(String(Math.max(0, qtyValue || 1) + delta))));
  }

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      product_mode: 'existing',
      product_id: productId,
      quantity: qtyValue,
      condition,
      dispatch: salvageLocked ? 'salvage' : dispatch,
      retail: retail || undefined,
      price: price || undefined,
      notes,
      specifications,
    };
    if (dispatch === 'restoration' && restorationConfig) {
      payload.restoration_scale = restorationConfig.scale;
      payload.restoration_grade_values = restorationConfig.values;
    }
    return payload;
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

  const restorationReady = dispatch !== 'restoration' || restorationConfig != null;
  const canSubmit = productId != null && isValidCheckInPrice(price) && !busy && restorationReady;

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
      <DialogTitle sx={{ px: 2, py: 1.15, borderBottom: 1, borderColor: processingTokens.border }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.15, fontSize: '1.05rem' }}>
              {isEditMode ? `Edit check-in #${editCheckIn.id}` : 'Check in'}
            </Typography>
            {!isEditMode ?
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontWeight: 700 }} noWrap>
                {productLabel(product)} · Row {row.rowNum}
              </Typography>
            : (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontWeight: 700 }}>
                Row {row.rowNum}
              </Typography>
            )}
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

      <DialogContent sx={{ px: 2, py: 1.5, bgcolor: processingTokens.cardDeckBg, overflow: 'auto' }}>
        {productId == null ?
          <Typography color="text.secondary" variant="body2">
            Attach a product to this row before checking in.
          </Typography>
        : (
          <Stack spacing={0.85}>
            {isEditMode && editCheckIn ?
              <ProcessingCheckInEditStats checkIn={editCheckIn} product={productSummary(product)} />
            : <ProductSummaryCard product={productSummary(product)} />}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', fontSize: '0.58rem', whiteSpace: 'nowrap' }}
                >
                  Qty
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
                <Typography variant="caption" sx={{ color: qtyDelta > 0 ? processingTokens.accentGreen : 'error.main', fontWeight: 700, lineHeight: 1.3 }}>
                  {qtyDelta > 0 ?
                    `+${qtyDelta} on save`
                  : `${qtyDelta} on save`}
                </Typography>
              : null}
            </Box>

            {!isEditMode ? <CheckInFormActionRow left={<CheckInFinalizeHint />} /> : null}
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
              dispatch={dispatch}
              onDispatchChange={handleDispatchChange}
              specifications={specifications}
              onSpecificationsChange={setSpecifications}
              notes={notes}
              onNotesChange={setNotes}
              specsHelperText="Supplements product catalog specs; saved on each item in this check-in."
              disabled={busy}
              highlightRequired={!isEditMode}
            />
            {dispatch === 'restoration' && !restorationConfig ?
              <Alert severity="warning" variant="outlined" sx={{ py: 0.5 }}>
                Choose a grade scale and enter values for every grade to send this check-in to Restoration.
                {restorationDialogOpen ? null : (
                  <>
                    {' '}
                    <Button size="small" onClick={() => setRestorationDialogOpen(true)} sx={{ ml: 0.5 }}>
                      Open grade values
                    </Button>
                  </>
                )}
              </Alert>
            : null}
            {dispatch === 'restoration' && restorationConfig ?
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip
                  size="small"
                  color="success"
                  label={`Restoration · ${restorationConfig.scale} scale · ${Object.keys(restorationConfig.values).length} grades`}
                />
                <Button size="small" onClick={() => setRestorationDialogOpen(true)}>
                  Edit grade values
                </Button>
              </Stack>
            : null}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1, gap: 0.75, borderTop: 1, borderColor: processingTokens.border, flexWrap: 'wrap' }}>
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
      <ProcessingSendToRestorationDialog
        open={restorationDialogOpen}
        quantity={qtyValue}
        item={restorationCardItem}
        initialConfig={restorationConfig}
        loading={busy}
        onConfirm={handleRestorationConfirm}
        onCancel={handleRestorationCancel}
      />
    </>
  );
}
