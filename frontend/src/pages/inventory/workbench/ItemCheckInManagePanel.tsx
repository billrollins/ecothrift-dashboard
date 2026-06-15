import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import LocalPrintshopOutlinedIcon from '@mui/icons-material/LocalPrintshopOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import {
  getItemCheckIn,
  getProduct,
  productCheckIn,
  processingUpdateItemCheckIn,
} from '../../../api/inventory.api';
import type { ProductCheckInOrderOption } from '../../../api/inventory.api';
import type { ItemCheckInCatalog, ItemCondition, ItemStatus, Product } from '../../../types/inventory.types';
import { moneyValuesEqual } from '../../../utils/formInputs';
import type { WorkbenchSelection } from '../../../utils/richInventorySearch';
import { formatNumber } from '../../../utils/format';
import { productDisplayLabel } from '../../../utils/productCatalog';
import { ProductSearchAutocomplete } from '../../../components/inventory/ProductSearchAutocomplete';
import { MAX_CHECK_IN_QUANTITY } from '../processing/largeCheckIn';
import { printProcessingLabelsStaggered } from '../processing/printProcessingLabel';
import {
  normalizeProcessingCondition,
  PROCESSING_ITEM_DEFAULT_CONDITION,
  PROCESSING_ITEM_DISPATCH_OPTIONS,
} from '../processing/processingItemFormOptions';
import { processingTokens } from '../processing/processingTokens';
import {
  CheckInDetailFieldsSection,
  CheckInFinalizeHint,
  CheckInFormActionRow,
  CheckInQtyStepper,
  isValidCheckInPrice,
  parseCheckInQty,
} from './CheckInDetailsLayout';
import { formatOrderOrderedDate, CheckInOrderAutocomplete } from './CheckInOrderAutocomplete';
import { workbenchDetailTokens } from './WorkbenchDetailShell';
import { truncateText, WorkbenchStatCell } from './WorkbenchStatCell';
import { WorkbenchCopyableChip } from './WorkbenchCopyableChip';
import { useWorkbenchConfirmDialog } from './useWorkbenchConfirmDialog';
import { useWorkbenchSavePrintDialog } from './WorkbenchSavePrintDialog';
import { normalizeItemSpecObject } from './ItemSpecificationsEditor';

export interface ItemCheckInManagePanelProps {
  mode: 'create' | 'edit';
  checkInId?: number | null;
  productId?: number | null;
  onNavigate: (sel: WorkbenchSelection) => void;
  onApplyProductSearch?: (productId: number) => void;
  onOpenProductTab?: (productId: number, label?: string) => void;
  onFilterCheckInsByProduct?: (productId: number, keepCheckInId?: number) => void;
  onFilterCheckInsByOrder?: (orderId: number, keepCheckInId?: number) => void;
  onFilterCheckInById?: (checkInId: number) => void;
  onOpenItemsForCheckIn?: (checkInId: number, keepItemId?: number, keepItemLabel?: string) => void;
  onCheckInDuplicated?: (checkInId: number) => void;
  onSeeAllFromProduct?: (productId: number) => void;
  onCancelCreate?: () => void;
  onCheckInCreated?: (checkInId: number) => void;
}

function strDefault(v: unknown): string {
  if (v == null || v === '') return '';
  return String(v);
}

function normalizeProcessingDispatch(raw: string | null | undefined): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return 'on_shelf';
  const key = trimmed.toLowerCase().replace(/\s+/g, '_');
  const byValue = PROCESSING_ITEM_DISPATCH_OPTIONS.find((o) => o.value === key);
  if (byValue) return byValue.value;
  const byLabel = PROCESSING_ITEM_DISPATCH_OPTIONS.find(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
  );
  return byLabel?.value ?? 'on_shelf';
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveItemStatusSummary(items: ItemCheckInCatalog['items']): string {
  if (items.length === 0) return 'No items yet';
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([status, count]) => `${count} ${formatStatusLabel(status)}`)
    .join(' · ');
}

function orderOptionFromCheckIn(checkIn: ItemCheckInCatalog): ProductCheckInOrderOption {
  return {
    id: checkIn.purchase_order,
    order_number: checkIn.purchase_order_number || `PO ${checkIn.purchase_order}`,
    ordered_date: checkIn.purchase_order_ordered_date ?? null,
    vendor_name: checkIn.purchase_order_vendor_name ?? '',
    description: checkIn.purchase_order_description?.trim() || '',
    is_default: false,
    hint: '',
  };
}

function deriveCheckInItemStatus(items: ItemCheckInCatalog['items']): ItemStatus {
  return items[0]?.status ?? 'on_shelf';
}

