import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import type { Product } from '../../../types/inventory.types';
import {
  getItemCheckIns,
  getItems,
  getProduct,
  getProductUsage,
} from '../../../api/inventory.api';
import { ProductDisplayLine } from '../../../components/inventory/ProductDisplayLine';
import { formatCurrency } from '../../../utils/format';
import type { WorkbenchSelection } from '../../../utils/richInventorySearch';
import { processingTokens } from '../processing/processingTokens';

export interface ProductWorkspacePanelProps {
  productId: number;
  onNavigate: (sel: WorkbenchSelection) => void;
  onCheckInMore: (product: Product) => void;
  onEditProduct: (product: Product) => void;
  onCopyProduct: (product: Product) => void;
}

function StatTile({ label, value }: { label: string; value: string | number }) {
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

export function ProductWorkspacePanel({
  productId,
  onNavigate,
  onCheckInMore,
  onEditProduct,
  onCopyProduct,
}: ProductWorkspacePanelProps) {
  const productQuery = useQuery({
    queryKey: ['products', 'workbench', productId],
    queryFn: async () => (await getProduct(productId)).data,
  });
  const usageQuery = useQuery({
    queryKey: ['product-usage', productId],
    queryFn: async () => (await getProductUsage(productId)).data,
  });
  const checkInsQuery = useQuery({
    queryKey: ['item-check-ins', 'product', productId],
    queryFn: async () => (await getItemCheckIns({ product: productId, page_size: 8 })).data,
  });
  const itemsQuery = useQuery({
    queryKey: ['items', 'product-workspace', productId],
    queryFn: async () => (
      await getItems({ product: productId, ordering: '-checked_in_at,-id', page_size: 12 })
    ).data,
  });

  if (productQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const product = productQuery.data;
  if (!product) {
    return <Typography color="text.secondary">Product not found.</Typography>;
  }

  const usage = usageQuery.data;
  const checkIns = checkInsQuery.data?.results ?? [];
  const items = itemsQuery.data?.results ?? [];
  const soldItems = items.filter((it) => it.status === 'sold');
  const avgSold = usage?.avg_sold_price ? formatCurrency(usage.avg_sold_price) : '-';

  return (
    <Stack spacing={2}>
      <Box>
        <Chip label="Product" size="small" color="primary" variant="outlined" sx={{ mb: 1 }} />
        <ProductDisplayLine product={product} variant="selected" />
      </Box>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <StatTile label="On shelf" value={usage?.on_shelf_count ?? usage?.status_counts?.find((s) => s.status === 'on_shelf')?.count ?? '-'} />
        <StatTile label="Sold" value={usage?.sold_count ?? '-'} />
        <StatTile label="Ever" value={usage?.item_count ?? '-'} />
        <StatTile label="Avg sold" value={avgSold} />
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button variant="contained" startIcon={<Inventory2OutlinedIcon />} onClick={() => onCheckInMore(product)}>
          Check in more
        </Button>
        <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => onEditProduct(product)}>
          Edit product
        </Button>
        <Button variant="outlined" startIcon={<ContentCopyOutlinedIcon />} onClick={() => onCopyProduct(product)}>
          Copy / variant
        </Button>
      </Stack>

      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Recent check-ins</Typography>
        {checkIns.length === 0 ?
          <Typography variant="body2" color="text.secondary">No check-ins yet.</Typography>
        : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Check-in</TableCell>
                <TableCell>Qty</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {checkIns.map((ci) => (
                <TableRow
                  key={ci.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => onNavigate({ type: 'checkin', id: ci.id, label: `Check-in #${ci.id}` })}
                >
                  <TableCell>#{ci.id}</TableCell>
                  <TableCell>{ci.quantity}</TableCell>
                  <TableCell>{ci.created_at ? new Date(ci.created_at).toLocaleString() : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Items for this product</Typography>
        {items.length === 0 ?
          <Typography variant="body2" color="text.secondary">No items yet.</Typography>
        : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>SKU</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Price</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((it) => (
                <TableRow
                  key={it.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => onNavigate({ type: 'item', id: it.id, label: it.sku })}
                >
                  <TableCell>{it.sku}</TableCell>
                  <TableCell sx={{ textTransform: 'capitalize' }}>{it.status.replace(/_/g, ' ')}</TableCell>
                  <TableCell align="right">{formatCurrency(it.price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>

      {soldItems.length > 0 ?
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>Similar pricing context</Typography>
          <Typography variant="body2" color="text.secondary">
            Recent sold prices: {soldItems.slice(0, 5).map((it) => formatCurrency(it.sold_for || it.price)).join(' · ')}
          </Typography>
        </Box>
      : null}
    </Stack>
  );
}
