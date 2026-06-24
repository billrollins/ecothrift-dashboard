import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import LocalPrintshopOutlinedIcon from '@mui/icons-material/LocalPrintshopOutlined';
import {
  getItem,
  getItemCheckIn,
  getProduct,
  updateItem,
} from '../../../api/inventory.api';
import type { Item, ItemCheckInCatalog, ItemCondition, ItemStatus } from '../../../types/inventory.types';
import { formatNumber } from '../../../utils/format';
import { moneyValuesEqual } from '../../../utils/formInputs';
import { productDisplayLabel } from '../../../utils/productCatalog';
import { isItemEditLocked } from '../manage/ItemEditDialog';
import {
  normalizeProcessingCondition,
  normalizeProcessingDispatch,
} from '../processing/processingItemFormOptions';
import { printProcessingLabelsAndMarkPrinted } from '../processing/printProcessingLabel';
import { processingTokens } from '../processing/processingTokens';
import { CheckInDetailFieldsSection } from './CheckInDetailsLayout';
import { formatOrderOrderedDate } from './CheckInOrderAutocomplete';
import { workbenchDetailTokens } from './WorkbenchDetailShell';
import { truncateText, WorkbenchStatCell } from './WorkbenchStatCell';
import { WorkbenchCopyableChip } from './WorkbenchCopyableChip';
import { useWorkbenchSavePrintDialog } from './WorkbenchSavePrintDialog';
import { normalizeItemSpecObject } from './ItemSpecificationsEditor';

export interface ItemManagePanelProps {
  itemId: number;
  onFilterItemsByProduct?: (productId: number) => void;
  onFilterItemsByOrder?: (orderId: number) => void;
  onFilterItemBySku?: (sku: string, itemId: number) => void;
  onOpenCheckIn?: (checkInId: number) => void;
  onOpenItemsForCheckIn?: (checkInId: number, keepItemId?: number, keepItemLabel?: string) => void;
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCheckedInDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
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

export function ItemManagePanel({
  itemId,
  onFilterItemsByProduct,
  onFilterItemsByOrder,
  onFilterItemBySku,
  onOpenCheckIn,
  onOpenItemsForCheckIn,
}: ItemManagePanelProps) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { confirmSavePrint, SavePrintDialogHost } = useWorkbenchSavePrintDialog();

  const [status, setStatus] = useState<ItemStatus>('on_shelf');
  const [condition, setCondition] = useState<ItemCondition>('good');
  const [dispatch, setDispatch] = useState('on_shelf');
  const [price, setPrice] = useState('');
  const [retail, setRetail] = useState('');
  const [notes, setNotes] = useState('');
  const [specifications, setSpecifications] = useState<Record<string, string>>({});

  const itemQuery = useQuery({
    queryKey: ['items', 'manage-panel', itemId],
    queryFn: async () => (await getItem(itemId)).data,
  });

  const item = itemQuery.data;
  const locked = isItemEditLocked(item);

  const checkInQuery = useQuery({
    queryKey: ['item-check-ins', 'item-manage', item?.item_check_in_id],
    queryFn: async () => (await getItemCheckIn(item!.item_check_in_id!)).data,
    enabled: Boolean(item?.item_check_in_id),
  });

  const productQuery = useQuery({
    queryKey: ['products', 'item-manage', item?.product],
    queryFn: async () => (await getProduct(Number(item!.product))).data,
    enabled: Boolean(item?.product),
  });

  useEffect(() => {
    if (!item) return;
    setStatus(item.status);
    setCondition(normalizeProcessingCondition(item.condition));
    setDispatch(normalizeProcessingDispatch(item.location));
    setPrice(item.price || '');
    setRetail(item.retail || item.retail_value || '');
    setNotes(item.notes || '');
    setSpecifications(normalizeItemSpecObject(item.specifications));
  }, [item]);

