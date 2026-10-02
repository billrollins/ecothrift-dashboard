/**
 * A product's full page (`/inventory/products/:id`): the room to do a lot. Tabs: the product itself, every item,
 * every check-in. The quick look is the product modal (`components/objects/ObjectModal.tsx`).
 */
import { useState } from 'react';
import ArrowBack from '@mui/icons-material/ArrowBack';
import {
  Box, Button, CircularProgress, Paper, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { getItemCheckIns, getProduct } from '../../api/inventory.api';
import { PageHeader } from '../../components/common/PageHeader';
import { ObjectLink, ObjectModalProvider, useObjectModal } from '../../components/objects/ObjectModal';
import { ProductItemsTable } from '../../components/objects/ProductItemsTable';
import { ProductManagePanel } from './manage/ProductManageDrawer';

type ProductTab = 'product' | 'items' | 'checkins';

function CheckInsTab({ productId }: { productId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['product-page-checkins', productId],
    queryFn: async () => (await getItemCheckIns({ product: productId, page_size: 200, ordering: '-created_at' })).data,
  });
  if (isLoading) return <CircularProgress size={20} sx={{ m: 2 }} />;
  const rows = data?.results ?? [];
  if (!rows.length) return <Typography sx={{ p: 2 }} color="text.secondary">No check-ins.</Typography>;
  return (
    <Table size="small" aria-label="Check-ins">
      <TableHead>
        <TableRow>
          <TableCell>Check-in</TableCell>
          <TableCell>Date</TableCell>
          <TableCell>Order</TableCell>
          <TableCell>Vendor</TableCell>
          <TableCell align="right">Quantity</TableCell>
          <TableCell align="right">Items</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell><ObjectLink type="checkin" id={c.id} /></TableCell>
            <TableCell>{new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</TableCell>
            <TableCell>
              <RouterLink to={`/inventory/orders/${c.purchase_order}`}>{c.purchase_order_number || `#${c.purchase_order}`}</RouterLink>
            </TableCell>
            <TableCell>{c.purchase_order_vendor_name || ''}</TableCell>
            <TableCell align="right">{c.quantity}</TableCell>
            <TableCell align="right">{c.item_count}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ProductBody({ productId }: { productId: number }) {
  const [tab, setTab] = useState<ProductTab>('product');
  const navigate = useNavigate();
  const { openObject } = useObjectModal();
  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product-page', productId],
    queryFn: async () => (await getProduct(productId)).data,
  });

  if (isLoading) return <CircularProgress sx={{ m: 4 }} />;
  if (isError || !product) return <Typography sx={{ p: 3 }}>This product could not be loaded.</Typography>;

  return (
    <Box>
      <PageHeader
        title={product.title}
        subtitle={[product.product_number, product.brand].filter(Boolean).join(' · ')}
        dense
        action={
          <Button size="small" startIcon={<ArrowBack fontSize="small" />} onClick={() => navigate('/inventory/search')}>
            Inventory search
          </Button>
        }
      />
      <Tabs value={tab} onChange={(_e, next: ProductTab) => setTab(next)} sx={{ mb: 1 }}>
        <Tab value="product" label="Product" />
        <Tab value="items" label="Items" />
        <Tab value="checkins" label="Check-ins" />
      </Tabs>
      <Paper variant="outlined" sx={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
        {tab === 'product' && (
          <ProductManagePanel
            open
            embedded
            initialProduct={product}
            onClose={() => navigate('/inventory/search')}
            onStartProductCheckIn={(id) => openObject({ type: 'new-checkin', id })}
            onOpenProductCheckIns={() => setTab('checkins')}
            onOpenItemsForProduct={() => setTab('items')}
          />
        )}
        {tab === 'items' && (
          <ProductItemsTable
            productId={productId}
            includeSold
            product={{ title: product.title, brand: product.brand, product_number: product.product_number ?? '' }}
          />
        )}
        {tab === 'checkins' && <CheckInsTab productId={productId} />}
      </Paper>
    </Box>
  );
}

export default function ProductPage() {
  const { id } = useParams();
  const productId = Number.parseInt(id ?? '', 10);
  if (!Number.isFinite(productId)) return <Typography sx={{ p: 3 }}>No such product.</Typography>;
  return (
    <ObjectModalProvider>
      <ProductBody key={productId} productId={productId} />
    </ObjectModalProvider>
  );
}
