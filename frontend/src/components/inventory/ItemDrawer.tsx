import { useCallback, useEffect } from 'react';
import { useItem } from '../../hooks/useInventory';
import { Box, Drawer, IconButton, Toolbar, Typography } from '@mui/material';
import Close from '@mui/icons-material/Close';
import ItemFormWithActions from './ItemFormWithActions';
import { ITEM_DRAWER_FORM_ID } from './ItemForm';
import type { Item } from '../../types/inventory.types';

const DRAWER_WIDTH = 520;

export type ItemDrawerMode = 'create' | 'edit' | null;

export type ItemDrawerProps = {
  open: boolean;
  mode: ItemDrawerMode;
  itemId: number | null;
  onClose: () => void;
  onItemCreated?: (item: Item, ctx: { keepOpen: boolean }) => void;
};

export default function ItemDrawer({
  open,
  mode,
  itemId,
  onClose,
  onItemCreated,
}: ItemDrawerProps) {
  const { data: titleItem } = useItem(mode === 'edit' ? itemId : null);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const form = document.getElementById(ITEM_DRAWER_FORM_ID) as HTMLFormElement | null;
        form?.requestSubmit();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  const title =
    mode === 'create'
      ? 'Add Item'
      : mode === 'edit'
        ? titleItem
          ? `Edit ${titleItem.sku}`
          : 'Edit item'
        : '';

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      variant="temporary"
      ModalProps={{ keepMounted: true }}
      PaperProps={{
        sx: {
          width: { xs: '100vw', sm: DRAWER_WIDTH },
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Toolbar
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 56,
          px: 1,
          gap: 1,
          justifyContent: 'space-between',
        }}
        disableGutters
      >
        <Typography variant="h6" sx={{ pl: 1, flex: 1 }} noWrap>
          {title}
        </Typography>
        <IconButton onClick={handleClose} aria-label="close" size="small">
          <Close />
        </IconButton>
      </Toolbar>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {mode === 'create' && (
          <ItemFormWithActions
            mode="create"
            itemId={null}
            onItemCreated={onItemCreated}
            onCloseAfterCreate={handleClose}
            onDeleteSuccess={handleClose}
          />
        )}
        {mode === 'edit' && (
          <ItemFormWithActions
            mode="edit"
            itemId={itemId}
            onItemCreated={onItemCreated}
            onDeleteSuccess={handleClose}
          />
        )}
      </Box>
    </Drawer>
  );
}