  const baseline = useMemo(() => {
    if (!item) return null;
    return {
      status: item.status,
      condition: normalizeProcessingCondition(item.condition),
      dispatch: normalizeProcessingDispatch(item.location),
      price: item.price || '',
      retail: item.retail || item.retail_value || '',
      notes: item.notes || '',
      specifications: normalizeItemSpecObject(item.specifications),
    };
  }, [item]);

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    return (
      status !== baseline.status
      || condition !== baseline.condition
      || dispatch !== baseline.dispatch
      || price !== baseline.price
      || retail !== baseline.retail
      || notes !== baseline.notes
      || JSON.stringify(specifications) !== JSON.stringify(baseline.specifications)
    );
  }, [baseline, status, condition, dispatch, price, retail, notes, specifications]);

  const saveMutation = useMutation({
    mutationFn: async ({ current, printAfterSave }: { current: Item; printAfterSave: boolean }) => {
      const { data } = await updateItem(current.id, {
        status,
        condition,
        price: price.trim() || '0.00',
        retail: retail.trim() || null,
        location: dispatch.trim(),
        notes,
        specifications,
      });
      return { data, printAfterSave };
    },
    onSuccess: async ({ data, printAfterSave }) => {
      enqueueSnackbar('Item updated.', { variant: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      if (!printAfterSave) return;
      const result = await printProcessingLabelsAndMarkPrinted([{ ...data, id: data.id }]);
      if (result.failed > 0) enqueueSnackbar('Label print failed', { variant: 'error' });
      else if (result.succeeded > 0) enqueueSnackbar('Label sent to printer', { variant: 'success' });
      if (result.markFailed) enqueueSnackbar('Label printed but printed status could not be saved.', { variant: 'warning' });
      else await queryClient.invalidateQueries({ queryKey: ['items'] });
    },
    onError: (err: unknown) => {
      enqueueSnackbar(err instanceof Error ? err.message : 'Could not save item.', { variant: 'error' });
    },
  });

  const handleSave = async () => {
    if (!item || locked || !isDirty) return;
    let printAfterSave = false;
    const priceChanged = baseline ? !moneyValuesEqual(price, baseline.price) : false;
    if (priceChanged) {
      const choice = await confirmSavePrint({
        title: 'Shelf price changed',
        message: 'Save this item with the updated shelf price?',
        printLabel: item?.label_printed ? 'Reprint' : 'Print',
        noPrintLabel: 'No print',
        cancelLabel: 'Cancel save',
      });
      if (choice === 'cancel') return;
      printAfterSave = choice === 'print';
    }
    saveMutation.mutate({ current: item, printAfterSave });
  };

  const handleReprint = async () => {
    if (!item) return;
    const result = await printProcessingLabelsAndMarkPrinted([item]);
    if (result.failed > 0) enqueueSnackbar('Label print failed', { variant: 'error' });
    else if (result.succeeded > 0) enqueueSnackbar('Label sent to printer', { variant: 'success' });
    if (result.markFailed) enqueueSnackbar('Label printed but printed status could not be saved.', { variant: 'warning' });
    else await queryClient.invalidateQueries({ queryKey: ['items', item.id] });
  };

  if (itemQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!item) {
    return <Typography color="text.secondary">Item not found.</Typography>;
  }

  const checkIn = checkInQuery.data;
  const product = productQuery.data;
  const itemCount = checkIn?.items.length ?? 1;
  const itemStatusSummary = checkIn ? deriveItemStatusSummary(checkIn.items) : formatStatusLabel(item.status);

  const orderNumber = item.purchase_order_number?.trim() || (item.purchase_order ? `PO ${item.purchase_order}` : '—');
  const orderDescription = checkIn?.purchase_order_description?.trim() || '';
  const orderVendor = checkIn?.purchase_order_vendor_name?.trim() || '';
  const orderDate = checkIn?.purchase_order_ordered_date;
  const productTitle = product ? productDisplayLabel(product) : (item.product_title || '—');
  const productHelper = truncateText(
    [item.product_brand, product?.category_name || ''].filter(Boolean).join(' · '),
    42,
  );
  const checkedInDateLabel = formatCheckedInDateTime(item.checked_in_at);
  const currentStatusLabel = formatStatusLabel(status);

  const orderTooltip = item.purchase_order ? (
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
    <Typography variant="caption">No purchase order linked</Typography>
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
    <Typography variant="caption">{item.product_title || 'No product linked'}</Typography>
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
              Edit item
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.35, color: processingTokens.textMute }}>
              Edit the item details below.
            </Typography>
          </Box>
          <WorkbenchCopyableChip
            size="small"
            label={item.sku}
            copyText={item.sku}
            variant="outlined"
            clickable={Boolean(onFilterItemBySku)}
            onBadgeClick={
              onFilterItemBySku ?
                () => onFilterItemBySku(item.sku, item.id)
              : undefined
            }
            sx={{
              height: 22,
              fontFamily: processingTokens.monoFontFamily,
              fontWeight: 800,
              fontSize: '0.72rem',
              letterSpacing: 0.4,
              borderColor: workbenchDetailTokens.borderSubtle,
              color: processingTokens.textSoft,
              bgcolor: workbenchDetailTokens.headerSubtle,
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
            mono={Boolean(item.purchase_order)}
            tooltip={orderTooltip}
            onClick={
              item.purchase_order && onFilterItemsByOrder ?
                () => onFilterItemsByOrder(item.purchase_order!)
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
              item.product && onFilterItemsByProduct ?
                () => onFilterItemsByProduct(item.product)
              : undefined
            }
          />
          <WorkbenchStatCell
            label="Checked in"
            flex="1 1 116px"
            minWidth={108}
            value={checkedInDateLabel}
            helper={currentStatusLabel}
            tooltip={
              item.item_check_in_id && onOpenCheckIn ?
                <Typography variant="caption">Click to view check-in</Typography>
              : undefined
            }
            onClick={
              item.item_check_in_id && onOpenCheckIn ?
                () => onOpenCheckIn(item.item_check_in_id!)
              : undefined
            }
          />
          <WorkbenchStatCell
            label="# Items"
            flex="1 1 116px"
            minWidth={108}
            value={formatNumber(itemCount)}
            helper={item.item_check_in_id ? 'Click to view items' : 'No check-in linked'}
            tooltip={itemsTooltip}
            onClick={
              item.item_check_in_id && onOpenItemsForCheckIn ?
                () => onOpenItemsForCheckIn(item.item_check_in_id!, item.id, item.sku)
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
          specsHelperText="Supplements the product catalog specs — saved on this item only."
          disabled={locked}
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
          <Button
            size="small"
            variant="outlined"
            startIcon={<LocalPrintshopOutlinedIcon />}
            onClick={() => void handleReprint()}
            sx={{ borderColor: workbenchDetailTokens.borderSubtle, color: processingTokens.textSoft, bgcolor: '#fff' }}
          >
            Reprint
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<SaveOutlinedIcon />}
            disabled={locked || !isDirty || saveMutation.isPending}
            onClick={() => void handleSave()}
            sx={{ bgcolor: processingTokens.primary, '&:hover': { bgcolor: processingTokens.primaryDark }, fontWeight: 800 }}
          >
            Save
          </Button>
        </Stack>
      </Box>
    </Box>
    {SavePrintDialogHost}
    </>
  );
}