function checkInFormBaseline(checkIn: ItemCheckInCatalog) {
  const defaults = checkIn.defaults ?? {};
  return {
    quantity: String(checkIn.quantity),
    purchaseOrderId: checkIn.purchase_order,
    condition: normalizeProcessingCondition(strDefault(defaults.condition)),
    status: deriveCheckInItemStatus(checkIn.items),
    dispatch: normalizeProcessingDispatch(strDefault(defaults.dispatch)),
    price: strDefault(defaults.price),
    retail: strDefault(defaults.retail),
    notes: strDefault(defaults.notes),
    specifications: normalizeItemSpecObject(
      checkIn.specifications ?? (defaults.specifications as Record<string, unknown> | undefined),
    ),
  };
}

function duplicateDraftDefaults() {
  return {
    quantity: '1',
    condition: PROCESSING_ITEM_DEFAULT_CONDITION,
    status: 'on_shelf' as ItemStatus,
    dispatch: 'on_shelf',
    price: '',
    retail: '',
    notes: '',
    specifications: {} as Record<string, string>,
  };
}

function checkInLabelItems(checkIn: ItemCheckInCatalog) {
  return checkIn.items.map((it) => ({
    sku: it.sku,
    price: it.price,
    product_title: checkIn.product_title,
    product_brand: checkIn.product_brand,
    product_number: checkIn.product_number ?? undefined,
  }));
}

interface ItemCheckInEditPanelProps {
  checkInId: number;
  onFilterCheckInById?: (checkInId: number) => void;
  onFilterCheckInsByProduct?: (productId: number, keepCheckInId?: number) => void;
  onFilterCheckInsByOrder?: (orderId: number, keepCheckInId?: number) => void;
  onOpenItemsForCheckIn?: (checkInId: number, keepItemId?: number, keepItemLabel?: string) => void;
  onCheckInDuplicated?: (checkInId: number) => void;
}

