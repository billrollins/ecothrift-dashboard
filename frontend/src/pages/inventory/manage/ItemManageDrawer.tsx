import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  Dialog,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import type { Item, ItemCondition, ItemSource, ItemStatus, Product } from '../../../types/inventory.types';
import {
  createItem,
  deleteItem,
  getProduct,
  getProducts,
  getProductUsage,
  updateItem,
} from '../../../api/inventory.api';

interface ItemManagePanelProps {
  open: boolean;
  item: Item | null;
  onCancel: () => void;
}

interface ItemFormState {
  productId: string;
  productTitle: string;
  productBrand: string;
  productModel: string;
  productCategory: string;
  productUpc: string;
  productIdentifiersText: string;
  productTagsText: string;
  purchaseOrder: string;
  manifestRow: string;
  source: ItemSource;
  status: ItemStatus;
  condition: ItemCondition;
  price: string;
  retail: string;
  location: string;
  soldFor: string;
  soldAt: string;
  notes: string;
  specificationsText: string;
}

const EMPTY_ITEM_STATE: ItemFormState = {
  productId: '',
  productTitle: '',
  productBrand: 'Generic',
  productModel: '',
  productCategory: '',
  productUpc: '',
  productIdentifiersText: '{}',
  productTagsText: '',
  purchaseOrder: '',
  manifestRow: '',
  source: 'purchased',
  status: 'intake',
  condition: 'unknown',
  price: '0.00',
  retail: '',
  location: '',
  soldFor: '',
  soldAt: '',
  notes: '',
  specificationsText: '{}',
};

const ITEM_STATUSES: ItemStatus[] = ['intake', 'processing', 'on_shelf', 'sold', 'returned', 'scrapped', 'lost'];
const ITEM_SOURCES: ItemSource[] = ['purchased', 'consignment', 'misc'];
const ITEM_CONDITIONS: ItemCondition[] = ['new', 'like_new', 'very_good', 'good', 'fair', 'salvage', 'unknown'];

function prettyJson(value: unknown): string {
  if (value == null) return '{}';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{}';
  }
}

function parseObjectJson(label: string, value: string): Record<string, unknown> {
  const text = value.trim();
  if (!text) return {};
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function tagsFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag.slice(0, 40));
  }
  return out.slice(0, 20);
}

function toInputDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromInputDateTime(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function productToProductFields(product: Product | null) {
  return {
    productTitle: product?.title || '',
    productBrand: product?.brand || 'Generic',
    productModel: product?.model || '',
    productCategory: product?.category_name || '',
    productUpc: product?.identifiers?.upc || product?.upc || '',
    productIdentifiersText: prettyJson(product?.identifiers || {}),
    productTagsText: (product?.tags || []).join(', '),
  };
}

function itemToState(item: Item | null): ItemFormState {
  if (!item) return EMPTY_ITEM_STATE;
  return {
    ...EMPTY_ITEM_STATE,
    productId: item.product ? String(item.product) : '',
    productTitle: item.product_title || item.title || '',
    productBrand: item.product_brand || item.brand || 'Generic',
    productModel: item.product_model || '',
    productCategory: item.category || '',
    productUpc: item.product_upc || '',
    purchaseOrder: item.purchase_order ? String(item.purchase_order) : '',
    manifestRow: item.manifest_row ? String(item.manifest_row) : '',
    source: item.source,
    status: item.status,
    condition: item.condition,
    price: item.price || '0.00',
    retail: item.retail || item.retail_value || '',
    location: item.location || '',
    soldFor: item.sold_for || '',
    soldAt: toInputDateTime(item.sold_at),
    notes: item.notes || '',
    specificationsText: prettyJson(item.specifications || {}),
  };
}

export function ItemManagePanel({ open, item, onCancel }: ItemManagePanelProps) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [state, setState] = useState<ItemFormState>(EMPTY_ITEM_STATE);
  const [error, setError] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [editLinkedProduct, setEditLinkedProduct] = useState(false);

  const isEdit = !!item;

  useEffect(() => {
    setState(itemToState(item));
    setError('');
    setProductSearch('');
    setEditLinkedProduct(false);
  }, [item]);

  const linkedProductQuery = useQuery({
    queryKey: ['products', 'detail', state.productId],
    queryFn: async () => {
      const { data } = await getProduct(Number(state.productId));
      return data;
    },
    enabled: open && !!state.productId,
  });

  useEffect(() => {
    const product = linkedProductQuery.data;
    if (!product || editLinkedProduct) return;
    setState((prev) => ({ ...prev, ...productToProductFields(product) }));
  }, [linkedProductQuery.data, editLinkedProduct]);

  const usageQuery = useQuery({
    queryKey: ['product-usage', state.productId],
    queryFn: async () => {
      const { data } = await getProductUsage(Number(state.productId));
      return data;
    },
    enabled: open && !!state.productId,
  });

  const productSearchQuery = useQuery({
    queryKey: ['products', 'item-modal-search', productSearch],
    queryFn: async () => {
      const { data } = await getProducts({ search: productSearch.trim(), page_size: 20 });
      return data.results ?? [];
    },
    enabled: open && productSearch.trim().length >= 2,
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        purchase_order: state.purchaseOrder.trim() ? Number(state.purchaseOrder) : null,
        manifest_row: state.manifestRow.trim() ? Number(state.manifestRow) : null,
        source: state.source,
        status: state.status,
        condition: state.condition,
        price: state.price.trim() || '0.00',
        retail: state.retail.trim() || null,
        location: state.location.trim(),
        sold_for: state.soldFor.trim() || null,
        sold_at: fromInputDateTime(state.soldAt),
        notes: state.notes,
        specifications: parseObjectJson('Item specifications', state.specificationsText),
      };

      const productId = state.productId.trim();
      if (productId) payload.product = Number(productId);

      if (!productId || editLinkedProduct) {
        const identifiers = parseObjectJson('Product identifiers', state.productIdentifiersText);
        const upc = state.productUpc.trim();
        if (upc) identifiers.upc = upc;
        payload.title = state.productTitle.trim();
        payload.brand = state.productBrand.trim() || 'Generic';
        payload.model = state.productModel.trim();
        payload.category = state.productCategory.trim();
        payload.identifiers = identifiers;
        payload.tags = tagsFromText(state.productTagsText);
        if (!payload.title) throw new Error('Product title is required when no existing Product is attached.');
      }

      if (isEdit && item) {
        const { data } = await updateItem(item.id, payload);
        return data;
      }
      const { data } = await createItem(payload);
      return data;
    },
    onSuccess: async () => {
      enqueueSnackbar(isEdit ? 'Item updated.' : 'Item created.', { variant: 'success' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
      onCancel();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not save item.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!item) return;
      await deleteItem(item.id);
    },
    onSuccess: async () => {
      enqueueSnackbar('Item deleted.', { variant: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      onCancel();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not delete item.');
    },
  });

  const setField = <K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const usage = usageQuery.data;
  const selectedProduct = linkedProductQuery.data || null;
  const productOptions = productSearchQuery.data ?? [];
  const productLabel = useMemo(() => {
    if (!selectedProduct) return '';
    return `${selectedProduct.product_number || selectedProduct.id} · ${selectedProduct.brand} ${selectedProduct.title}`;
  }, [selectedProduct]);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      fullWidth
      maxWidth="xl"
      PaperProps={{
        sx: {
          height: { xs: '100%', md: '92vh' },
          maxHeight: { xs: '100%', md: '92vh' },
          m: { xs: 0, md: 2 },
          borderRadius: { xs: 0, md: 2 },
        },
      }}
    >
      <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, flex: 1, boxSizing: 'border-box' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>{isEdit ? 'Edit Item' : 'New Item'}</Typography>
            <Typography variant="body2" color="text.secondary">
              Item owns physical-unit facts. Product owns catalog identity shown on labels, search, and POS.
            </Typography>
          </Box>
          {item ? <Chip label={item.sku} color="primary" variant="outlined" /> : <Chip label="SKU auto-created" variant="outlined" />}
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}
        {usage && state.productId ?
          <Alert severity={editLinkedProduct ? 'warning' : 'info'}>
            Linked Product affects {usage.item_count} item{usage.item_count === 1 ? '' : 's'} across {usage.order_count} order{usage.order_count === 1 ? '' : 's'}.
            {editLinkedProduct ? ' Product identity edits will update every linked Item display.' : ' Leave Product edit off to edit only this physical Item.'}
          </Alert>
        : null}

        <Box sx={{ overflowY: 'auto', pr: 0.5, flex: 1 }}>
          <Stack spacing={2}>
            <Section title="Linked Product">
              <Autocomplete
                options={productOptions}
                loading={productSearchQuery.isFetching}
                value={selectedProduct}
                inputValue={productSearch || productLabel}
                onInputChange={(_, value, reason) => {
                  if (reason === 'input') setProductSearch(value);
                  if (reason === 'clear') setProductSearch('');
                }}
                onChange={(_, value) => {
                  setState((prev) => ({
                    ...prev,
                    productId: value ? String(value.id) : '',
                    ...productToProductFields(value),
                  }));
                  setProductSearch('');
                  setEditLinkedProduct(false);
                }}
                getOptionLabel={(p) => `${p.product_number || p.id} · ${p.brand} ${p.title}`}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Search / attach existing Product"
                    helperText="Clear this to create a new Product from the fields below."
                  />
                )}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {state.productId ? 'Using an existing Product.' : 'No Product attached: saving will create a new Product.'}
                </Typography>
                {state.productId ?
                  <FormControlLabel
                    control={<Switch checked={editLinkedProduct} onChange={(e) => setEditLinkedProduct(e.target.checked)} />}
                    label="Edit linked Product fields"
                  />
                : null}
              </Box>
              <TwoCol>
                <TextField
                  label="Product title"
                  value={state.productTitle}
                  onChange={(e) => setField('productTitle', e.target.value)}
                  required={!state.productId || editLinkedProduct}
                  disabled={!!state.productId && !editLinkedProduct}
                  fullWidth
                />
                <TextField
                  label="Product brand"
                  value={state.productBrand}
                  onChange={(e) => setField('productBrand', e.target.value)}
                  disabled={!!state.productId && !editLinkedProduct}
                  fullWidth
                />
                <TextField
                  label="Product model"
                  value={state.productModel}
                  onChange={(e) => setField('productModel', e.target.value)}
                  disabled={!!state.productId && !editLinkedProduct}
                  fullWidth
                />
                <TextField
                  label="Product category"
                  value={state.productCategory}
                  onChange={(e) => setField('productCategory', e.target.value)}
                  disabled={!!state.productId && !editLinkedProduct}
                  fullWidth
                />
                <TextField
                  label="Product UPC"
                  value={state.productUpc}
                  onChange={(e) => setField('productUpc', e.target.value)}
                  disabled={!!state.productId && !editLinkedProduct}
                  fullWidth
                />
                <TextField
                  label="Product tags"
                  value={state.productTagsText}
                  onChange={(e) => setField('productTagsText', e.target.value)}
                  disabled={!!state.productId && !editLinkedProduct}
                  fullWidth
                />
              </TwoCol>
              <TextField
                label="Product identifiers JSON"
                value={state.productIdentifiersText}
                onChange={(e) => setField('productIdentifiersText', e.target.value)}
                disabled={!!state.productId && !editLinkedProduct}
                fullWidth
                multiline
                minRows={4}
                spellCheck={false}
              />
            </Section>

            <Section title="Item Status & Ownership">
              <TwoCol>
                <TextField select label="Source" value={state.source} onChange={(e) => setField('source', e.target.value as ItemSource)} fullWidth>
                  {ITEM_SOURCES.map((source) => <MenuItem key={source} value={source}>{source}</MenuItem>)}
                </TextField>
                <TextField select label="Status" value={state.status} onChange={(e) => setField('status', e.target.value as ItemStatus)} fullWidth>
                  {ITEM_STATUSES.map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
                </TextField>
                <TextField select label="Condition" value={state.condition} onChange={(e) => setField('condition', e.target.value as ItemCondition)} fullWidth>
                  {ITEM_CONDITIONS.map((condition) => <MenuItem key={condition} value={condition}>{condition}</MenuItem>)}
                </TextField>
                <TextField label="Location" value={state.location} onChange={(e) => setField('location', e.target.value)} fullWidth />
                <TextField label="Purchase order ID" value={state.purchaseOrder} onChange={(e) => setField('purchaseOrder', e.target.value.replace(/\D/g, ''))} fullWidth />
                <TextField label="Manifest row ID" value={state.manifestRow} onChange={(e) => setField('manifestRow', e.target.value.replace(/\D/g, ''))} fullWidth />
              </TwoCol>
            </Section>

            <Section title="Pricing">
              <TwoCol>
                <TextField label="Shelf price" value={state.price} onChange={(e) => setField('price', e.target.value)} fullWidth />
                <TextField label="Retail / MSRP" value={state.retail} onChange={(e) => setField('retail', e.target.value)} fullWidth />
                <TextField label="Sold for" value={state.soldFor} onChange={(e) => setField('soldFor', e.target.value)} fullWidth />
                <TextField
                  label="Sold at"
                  type="datetime-local"
                  value={state.soldAt}
                  onChange={(e) => setField('soldAt', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </TwoCol>
              {item?.cost ?
                <Typography variant="caption" color="text.secondary">
                  Current allocated cost: {item.cost}
                </Typography>
              : null}
            </Section>

            <Section title="Notes & Item Specifications">
              <TextField label="Notes" value={state.notes} onChange={(e) => setField('notes', e.target.value)} fullWidth multiline minRows={3} />
              <TextField
                label="Item specifications JSON"
                value={state.specificationsText}
                onChange={(e) => setField('specificationsText', e.target.value)}
                fullWidth
                multiline
                minRows={6}
                spellCheck={false}
              />
            </Section>

            {item ?
              <Section title="Read-only audit fields">
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  <Chip label={`DB id ${item.id}`} variant="outlined" />
                  <Chip label={`Product # ${item.product_number || 'none'}`} variant="outlined" />
                  {item.purchase_order_number ? <Chip label={`PO ${item.purchase_order_number}`} variant="outlined" /> : null}
                  {item.product_upc ? <Chip label={`Product UPC ${item.product_upc}`} variant="outlined" /> : null}
                  {item.cost ? <Chip label={`Cost ${item.cost}`} variant="outlined" /> : null}
                  <Chip label={`Created ${item.created_at}`} variant="outlined" />
                  <Chip label={`Updated ${item.updated_at}`} variant="outlined" />
                  {item.checked_in_at ? <Chip label={`Checked in ${item.checked_in_at}`} variant="outlined" /> : null}
                  {item.checked_in_by ? <Chip label={`Checked in by user ${item.checked_in_by}`} variant="outlined" /> : null}
                  {item.listed_at ? <Chip label={`Listed ${item.listed_at}`} variant="outlined" /> : null}
                  {item.dispute_type ? <Chip label={`Dispute ${item.dispute_type}`} color="warning" variant="outlined" /> : null}
                  {item.dispute_pct_loss != null ? <Chip label={`Dispute loss ${item.dispute_pct_loss}%`} color="warning" variant="outlined" /> : null}
                  {item.dispute_description ? <Chip label={`Dispute note ${item.dispute_description}`} color="warning" variant="outlined" /> : null}
                </Box>
              </Section>
            : null}
          </Stack>
        </Box>

        <Divider />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
          <Box>
            {item ?
              <Button
                startIcon={<DeleteOutlineIcon />}
                color="error"
                variant="outlined"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm(`Delete item ${item.sku}?`)) deleteMutation.mutate();
                }}
              >
                Delete item
              </Button>
            : null}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={onCancel}>Cancel</Button>
            <Button
              startIcon={<SaveOutlinedIcon />}
              variant="contained"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Save item
            </Button>
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, bgcolor: 'background.paper' }}>
      <Typography variant="overline" sx={{ fontWeight: 800, color: 'text.secondary' }}>
        {title}
      </Typography>
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        {children}
      </Stack>
    </Box>
  );
}

function TwoCol({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
      {children}
    </Box>
  );
}
