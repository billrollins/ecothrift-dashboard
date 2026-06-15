import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LocalPrintshopOutlinedIcon from '@mui/icons-material/LocalPrintshopOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import { getItem, updateItem } from '../../../api/inventory.api';
import { ProductDisplayLine } from '../../../components/inventory/ProductDisplayLine';
import { productLikeFromItemFields } from '../../../utils/productCatalog';
import { formatCurrency } from '../../../utils/format';
import type { WorkbenchSelection } from '../../../utils/richInventorySearch';
import { printProcessingLabelsStaggered } from '../processing/printProcessingLabel';
import { processingTokens } from '../processing/processingTokens';
import { useWorkbenchConfirmDialog } from './useWorkbenchConfirmDialog';

export interface ItemWorkspacePanelProps {
  itemId: number;
  onNavigate: (sel: WorkbenchSelection) => void;
  onEditItem: () => void;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        flex: '1 1 120px',
        minWidth: 110,
        px: 1.5,
        py: 1,
        border: 1,
        borderColor: processingTokens.border,
        borderRadius: 1.5,
        bgcolor: '#fff',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.35, fontWeight: 800, fontSize: '1rem' }}>{value}</Typography>
    </Box>
  );
}

export function ItemWorkspacePanel({ itemId, onNavigate, onEditItem }: ItemWorkspacePanelProps) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { confirm, ConfirmDialogHost } = useWorkbenchConfirmDialog();

  const itemQuery = useQuery({
    queryKey: ['items', 'workbench', itemId],
    queryFn: async () => (await getItem(itemId)).data,
  });

  const salvageMutation = useMutation({
    mutationFn: async () => updateItem(itemId, { condition: 'salvage', status: 'scrapped', location: 'salvage' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      enqueueSnackbar('Item marked salvage', { variant: 'success' });
    },
    onError: () => enqueueSnackbar('Could not update item', { variant: 'error' }),
  });

  const soldMutation = useMutation({
    mutationFn: async () => updateItem(itemId, {
      status: 'sold',
      sold_at: new Date().toISOString(),
      sold_for: itemQuery.data?.price,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      enqueueSnackbar('Item marked sold', { variant: 'success' });
    },
    onError: () => enqueueSnackbar('Could not mark item sold', { variant: 'error' }),
  });

  if (itemQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const item = itemQuery.data;
  if (!item) {
    return <Typography color="text.secondary">Item not found.</Typography>;
  }

  const productDisplay = item.product ?
    productLikeFromItemFields(item.product, item)
  : null;

  const handleReprint = async () => {
    const { succeeded, failed } = await printProcessingLabelsStaggered([item]);
    if (failed > 0) enqueueSnackbar('Label print failed', { variant: 'error' });
    else if (succeeded > 0) enqueueSnackbar('Label sent to printer', { variant: 'success' });
  };

  return (
    <>
    <Stack spacing={2}>
      <Box>
        <Chip label="Item" size="small" color="primary" variant="outlined" sx={{ mb: 1 }} />
        <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: processingTokens.monoFontFamily }}>
          {item.sku}
        </Typography>
      </Box>

      {productDisplay ?
        <ProductDisplayLine product={productDisplay} variant="selected" />
      : null}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <StatTile label="Status" value={item.status.replace(/_/g, ' ')} />
        <StatTile label="Condition" value={String(item.condition).replace(/_/g, ' ')} />
        <StatTile label="Price" value={formatCurrency(item.price)} />
        <StatTile label="Location" value={item.location?.trim() || '—'} />
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button variant="contained" startIcon={<LocalPrintshopOutlinedIcon />} onClick={() => void handleReprint()}>
          Reprint tag
        </Button>
        <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={onEditItem}>
          Edit item
        </Button>
        <Button
          variant="outlined"
          color="warning"
          disabled={salvageMutation.isPending || item.status === 'sold' || item.status === 'scrapped'}
          onClick={() => {
            void (async () => {
              const ok = await confirm({
                title: 'Mark as salvage?',
                message: `Mark ${item.sku} as salvage/scrapped?`,
                confirmLabel: 'Mark salvage',
                severity: 'warning',
              });
              if (ok) salvageMutation.mutate();
            })();
          }}
        >
          Mark salvage
        </Button>
        <Button
          variant="outlined"
          startIcon={<SellOutlinedIcon />}
          disabled={soldMutation.isPending || item.status === 'sold' || Boolean(item.sold_at)}
          onClick={() => {
            void (async () => {
              const ok = await confirm({
                title: 'Mark as sold?',
                message: `Mark ${item.sku} as sold at ${formatCurrency(item.price)}?`,
                confirmLabel: 'Mark sold',
                severity: 'info',
                confirmColor: 'primary',
              });
              if (ok) soldMutation.mutate();
            })();
          }}
        >
          Mark sold
        </Button>
        {item.product ?
          <Button
            variant="text"
            startIcon={<OpenInNewOutlinedIcon />}
            onClick={() => onNavigate({
              type: 'product',
              id: item.product,
              label: item.product_title || `Product #${item.product}`,
            })}
          >
            Open product
          </Button>
        : null}
        {item.item_check_in_id ?
          <Button
            variant="text"
            startIcon={<OpenInNewOutlinedIcon />}
            onClick={() => onNavigate({
              type: 'checkin',
              id: item.item_check_in_id!,
              label: `Check-in #${item.item_check_in_id}`,
            })}
          >
            Open check-in
          </Button>
        : null}
      </Stack>

      {item.notes ?
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>Notes</Typography>
          <Typography variant="body2">{item.notes}</Typography>
        </Box>
      : null}
    </Stack>
    {ConfirmDialogHost}
    </>
  );
}