function ItemCheckInEditPanel({
  checkInId,
  onFilterCheckInById,
  onFilterCheckInsByProduct,
  onFilterCheckInsByOrder,
  onOpenItemsForCheckIn,
  onCheckInDuplicated,
}: ItemCheckInEditPanelProps) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { confirm, ConfirmDialogHost } = useWorkbenchConfirmDialog();
  const { confirmSavePrint, SavePrintDialogHost } = useWorkbenchSavePrintDialog();

  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState<ItemCondition>('good');
  const [status, setStatus] = useState<ItemStatus>('on_shelf');
  const [dispatch, setDispatch] = useState('on_shelf');
  const [price, setPrice] = useState('');
  const [retail, setRetail] = useState('');
  const [notes, setNotes] = useState('');
  const [specifications, setSpecifications] = useState<Record<string, string>>({});
  const [selectedOrder, setSelectedOrder] = useState<ProductCheckInOrderOption | null>(null);
  const [isDuplicateDraft, setIsDuplicateDraft] = useState(false);

  const checkInQuery = useQuery({
    queryKey: ['item-check-ins', 'manage', checkInId],
    queryFn: async () => (await getItemCheckIn(checkInId)).data,
  });

  const checkIn = checkInQuery.data;

  const productQuery = useQuery({
    queryKey: ['products', 'checkin-manage', checkIn?.product],
    queryFn: async () => (await getProduct(checkIn!.product!)).data,
    enabled: Boolean(checkIn?.product),
  });

  useEffect(() => {
    if (!checkIn) return;
    setIsDuplicateDraft(false);
    const nextBaseline = checkInFormBaseline(checkIn);
    setQuantity(nextBaseline.quantity);
    setCondition(nextBaseline.condition);
    setStatus(nextBaseline.status);
    setDispatch(nextBaseline.dispatch);
    setPrice(nextBaseline.price);
    setRetail(nextBaseline.retail);
    setNotes(nextBaseline.notes);
    setSpecifications(nextBaseline.specifications);
    setSelectedOrder(orderOptionFromCheckIn(checkIn));
  }, [checkIn]);

  const applyBaselineFromCheckIn = () => {
    if (!checkIn) return;
    const nextBaseline = checkInFormBaseline(checkIn);
    setQuantity(nextBaseline.quantity);
    setCondition(nextBaseline.condition);
    setStatus(nextBaseline.status);
    setDispatch(nextBaseline.dispatch);
    setPrice(nextBaseline.price);
    setRetail(nextBaseline.retail);
    setNotes(nextBaseline.notes);
    setSpecifications(nextBaseline.specifications);
    setSelectedOrder(orderOptionFromCheckIn(checkIn));
  };

  const baseline = useMemo(
    () => (checkIn ? checkInFormBaseline(checkIn) : null),
    [checkIn],
  );

  const qtyValue = useMemo(() => parseCheckInQty(quantity), [quantity]);
  const salvageLocked = condition === 'salvage';
  const qtyDelta = checkIn ? qtyValue - checkIn.quantity : 0;

  const isDirty = useMemo(() => {
    if (!baseline || !selectedOrder) return false;
    return (
      quantity !== baseline.quantity
      || selectedOrder.id !== baseline.purchaseOrderId
      || condition !== baseline.condition
      || status !== baseline.status
      || dispatch !== baseline.dispatch
      || price !== baseline.price
      || retail !== baseline.retail
      || notes !== baseline.notes
      || JSON.stringify(specifications) !== JSON.stringify(baseline.specifications)
    );
  }, [baseline, quantity, selectedOrder, condition, status, dispatch, price, retail, notes, specifications]);

  const saveMutation = useMutation({
    mutationFn: async ({ printAfterSave }: { printAfterSave: boolean }) => {
      if (!checkIn || !selectedOrder) throw new Error('Check-in not loaded.');
      const payload: Record<string, unknown> = {
        product_mode: 'existing',
        product_id: checkIn.product,
        quantity: qtyValue,
        purchase_order: selectedOrder.id,
        condition,
        status,
        dispatch: salvageLocked ? 'salvage' : dispatch,
        price: price.trim() || undefined,
        retail: retail.trim() || null,
        notes,
        specifications,
      };
      const { data } = await processingUpdateItemCheckIn(checkIn.purchase_order, checkIn.id, payload);
      return { data, printAfterSave, savedPrice: price.trim() || undefined };
    },
    onSuccess: async ({ printAfterSave, savedPrice }) => {
      enqueueSnackbar('Check-in updated.', { variant: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['item-check-ins'] });
      if (!printAfterSave) return;
      const fresh = await queryClient.fetchQuery({
        queryKey: ['item-check-ins', 'manage', checkInId],
        queryFn: async () => (await getItemCheckIn(checkInId)).data,
      });
      if (!fresh?.items.length) {
        enqueueSnackbar('No items to print', { variant: 'warning' });
        return;
      }
      const { succeeded, failed } = await printProcessingLabelsStaggered(
        checkInLabelItems(fresh),
        savedPrice,
      );
      if (failed > 0) enqueueSnackbar('Some labels failed to print', { variant: 'error' });
      else if (succeeded > 0) enqueueSnackbar(`${succeeded} label(s) sent to printer`, { variant: 'success' });
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message === 'Save cancelled.') return;
      enqueueSnackbar(err instanceof Error ? err.message : 'Could not save check-in.', { variant: 'error' });
    },
  });

  const handleSave = async () => {
    if (!checkIn || !selectedOrder || !isDirty) return;
    let printAfterSave = false;
    const priceChanged = baseline ? !moneyValuesEqual(price, baseline.price) : false;
    if (priceChanged) {
      const n = checkIn.items.length;
      const choice = await confirmSavePrint({
        title: 'Shelf price changed',
        message: n > 0 ?
          `Save this check-in with the updated shelf price? You can print ${n} new label${n === 1 ? '' : 's'} or skip printing.`
          : 'Save this check-in with the updated shelf price?',
        printLabel: 'Print',
        noPrintLabel: 'No print',
        cancelLabel: 'Cancel save',
      });
      if (choice === 'cancel') return;
      printAfterSave = choice === 'print';
    }
    if (qtyDelta > 0) {
      const ok = await confirm({
        title: 'Add items?',
        message: `Add ${qtyDelta} item${qtyDelta === 1 ? '' : 's'} to this check-in?`,
        confirmLabel: 'Add items',
        severity: 'warning',
      });
      if (!ok) return;
    } else if (qtyDelta < 0) {
      const n = -qtyDelta;
      const ok = await confirm({
        title: 'Remove items?',
        message: `Delete ${n} item${n === 1 ? '' : 's'} from this check-in? Their tags are removed from inventory.`,
        confirmLabel: 'Delete items',
        severity: 'error',
        confirmColor: 'error',
      });
      if (!ok) return;
    }
    saveMutation.mutate({ printAfterSave });
  };

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!checkIn?.product || !selectedOrder) throw new Error('Check-in not loaded.');
      if (!isValidCheckInPrice(price)) throw new Error('Shelf price is required.');
      const { data } = await productCheckIn(checkIn.product, {
        quantity: qtyValue,
        purchase_order: selectedOrder.id,
        condition,
        status,
        dispatch: salvageLocked ? 'salvage' : dispatch,
        price: price.trim(),
        retail: retail.trim() || undefined,
        notes: notes.trim() || undefined,
        specifications,
      });
      return data;
    },
    onSuccess: async (data) => {
      enqueueSnackbar(`Created check-in with ${data.created_count} item(s).`, { variant: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['item-check-ins'] });
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      setIsDuplicateDraft(false);
      if (data.item_check_in_id) onCheckInDuplicated?.(data.item_check_in_id);
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message === 'Shelf price is required.') {
        enqueueSnackbar(err.message, { variant: 'warning' });
        return;
      }
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not create check-in.', { variant: 'error' });
    },
  });

  const handleDuplicate = () => {
    if (!checkIn?.product || !selectedOrder) return;
    const cleared = duplicateDraftDefaults();
    setQuantity(cleared.quantity);
    setCondition(cleared.condition);
    setStatus(cleared.status);
    setDispatch(cleared.dispatch);
    setPrice(cleared.price);
    setRetail(cleared.retail);
    setNotes(cleared.notes);
    setSpecifications(cleared.specifications);
    setIsDuplicateDraft(true);
  };

  const handleCancelDuplicate = () => {
    applyBaselineFromCheckIn();
    setIsDuplicateDraft(false);
  };

  const handleCreateDuplicate = () => {
    duplicateMutation.mutate();
  };

  const canCreateDuplicate = Boolean(checkIn?.product && selectedOrder && isValidCheckInPrice(price));

  const handleReprintAll = async () => {
    if (!checkIn || checkIn.items.length === 0) {
      enqueueSnackbar('No items to print', { variant: 'warning' });
      return;
    }
    const n = checkIn.items.length;
    const ok = await confirm({
      title: 'Reprint labels?',
      message: `Reprint ${n} label${n === 1 ? '' : 's'} for this check-in?`,
      confirmLabel: 'Reprint',
      severity: 'info',
      confirmColor: 'primary',
    });
    if (!ok) return;
    const { succeeded, failed } = await printProcessingLabelsStaggered(checkInLabelItems(checkIn));
    if (failed > 0) enqueueSnackbar('Some labels failed to print', { variant: 'error' });
    else if (succeeded > 0) enqueueSnackbar(`${succeeded} label(s) sent to printer`, { variant: 'success' });
  };

  const bumpQuantity = (delta: number) => {
    const next = Math.max(1, Math.min(MAX_CHECK_IN_QUANTITY, parseCheckInQty(quantity) + delta));
    setQuantity(String(next));
  };

  if (checkInQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!checkIn) {
    return <Typography color="text.secondary">Check-in not found.</Typography>;
  }

  const product = productQuery.data;
  const orderNumber = selectedOrder?.order_number || checkIn.purchase_order_number || `PO ${checkIn.purchase_order}`;
  const orderDescription = selectedOrder?.description?.trim() || checkIn.purchase_order_description?.trim() || '';
  const orderVendor = selectedOrder?.vendor_name?.trim() || checkIn.purchase_order_vendor_name?.trim() || '';
  const orderDate = selectedOrder?.ordered_date ?? checkIn.purchase_order_ordered_date;
  const productTitle = product ? productDisplayLabel(product) : (checkIn.product_title || '—');
  const productHelper = truncateText(
    [checkIn.product_brand, product?.category_name || ''].filter(Boolean).join(' · '),
    42,
  );
  const itemStatusSummary = isDuplicateDraft ? 'No items yet' : deriveItemStatusSummary(checkIn.items);
  const qtyHelper = isDuplicateDraft ? undefined : (qtyDelta !== 0 ? `${qtyDelta > 0 ? '+' : ''}${qtyDelta} on save` : undefined);
  const itemCount = isDuplicateDraft ? 0 : checkIn.items.length;

  const orderTooltip = (
    <>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, mb: 0.5 }}>
        {orderNumber}
      </Typography>
      {orderDate ?
        <Typography variant="caption" sx={{ display: 'block' }}>
          Ordered {formatOrderOrderedDate(orderDate)}
        </Typography>
      : null}
      {orderVendor ?
        <Typography variant="caption" sx={{ display: 'block' }}>
          Vendor: {orderVendor}
        </Typography>
      : null}
      {orderDescription ?
        <Typography variant="caption" sx={{ display: 'block' }}>
          {orderDescription}
        </Typography>
      : null}
    </>
  );

  const productTooltip = product ? (
    <>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, mb: 0.5 }}>
        {productDisplayLabel(product)}
      </Typography>
      {product.product_number ?
        <Typography variant="caption" sx={{ display: 'block' }}>
          #{product.product_number}
        </Typography>
      : null}
      {product.category_name ?
        <Typography variant="caption" sx={{ display: 'block' }}>
          {product.category_name}
        </Typography>
      : null}
    </>
  ) : (
    <Typography variant="caption">{checkIn.product_title || 'No product linked'}</Typography>
  );

  const itemsTooltip = (
    <>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, mb: 0.5 }}>
        Item statuses
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        {itemStatusSummary}
      </Typography>
    </>
  );

  return (
    <>
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: workbenchDetailTokens.editorSurface,
      }}
    >
      <Box sx={{ flexShrink: 0, bgcolor: workbenchDetailTokens.headerSurface, borderBottom: 1, borderColor: workbenchDetailTokens.borderSubtle }}>
        <Box
          sx={{
            px: 2.75,
            pt: 1.75,
            pb: 1.25,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" component="span" sx={{ display: 'block', fontWeight: 800, color: processingTokens.textStrong, lineHeight: 1.2 }}>
              {isDuplicateDraft ? 'Create check-in' : 'Edit check-in'}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.35, color: processingTokens.textMute }}>
              {isDuplicateDraft ?
                'Same product and order — fill in details below.'
              : 'Edit the check-in details below.'}
            </Typography>
          </Box>
          <WorkbenchCopyableChip
            size="small"
            label={isDuplicateDraft ? 'NEW' : `#${checkIn.id}`}
            copyText={isDuplicateDraft ? undefined : `#${checkIn.id}`}
            variant={isDuplicateDraft ? 'filled' : 'outlined'}
            color={isDuplicateDraft ? 'primary' : 'default'}
            clickable={!isDuplicateDraft && Boolean(onFilterCheckInById)}
            onBadgeClick={
              !isDuplicateDraft && onFilterCheckInById ?
                () => onFilterCheckInById(checkIn.id)
              : undefined
            }
            sx={{
              height: 22,
              fontFamily: processingTokens.monoFontFamily,
              fontWeight: 800,
              fontSize: '0.72rem',
              letterSpacing: 0.4,
              ...(isDuplicateDraft ? {} : {
                borderColor: workbenchDetailTokens.borderSubtle,
                color: processingTokens.textSoft,
                bgcolor: workbenchDetailTokens.headerSubtle,
              }),
            }}
          />
        </Box>

        <Box
          sx={{
            display: 'flex',
            width: '100%',
            overflowX: 'auto',
            bgcolor: workbenchDetailTokens.headerSubtle,
            color: processingTokens.statsHeaderText,
            borderTop: 1,
            borderColor: workbenchDetailTokens.borderSubtle,
            px: 1.25,
            py: 1,
            gap: 0.75,
          }}
        >
          <WorkbenchStatCell
            label="Order"
            value={orderNumber}
            helper={truncateText(orderDescription, 42) || orderVendor || 'Purchase order'}
            mono
            tooltip={orderTooltip}
            onClick={
              onFilterCheckInsByOrder ?
                () => onFilterCheckInsByOrder(checkIn.purchase_order, checkIn.id)
              : undefined
            }
          />
          <WorkbenchStatCell
            label="Product"
            flex="2 1 180px"
            minWidth={140}
            value={productTitle}
            helper={productHelper || 'Catalog product'}
            tooltip={productTooltip}
            onClick={
              checkIn.product && onFilterCheckInsByProduct ?
                () => onFilterCheckInsByProduct(checkIn.product!, checkIn.id)
              : undefined
            }
          />
          <WorkbenchStatCell
            label="Qty"
            flex="1 1 116px"
            minWidth={108}
            helper={qtyHelper}
          >
            <Box sx={{ mt: 0.35 }} onClick={(event) => event.stopPropagation()}>
              <CheckInQtyStepper
                quantity={quantity}
                onChange={setQuantity}
                onBlur={() => setQuantity(String(parseCheckInQty(quantity)))}
                onBump={bumpQuantity}
              />
            </Box>
          </WorkbenchStatCell>
          <WorkbenchStatCell
            label="# Items"
            flex="1 1 116px"
            minWidth={108}
            value={formatNumber(itemCount)}
            helper={isDuplicateDraft ? 'New check-in' : 'Click to view items'}
            tooltip={itemsTooltip}
            onClick={
              !isDuplicateDraft && onOpenItemsForCheckIn ?
                () => onOpenItemsForCheckIn(checkIn.id)
              : undefined
            }
          />
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          px: 2.75,
          pt: '18px',
          pb: 1.75,
          overflow: 'auto',
          bgcolor: workbenchDetailTokens.editorSurface,
        }}
      >
        {!isDuplicateDraft ?
          <CheckInFormActionRow
            left={
              <Button
                size="small"
                variant="outlined"
                startIcon={<ContentCopyOutlinedIcon />}
                onClick={handleDuplicate}
                disabled={!checkIn.product || !selectedOrder}
                sx={{
                  borderColor: `${processingTokens.ecoBrown}88`,
                  color: processingTokens.ecoBrownDark,
                  bgcolor: '#fff',
                  flexShrink: 0,
                  '&:hover': { borderColor: processingTokens.ecoBrown, bgcolor: processingTokens.ecoBrownSoft },
                }}
              >
                Duplicate
              </Button>
            }
          />
        : (
          <CheckInFormActionRow left={<CheckInFinalizeHint />} />
        )}
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
          specsHelperText="Supplements the product catalog specs — saved on each item in this check-in."
          highlightRequired={isDuplicateDraft}
        />
      </Box>

      <Divider />
      <Box
        sx={{
          flexShrink: 0,
          px: 2.75,
          py: 0.85,
          bgcolor: workbenchDetailTokens.headerSurface,
          borderTop: 1,
          borderColor: workbenchDetailTokens.borderSubtle,
        }}
      >
        <Stack direction="row" spacing={0.75} justifyContent="space-between" alignItems="center">
          {isDuplicateDraft ?
            <>
              <Button
                size="small"
                variant="outlined"
                onClick={handleCancelDuplicate}
                disabled={duplicateMutation.isPending}
                sx={{ borderColor: workbenchDetailTokens.borderSubtle, color: processingTokens.textSoft, bgcolor: '#fff' }}
              >
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={
                  duplicateMutation.isPending ?
                    <CircularProgress size={14} color="inherit" />
                  : undefined
                }
                disabled={!canCreateDuplicate || duplicateMutation.isPending}
                onClick={handleCreateDuplicate}
                sx={{ bgcolor: processingTokens.primary, '&:hover': { bgcolor: processingTokens.primaryDark }, fontWeight: 800 }}
              >
                Check in {qtyValue} item{qtyValue === 1 ? '' : 's'}
              </Button>
            </>
          : <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<LocalPrintshopOutlinedIcon />}
                disabled={checkIn.items.length === 0}
                onClick={() => void handleReprintAll()}
                sx={{ borderColor: workbenchDetailTokens.borderSubtle, color: processingTokens.textSoft, bgcolor: '#fff' }}
              >
                Reprint
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<SaveOutlinedIcon />}
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => void handleSave()}
                sx={{ bgcolor: processingTokens.primary, '&:hover': { bgcolor: processingTokens.primaryDark }, fontWeight: 800 }}
              >
                Save
              </Button>
            </>
          }
        </Stack>
      </Box>
    </Box>
    {ConfirmDialogHost}
    {SavePrintDialogHost}
    </>
  );
}

