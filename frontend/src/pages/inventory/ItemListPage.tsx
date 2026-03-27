import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';
import ItemFormWithActions from '../../components/inventory/ItemFormWithActions';
import ItemListPanel from '../../components/inventory/ItemListPanel';
import { useRecentlyAddedItems } from '../../hooks/useRecentlyAddedItems';
import { useItem } from '../../hooks/useInventory';
import type { Item } from '../../types/inventory.types';
import { ITEMS_SPLIT_ROW_HEIGHT } from '../../constants/itemsPageLayout';

type PanelState = 'idle' | 'create' | 'edit';

export default function ItemListPage() {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [panel, setPanel] = useState<PanelState>('idle');
  const [editId, setEditId] = useState<number | null>(null);
  const [listTotal, setListTotal] = useState(0);
  const { recentlyAddedIds, onItemCreated } = useRecentlyAddedItems();

  const { data: headerItem } = useItem(panel === 'edit' && editId != null ? editId : null);

  const detailOpen = panel !== 'idle';

  const openRow = useCallback((item: Item) => {
    setPanel('edit');
    setEditId(item.id);
  }, []);

  const openAdd = useCallback(() => {
    setPanel('create');
    setEditId(null);
  }, []);

  const closePanel = useCallback(() => {
    setPanel('idle');
    setEditId(null);
  }, []);

  const handleListCounts = useCallback(({ total }: { total: number }) => {
    setListTotal(total);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('[role="dialog"]')) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openAdd();
      }
      if (e.key === 'Escape' && detailOpen) {
        e.preventDefault();
        closePanel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePanel, detailOpen, openAdd]);

  const rightToolbarTitle =
    panel === 'create' ? (
      <Typography variant="subtitle1">Add item</Typography>
    ) : panel === 'edit' && headerItem ? (
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" noWrap>
          {headerItem.title}
        </Typography>
        <Typography variant="caption" color="text.secondary" fontFamily="monospace" display="block">
          {headerItem.sku}
        </Typography>
      </Box>
    ) : (
      <Typography variant="subtitle1" color="text.secondary">
        Details
      </Typography>
    );

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={1.5}
        sx={{ mb: 2 }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
          <Typography variant="h5" fontWeight={600}>
            Items
          </Typography>
          <Chip
            size="small"
            label={`${listTotal.toLocaleString()} total`}
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        </Stack>
        <Button variant="contained" startIcon={<Add />} onClick={openAdd} disabled={panel === 'create'}>
          Add Item
        </Button>
      </Stack>

      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: 'stretch',
          gap: { md: 1.5 },
          minHeight: { xs: 'calc(100vh - 200px)', md: ITEMS_SPLIT_ROW_HEIGHT },
          height: { md: ITEMS_SPLIT_ROW_HEIGHT },
        }}
      >
        <Box
          sx={{
            flex: isMdUp ? (detailOpen ? '0 0 55%' : '1 1 100%') : '1 1 auto',
            minWidth: 0,
            minHeight: 0,
            display: { xs: detailOpen ? 'none' : 'flex', md: 'flex' },
            flexDirection: 'column',
            height: { md: '100%' },
            transition: theme.transitions.create(['flex-basis', 'max-width'], {
              duration: theme.transitions.duration.standard,
            }),
          }}
        >
          <ItemListPanel
            ref={searchInputRef}
            onRowClick={openRow}
            recentlyAddedIds={recentlyAddedIds}
            selectedItemId={panel === 'edit' ? editId : null}
            onCountsChange={handleListCounts}
          />
        </Box>

        {detailOpen && (
          <Box
            sx={{
              flex: isMdUp ? '0 0 45%' : '1 1 auto',
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              height: { md: '100%' },
              ...(!isMdUp
                ? {
                    position: 'fixed',
                    inset: 0,
                    zIndex: theme.zIndex.modal - 1,
                  }
                : {}),
            }}
          >
            <Paper
              elevation={isMdUp ? 2 : 8}
              sx={{
                flex: 1,
                minHeight: { xs: 400, md: 0 },
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderLeft: isMdUp ? 1 : 0,
                borderColor: 'divider',
              }}
            >
              <Toolbar variant="dense" sx={{ borderBottom: 1, borderColor: 'divider', gap: 1, minHeight: 56 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>{rightToolbarTitle}</Box>
                <IconButton edge="end" aria-label="close panel" onClick={closePanel} size="small">
                  <Close />
                </IconButton>
              </Toolbar>

              {panel === 'create' && (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <ItemFormWithActions
                    mode="create"
                    itemId={null}
                    onItemCreated={(item, ctx) => {
                      onItemCreated(item);
                      if (!ctx.keepOpen) closePanel();
                    }}
                    onCloseAfterCreate={closePanel}
                    onDeleteSuccess={closePanel}
                  />
                </Box>
              )}

              {panel === 'edit' && editId !== null && (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <ItemFormWithActions
                    mode="edit"
                    itemId={editId}
                    onItemCreated={undefined}
                    onDeleteSuccess={closePanel}
                  />
                </Box>
              )}
            </Paper>
          </Box>
        )}
      </Box>
    </Box>
  );
}
