import { useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../common/ConfirmDialog';
import ItemActionBar from './ItemActionBar';
import ItemForm, { ITEM_DRAWER_FORM_ID } from './ItemForm';
import ItemStatsPanel from './ItemStatsPanel';
import { useDeleteItem, useItem, useMarkItemReady } from '../../hooks/useInventory';
import type { Item } from '../../types/inventory.types';
import { localPrintService } from '../../services/localPrintService';

export type ItemFormWithActionsProps = {
  mode: 'create' | 'edit';
  itemId: number | null;
  onItemCreated?: (item: Item, ctx: { keepOpen: boolean }) => void;
  onCloseAfterCreate?: () => void;
  /** After successful delete (default in drawer: same as closing) */
  onDeleteSuccess?: () => void;
  formId?: string;
};

/**
 * Item form + top action bar + single scroll area (form + inventory stats).
 */
export default function ItemFormWithActions({
  mode,
  itemId,
  onItemCreated,
  onCloseAfterCreate,
  onDeleteSuccess,
  formId = ITEM_DRAWER_FORM_ID,
}: ItemFormWithActionsProps) {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { data: item, isLoading: itemLoading } = useItem(mode === 'edit' ? itemId : null);
  const deleteItem = useDeleteItem();
  const markReady = useMarkItemReady();

  const [formPending, setFormPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createResetKey, setCreateResetKey] = useState(0);
  const [statsCtx, setStatsCtx] = useState<{ productId: number | null; category: string | null }>({
    productId: null,
    category: null,
  });

  const handlePrintTag = async () => {
    if (!item) return;
    const ok = await localPrintService
      .printLabel({
        qr_data: item.sku,
        text: `$${Number(item.price).toFixed(2)}`,
        product_title: item.title,
        product_brand: item.brand?.trim() || undefined,
        product_model: item.product_number?.trim() || undefined,
        include_text: true,
      })
      .then(() => true)
      .catch(() => false);
    if (ok) enqueueSnackbar('Label sent to printer', { variant: 'success' });
    else enqueueSnackbar('Print server may be offline', { variant: 'warning' });
  };

  const handleReprice = () => {
    if (!item) return;
    navigate(`/inventory/quick-reprice?sku=${encodeURIComponent(item.sku)}`);
  };

  const handleDelete = async () => {
    if (!item) return;
    try {
      await deleteItem.mutateAsync(item.id);
      enqueueSnackbar('Item deleted', { variant: 'success' });
      setDeleteOpen(false);
      onDeleteSuccess?.();
    } catch {
      enqueueSnackbar('Failed to delete item', { variant: 'error' });
    }
  };

  const handleMarkReady = async () => {
    if (!item) return;
    try {
      await markReady.mutateAsync(item.id);
      enqueueSnackbar('Item marked as ready (on shelf)', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to mark item ready', { variant: 'error' });
    }
  };

  const statsEnabled = mode === 'create' || Boolean(item);

  const statsSlot = (
    <ItemStatsPanel
      productId={statsCtx.productId}
      category={statsCtx.category}
      enabled={statsEnabled}
    />
  );

  return (
    <>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <ItemActionBar
          mode={mode}
          item={item}
          itemLoading={itemLoading}
          formId={formId}
          formPending={formPending}
          onPrintTag={() => void handlePrintTag()}
          onReprice={handleReprice}
          onMarkReady={() => void handleMarkReady()}
          onDeleteClick={() => setDeleteOpen(true)}
          markReadyPending={markReady.isPending}
          placement="top"
          onClear={mode === 'create' ? () => setCreateResetKey((k) => k + 1) : undefined}
          onCancel={mode === 'create' ? onCloseAfterCreate : undefined}
        />

        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 0.5 }}>
          {mode === 'edit' && itemLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          )}
          {mode === 'create' && (
            <ItemForm
              key={`create-${createResetKey}`}
              mode="create"
              onItemCreated={onItemCreated}
              onCloseAfterCreate={onCloseAfterCreate}
              onPendingChange={setFormPending}
              onStatsContext={setStatsCtx}
              inventoryStatsSlot={statsSlot}
            />
          )}
          {mode === 'edit' && item && !itemLoading && (
            <ItemForm
              key={item.id}
              mode="edit"
              item={item}
              onPendingChange={setFormPending}
              onStatsContext={setStatsCtx}
              inventoryStatsSlot={statsSlot}
            />
          )}
        </Box>
      </Box>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Item"
        message={item ? `Delete item ${item.sku}? This cannot be undone.` : ''}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
        loading={deleteItem.isPending}
      />
    </>
  );
}