interface ItemCheckInCreatePanelProps {
  productId: number | null;
  onFilterCheckInsByProduct?: (productId: number, keepCheckInId?: number) => void;
  onFilterCheckInsByOrder?: (orderId: number, keepCheckInId?: number) => void;
  onCancelCreate?: () => void;
  onCheckInCreated?: (checkInId: number) => void;
}

function ItemCheckInCreatePanel({
  productId,
  onFilterCheckInsByProduct,
  onFilterCheckInsByOrder,
  onCancelCreate,
  onCheckInCreated,
}: ItemCheckInCreatePanelProps) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const [selectedOrder, setSelectedOrder] = useState<ProductCheckInOrderOption | null>(null);
  const [pickedProduct, setPickedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState<ItemCondition>(PROCESSING_ITEM_DEFAULT_CONDITION);
  const [status, setStatus] = useState<ItemStatus>('on_shelf');
  const [dispatch, setDispatch] = useState('on_shelf');
  const [price, setPrice] = useState('');
  const [retail, setRetail] = useState('');
  const [notes, setNotes] = useState('');
  const [specifications, setSpecifications] = useState<Record<string, string>>({});

  useEffect(() => {
    setPickedProduct(null);
    setSelectedOrder(null);
    const cleared = duplicateDraftDefaults();
    setQuantity(cleared.quantity);
    setCondition(cleared.condition);
    setStatus(cleared.status);
    setDispatch(cleared.dispatch);
    setPrice(cleared.price);
    setRetail(cleared.retail);
    setNotes(cleared.notes);
    setSpecifications(cleared.specifications);
  }, [productId]);

  const productQuery = useQuery({
    queryKey: ['products', 'checkin-create', productId],
    queryFn: async () => (await getProduct(productId!)).data,
    enabled: productId != null,
  });

  const product = pickedProduct ?? productQuery.data ?? null;
  const loadingPresetProduct = productId != null && !pickedProduct && productQuery.isLoading;
  const needsOrder = !selectedOrder;
  const needsProduct = !product;
  const showForm = !needsOrder && !needsProduct;

  const qtyValue = useMemo(() => parseCheckInQty(quantity), [quantity]);
  const salvageLocked = condition === 'salvage';
  const canCreate = showForm && isValidCheckInPrice(price);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!product || !selectedOrder) throw new Error('Order and product are required.');
      if (!isValidCheckInPrice(price)) throw new Error('Shelf price is required.');
      const { data } = await productCheckIn(product.id, {
        quantity: qtyValue,
        purchase_order: selectedOrder.id,
        condition,
        status,
        dispatch: salvageLocked ? 'salvage' : dispatch,
        price: price.trim(),
        retail: retail.trim() || undefined,
        notes: notes.trim() || undefined,
        specifications,
      });
      return data;
    },
    onSuccess: async (data) => {
      enqueueSnackbar(`Created check-in with ${data.created_count} item(s).`, { variant: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['item-check-ins'] });
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      if (data.item_check_in_id) onCheckInCreated?.(data.item_check_in_id);
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message === 'Shelf price is required.') {
        enqueueSnackbar(err.message, { variant: 'warning' });
        return;
      }
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not create check-in.', { variant: 'error' });
    },
  });

  const bumpQuantity = (delta: number) => {
    const next = Math.max(1, Math.min(MAX_CHECK_IN_QUANTITY, parseCheckInQty(quantity) + delta));
    setQuantity(String(next));
  };

  if (loadingPresetProduct) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (productId != null && !pickedProduct && productQuery.isError) {
    return <Typography color="text.secondary">Product not found.</Typography>;
  }

  const orderNumber = selectedOrder?.order_number ?? '—';
  const orderDescription = selectedOrder?.description?.trim() ?? '';
  const orderVendor = selectedOrder?.vendor_name?.trim() ?? '';
  const orderDate = selectedOrder?.ordered_date;
  const productTitle = product ? productDisplayLabel(product) : '—';
  const productHelper = product ?
    truncateText([product.brand, product.category_name || ''].filter(Boolean).join(' · '), 42)
  : 'Choose a catalog product';

  const subhead =
    needsOrder ? 'Choose a purchase order.'
    : needsProduct ? 'Choose a product to check in.'
    : 'Fill in check-in details below.';

  const orderTooltip = selectedOrder ? (
    <>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, mb: 0.5 }}>
        {orderNumber}
      </Typography>
      {orderDate ?
        <Typography variant="caption" sx={{ display: 'block' }}>
          Ordered {formatOrderOrderedDate(orderDate)}
        </Typography>
      : null}
      {orderVendor ?
        <Typography variant="caption" sx={{ display: 'block' }}>
          Vendor: {orderVendor}
        </Typography>
      : null}
      {orderDescription ?
        <Typography variant="caption" sx={{ display: 'block' }}>
          {orderDescription}
        </Typography>
      : null}
    </>
  ) : (
    <Typography variant="caption">Select a purchase order</Typography>
  );

  const productTooltip = product ? (
    <>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, mb: 0.5 }}>
        {productDisplayLabel(product)}
      </Typography>
      {product.product_number ?
        <Typography variant="caption" sx={{ display: 'block' }}>
          #{product.product_number}
        </Typography>
      : null}
      {product.category_name ?
        <Typography variant="caption" sx={{ display: 'block' }}>
          {product.category_name}
        </Typography>
      : null}
    </>
  ) : (
    <Typography variant="caption">Select a catalog product</Typography>
  );

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: workbenchDetailTokens.editorSurface,
      }}
    >
      <Box sx={{ flexShrink: 0, bgcolor: workbenchDetailTokens.headerSurface, borderBottom: 1, borderColor: workbenchDetailTokens.borderSubtle }}>
        <Box
          sx={{
            px: 2.75,
            pt: 1.75,
            pb: 1.25,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" component="span" sx={{ display: 'block', fontWeight: 800, color: processingTokens.textStrong, lineHeight: 1.2 }}>
              Create check-in
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.35, color: processingTokens.textMute }}>
              {subhead}
            </Typography>
          </Box>
          <Chip
            size="small"
            label="NEW"
            variant="filled"
            color="primary"
            sx={{
              flexShrink: 0,
              height: 22,
              fontFamily: processingTokens.monoFontFamily,
              fontWeight: 800,
              fontSize: '0.72rem',
              letterSpacing: 0.4,
            }}
          />
        </Box>

        <Box
          sx={{
            display: 'flex',
            width: '100%',
            overflowX: 'auto',
            bgcolor: workbenchDetailTokens.headerSubtle,
            color: processingTokens.statsHeaderText,
            borderTop: 1,
            borderColor: workbenchDetailTokens.borderSubtle,
            px: 1.25,
            py: 1,
            gap: 0.75,
          }}
        >
          <WorkbenchStatCell
            label="Order"
            value={orderNumber}
            helper={needsOrder ? 'Required' : truncateText(orderDescription, 42) || orderVendor || 'Purchase order'}
            mono={Boolean(selectedOrder)}
            tooltip={orderTooltip}
            onClick={
              selectedOrder && onFilterCheckInsByOrder ?
                () => onFilterCheckInsByOrder(selectedOrder.id)
              : undefined
            }
          />
          <WorkbenchStatCell
            label="Product"
            flex="2 1 180px"
            minWidth={140}
            value={productTitle}
            helper={needsProduct ? 'Required' : productHelper}
            tooltip={productTooltip}
            onClick={
              product && onFilterCheckInsByProduct ?
                () => onFilterCheckInsByProduct(product.id)
              : undefined
            }
          />
          <WorkbenchStatCell label="Qty" flex="1 1 116px" minWidth={108}>
            <Box sx={{ mt: 0.35 }} onClick={(event) => event.stopPropagation()}>
              <CheckInQtyStepper
                quantity={quantity}
                onChange={setQuantity}
                onBlur={() => setQuantity(String(parseCheckInQty(quantity)))}
                onBump={bumpQuantity}
                disabled={!showForm}
              />
            </Box>
          </WorkbenchStatCell>
          <WorkbenchStatCell
            label="# Items"
            flex="1 1 116px"
            minWidth={108}
            value={formatNumber(0)}
            helper="New check-in"
            tooltip={<Typography variant="caption">No items until you check in</Typography>}
          />
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          px: 2.75,
          pt: '18px',
          pb: 1.75,
          overflow: 'auto',
          bgcolor: workbenchDetailTokens.editorSurface,
        }}
      >
        {needsOrder ?
          <CheckInOrderAutocomplete
            value={selectedOrder}
            onChange={setSelectedOrder}
            paneShell
            autoSelectDefault={false}
            highlightIfEmpty
          />
        : needsProduct ?
          <ProductSearchAutocomplete
            scope="checkin-create"
            label="Product"
            value={product}
            onSelect={setPickedProduct}
            helperText=""
            paneShell
            highlightIfEmpty
          />
        : <>
            <CheckInFormActionRow left={<CheckInFinalizeHint />} />
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
              specsHelperText="Supplements the product catalog specs — saved on each item in this check-in."
              highlightRequired
            />
          </>
        }
      </Box>

      <Divider />
      <Box
        sx={{
          flexShrink: 0,
          px: 2.75,
          py: 0.85,
          bgcolor: workbenchDetailTokens.headerSurface,
          borderTop: 1,
          borderColor: workbenchDetailTokens.borderSubtle,
        }}
      >
        <Stack direction="row" spacing={0.75} justifyContent="space-between" alignItems="center">
          {onCancelCreate ?
            <Button
              size="small"
              variant="outlined"
              onClick={onCancelCreate}
              disabled={createMutation.isPending}
              sx={{ borderColor: workbenchDetailTokens.borderSubtle, color: processingTokens.textSoft, bgcolor: '#fff' }}
            >
              Cancel
            </Button>
          : <Box />}
          {showForm ?
            <Button
              size="small"
              variant="contained"
              startIcon={
                createMutation.isPending ?
                  <CircularProgress size={14} color="inherit" />
                : undefined
              }
              disabled={!canCreate || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              sx={{ bgcolor: processingTokens.primary, '&:hover': { bgcolor: processingTokens.primaryDark }, fontWeight: 800 }}
            >
              Check in {qtyValue} item{qtyValue === 1 ? '' : 's'}
            </Button>
          : null}
        </Stack>
      </Box>
    </Box>
  );
}

