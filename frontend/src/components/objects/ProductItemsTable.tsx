/**
 * The items of one product: SKU, status, price, where it is, where it came from. Used under a row of
 * Inventory search and on the product page. A price is edited in place; a tag is reprinted from the row.
 */
import { useRef, useState } from 'react';
import {
  Box, Chip, CircularProgress, IconButton, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { Link as RouterLink } from 'react-router-dom';
import { updateItem } from '../../api/inventory.api';
import { getProductItems, type InventorySearchItem } from '../../api/inventorySearch.api';
import { printProcessingLabelsAndMarkPrinted } from '../../pages/inventory/processing/printProcessingLabel';
import { formatCurrency } from '../../utils/format';
import { StatusBadge } from '../common/StatusBadge';
import { SelectBox, useOptionalSelection } from './bulkTools';
import { ObjectLink } from './ObjectModal';
import { IconPrint as Print } from '../../icons/ecoIcons';

export interface ProductLabelInfo {
  title: string;
  brand: string;
  product_number: string;
}

function shortDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

/** When it was checked in, and by whom. */
function checkedIn(item: InventorySearchItem): string {
  return [shortDate(item.checked_in_at), item.checked_in_by].filter(Boolean).join(' · ');
}

/** Where it came from: its order, or Misfit (no purchase order). */
function OrderCell({ item }: { item: InventorySearchItem }) {
  const order = item.purchase_order_id ? (
    <Link component={RouterLink} to={`/inventory/orders/${item.purchase_order_id}`} underline="hover"
      sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
      {item.order_number || `#${item.purchase_order_id}`}
    </Link>
  ) : null;
  if (!item.misfit) return order;
  return (
    <Tooltip title={item.order_number ? `No purchase order (kept on ${item.order_number})` : 'No purchase order'}>
      <Chip size="small" variant="outlined" color="warning" label="Misfit" sx={{ height: 20 }} />
    </Tooltip>
  );
}

/** What the item sold for (or its shelf price) as a share of its retail. */
function pctOfRetail(item: InventorySearchItem): string {
  const retail = Number(item.retail);
  const amount = Number(item.sold_at && item.sold_for ? item.sold_for : item.price);
  if (!(retail > 0) || !Number.isFinite(amount)) return '';
  return `${Math.round((100 * amount) / retail)}%`;
}

function PriceCell({ item, onSaved }: { item: InventorySearchItem; onSaved: (price: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  // Enter saves, and the field then loses focus, which would save a second time.
  const busy = useRef(false);
  const { enqueueSnackbar } = useSnackbar();

  if (item.status !== 'on_shelf') return <>{item.price ? formatCurrency(item.price) : ''}</>;
  if (!editing) {
    return (
      <Tooltip title="Click to change the price">
        <Link
          component="button"
          type="button"
          underline="hover"
          onClick={() => {
            setValue(item.price ?? '');
            setEditing(true);
          }}
          sx={{ fontSize: 'inherit', fontWeight: 600 }}
        >
          {item.price ? formatCurrency(item.price) : 'Set price'}
        </Link>
      </Tooltip>
    );
  }
  const save = async () => {
    if (busy.current) return;
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n) || n < 0) {
      enqueueSnackbar('Enter a price like 12.99.', { variant: 'warning' });
      return;
    }
    const price = n.toFixed(2);
    if (price === item.price) {
      setEditing(false);
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      await updateItem(item.id, { price });
      setEditing(false);
      onSaved(price);
    } catch {
      enqueueSnackbar('The price was not saved.', { variant: 'error' });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return (
    <TextField
      size="small"
      autoFocus
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void save();
        if (e.key === 'Escape') setEditing(false);
      }}
      inputProps={{ inputMode: 'decimal', 'aria-label': `Price for ${item.sku}`, style: { width: 72, padding: '2px 6px' } }}
    />
  );
}

export function ProductItemsTable({
  productId,
  includeSold,
  product,
  highlightSku,
}: {
  productId: number;
  includeSold: boolean;
  product: ProductLabelInfo;
  highlightSku?: string;
}) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const selection = useOptionalSelection();
  const wholeProduct = !!selection?.productIds.has(productId);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory-search-items', productId, includeSold],
    queryFn: async ({ signal }) => (await getProductItems(productId, includeSold, signal)).data,
  });

  const reprint = async (item: InventorySearchItem, price?: string) => {
    const result = await printProcessingLabelsAndMarkPrinted(
      [{
        id: item.id, sku: item.sku, price: price ?? item.price ?? '', product_title: product.title,
        product_brand: product.brand, product_number: product.product_number,
      }],
    );
    enqueueSnackbar(result.failed > 0 ? 'The tag did not print.' : `Tag printed for ${item.sku}.`, {
      variant: result.failed > 0 ? 'error' : 'success',
    });
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['inventory-search-items', productId] });
    void queryClient.invalidateQueries({ queryKey: ['inventory-search'] });
  };
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));

  const priceSaved = (item: InventorySearchItem) => (price: string) => {
    refresh();
    enqueueSnackbar(`Price saved for ${item.sku}.`, {
      variant: 'success',
      action: () => (
        <Link component="button" type="button" color="inherit" onClick={() => void reprint(item, price)} sx={{ mr: 1 }}>
          Reprint tag
        </Link>
      ),
    });
  };
  const reprintButton = (item: InventorySearchItem) => item.status === 'on_shelf' && (
    <Tooltip title={item.label_printed_at ? `Reprint tag (printed ${shortDate(item.label_printed_at)})` : 'Print tag'}>
      <IconButton size="small" onClick={() => void reprint(item)} aria-label={`Reprint tag for ${item.sku}`}>
        <Print fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  if (isLoading) return <CircularProgress size={20} sx={{ m: 1.5 }} />;
  if (isError || !data) return <Typography sx={{ p: 1.5 }} color="error">The items could not be loaded.</Typography>;
  if (!data.items.length) return <Typography sx={{ p: 1.5 }} color="text.secondary">No items.</Typography>;

  if (phone) {
    // A phone: one short card per item instead of thirteen columns.
    return (
      <Box>
        {data.items.map((item) => (
          <Box key={item.id} sx={{ py: 1, borderBottom: 1, borderColor: 'divider',
            bgcolor: highlightSku && item.sku === highlightSku ? 'action.selected' : undefined }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              {selection && item.status === 'on_shelf' && (
                <SelectBox kind="item" id={item.id} label={`Select ${item.sku}`} forced={wholeProduct} />
              )}
              <ObjectLink type="item" id={item.id} label={item.sku} />
              <StatusBadge status={item.status} size="small" />
              <Box sx={{ flex: 1 }} />
              <Typography variant="body2" component="div"><PriceCell item={item} onSaved={priceSaved(item)} /></Typography>
              {reprintButton(item)}
            </Stack>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ textTransform: 'capitalize' }}>
              {[item.retail && Number(item.retail) > 0 ? `retail ${formatCurrency(item.retail)}` : '', pctOfRetail(item),
                item.condition.replace(/_/g, ' '), item.location.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.25 }}>
              <OrderCell item={item} />
              <Typography variant="caption" color="text.secondary">
                {[checkedIn(item) && `in ${checkedIn(item)}`,
                  item.sold_at && `sold ${shortDate(item.sold_at)}${item.sold_for ? ` · ${formatCurrency(item.sold_for)}` : ''}`]
                  .filter(Boolean).join(' · ')}
              </Typography>
            </Stack>
          </Box>
        ))}
        {data.count > data.items.length && (
          <Typography variant="caption" color="text.secondary" sx={{ py: 1, display: 'block' }}>
            Showing {data.items.length} of {data.count} items. Open the product for all of them.
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Table size="small" aria-label="Items" sx={{ '& th, & td': { whiteSpace: 'nowrap' } }}>
        <TableHead>
          <TableRow>
            {selection && <TableCell padding="checkbox" />}
            <TableCell>SKU</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Price</TableCell>
            <TableCell align="right">Retail</TableCell>
            <TableCell align="right">% of retail</TableCell>
            <TableCell>Condition</TableCell>
            <TableCell>Location</TableCell>
            <TableCell>Check-in</TableCell>
            <TableCell>Order</TableCell>
            <TableCell>Checked in</TableCell>
            <TableCell>Sold</TableCell>
            <TableCell align="right">Tag</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.items.map((item) => (
            <TableRow key={item.id} selected={!!highlightSku && item.sku === highlightSku}>
              {selection && (
                <TableCell padding="checkbox">
                  {item.status === 'on_shelf' && (
                    <SelectBox kind="item" id={item.id} label={`Select ${item.sku}`} forced={wholeProduct} />
                  )}
                </TableCell>
              )}
              <TableCell><ObjectLink type="item" id={item.id} label={item.sku} /></TableCell>
              <TableCell><StatusBadge status={item.status} size="small" /></TableCell>
              <TableCell align="right">
                <PriceCell item={item} onSaved={priceSaved(item)} />
              </TableCell>
              <TableCell align="right">{item.retail && Number(item.retail) > 0 ? formatCurrency(item.retail) : ''}</TableCell>
              <TableCell align="right">{pctOfRetail(item)}</TableCell>
              <TableCell sx={{ textTransform: 'capitalize' }}>{item.condition.replace(/_/g, ' ')}</TableCell>
              <TableCell>{item.location.replace(/_/g, ' ')}</TableCell>
              <TableCell>{item.check_in_id ? <ObjectLink type="checkin" id={item.check_in_id} /> : ''}</TableCell>
              <TableCell><OrderCell item={item} /></TableCell>
              <TableCell>{checkedIn(item)}</TableCell>
              <TableCell>
                {item.sold_at ? `${shortDate(item.sold_at)}${item.sold_for ? ` · ${formatCurrency(item.sold_for)}` : ''}` : ''}
              </TableCell>
              <TableCell align="right">{reprintButton(item)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.count > data.items.length && (
        <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: 'block' }}>
          Showing {data.items.length} of {data.count} items. Open the product for all of them.
        </Typography>
      )}
    </Box>
  );
}