export function ItemCheckInManagePanel({
  mode,
  checkInId = null,
  productId = null,
  onApplyProductSearch,
  onOpenProductTab,
  onFilterCheckInsByProduct,
  onFilterCheckInsByOrder,
  onFilterCheckInById,
  onOpenItemsForCheckIn,
  onCheckInDuplicated,
  onSeeAllFromProduct,
  onCancelCreate,
  onCheckInCreated,
}: ItemCheckInManagePanelProps) {
  if (mode === 'edit' && checkInId != null) {
    return (
      <ItemCheckInEditPanel
        checkInId={checkInId}
        onFilterCheckInById={onFilterCheckInById}
        onFilterCheckInsByProduct={onFilterCheckInsByProduct}
        onFilterCheckInsByOrder={onFilterCheckInsByOrder}
        onOpenItemsForCheckIn={onOpenItemsForCheckIn}
        onCheckInDuplicated={onCheckInDuplicated}
      />
    );
  }

  return (
    <ItemCheckInCreatePanel
      productId={productId}
      onFilterCheckInsByProduct={onFilterCheckInsByProduct}
      onFilterCheckInsByOrder={onFilterCheckInsByOrder}
      onCancelCreate={onCancelCreate}
      onCheckInCreated={onCheckInCreated}
    />
  );
}
