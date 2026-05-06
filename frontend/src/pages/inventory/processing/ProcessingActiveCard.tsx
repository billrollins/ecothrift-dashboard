import ArrowBack from '@mui/icons-material/ArrowBack';
import FilterAlt from '@mui/icons-material/FilterAlt';
import Gavel from '@mui/icons-material/Gavel';
import LibraryBooks from '@mui/icons-material/LibraryBooks';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import MergeType from '@mui/icons-material/MergeType';
import MoreVert from '@mui/icons-material/MoreVert';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { updateProduct } from '../../../api/inventory.api';
import type { ProcessingWorkspaceItemDTO, ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import { formatCurrency } from '../../../utils/format';
import { printProcessingLabel } from './printProcessingLabel';

const CONDITION_OPTIONS = ['New', 'Like New', 'Very Good', 'Used Good', 'Used Fair', 'Salvage'];

const DISPATCH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'on_shelf', label: 'On shelf / floor' },
  { value: 'restoration', label: 'Restoration' },
  { value: 'back_storage', label: 'Back storage' },
  { value: 'online_sales', label: 'Online sales' },
  { value: 'salvage', label: 'Salvage' },
];

export interface ProcessingActiveCardProps {
  orderId: number;
  row: ProcessingWorkspaceRowDTO;
  activeItem: ProcessingWorkspaceItemDTO;
  onSelectItemId: (itemId: number) => void;
  onBackToQueue: () => void;
  onCheckIn: (payload: Record<string, unknown>) => void;
  checkInLoading: boolean;
  onOpenDispute: () => void;
  onPatchCheckedIn: (payload: Record<string, unknown>) => void;
  patchLoading: boolean;
  onPrintMultiple: () => void;
  printMultipleDisabled?: boolean;
  onShowAllThisProduct?: () => void;
  productFilterActive?: boolean;
  onWorkspaceInvalidated?: () => void | Promise<void>;
  onPrepareMergeFromCard?: () => void;
}

export function ProcessingActiveCard({
  orderId,
  row,
  activeItem,
  onSelectItemId,
  onBackToQueue,
  onCheckIn,
  checkInLoading,
  onOpenDispute,
  onPatchCheckedIn,
  patchLoading,
  onPrintMultiple,
  printMultipleDisabled,
  onShowAllThisProduct,
  productFilterActive,
  onWorkspaceInvalidated,
  onPrepareMergeFromCard,
}: ProcessingActiveCardProps) {
  const qc = useQueryClient();
  const [conditionUi, setConditionUi] = useState(CONDITION_OPTIONS[3]);
  const [dispatch, setDispatch] = useState('on_shelf');
  const [retail, setRetail] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  /** V-20 defaults */
  const [applyConditionAll, setApplyConditionAll] = useState(false);
  const [applyRetailAll, setApplyRetailAll] = useState(true);

  const [productEditMode, setProductEditMode] = useState(false);
  const [pTitle, setPTitle] = useState('');
  const [pBrand, setPBrand] = useState('');
  const [pModel, setPModel] = useState('');
  const [pCategory, setPCategory] = useState('');
  const [pDescription, setPDescription] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const product = row.product;
  const manifestTitle = row.title || product?.title || 'Manifest line';

  useEffect(() => {
    setConditionUi(activeItem.condition_label || CONDITION_OPTIONS[3]);
    setDispatch(activeItem.dispatch || 'on_shelf');
    setRetail(activeItem.retail ?? '');
    setPrice(row.price ?? '');
    setNotes(activeItem.notes ?? '');
    setApplyConditionAll(false);
    setApplyRetailAll(true);
  }, [activeItem.id, row.price]);

  useEffect(() => {
    if (!product) return;
    setPTitle(product.title);
    setPBrand(product.brand);
    setPModel(product.model);
    setPCategory(product.category);
    setPDescription(product.description);
  }, [product?.id, product?.title, product?.brand, product?.model, product?.category, product?.description]);

  useEffect(() => {
    if (conditionUi === 'Salvage') {
      setDispatch('salvage');
    }
  }, [conditionUi]);

  const pending = activeItem.status === 'intake' || activeItem.status === 'processing';
  const checkedIn = activeItem.status === 'on_shelf';
  const disputed = activeItem.status === 'scrapped' || activeItem.status === 'lost';

  const salvageLocked =
    conditionUi === 'Salvage' || (checkedIn === true && activeItem.condition === 'salvage');
  const dispatchLocked = salvageLocked;

  const updateProductMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!product) throw new Error('No product');
      return updateProduct(product.id, patch);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['processing-workspace', orderId] });
      await onWorkspaceInvalidated?.();
    },
  });

  async function handlePrintShelfLabel() {
    const tit = manifestTitle || activeItem.sku;
    return printProcessingLabel({
      sku: activeItem.sku,
      title: tit,
      price: price || activeItem.price,
      brand: product?.brand ?? row.brand,
      product_number: product?.product_number,
    });
  }

  const manifestLineRetailNum = Number.parseFloat(row.unitRetail ?? '');
  const shelfDraftNum = Number.parseFloat(price || activeItem.price || '');
  const shelfAboveManifestMsrp =
    pending &&
    Number.isFinite(manifestLineRetailNum) &&
    manifestLineRetailNum > 0 &&
    Number.isFinite(shelfDraftNum) &&
    shelfDraftNum > manifestLineRetailNum + 0.005;

  function DispatchSelect({ sx }: { sx?: Record<string, unknown> }) {
    return (
      <TextField
        sx={sx}
        select
        label="Dispatch"
        size="small"
        fullWidth={false}
        value={dispatch}
        disabled={dispatchLocked}
        helperText={
          dispatchLocked ?
            pending ?
              'Salvage dispatches remain on salvage path.'
            : 'Salvage inventory stays salvage-dispatch until condition changes materially.'
          : undefined
        }
        onChange={(e) => setDispatch(e.target.value)}
      >
        {DISPATCH_OPTIONS.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  return (
    <Card variant="outlined" sx={{ height: '100%', minHeight: 320 }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" startIcon={<ArrowBack />} onClick={onBackToQueue}>
            Queue
          </Button>
          <Box sx={{ flex: 1 }} />
          <IconButton size="small" aria-label="Row actions" onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MoreVert fontSize="small" />
          </IconButton>
          <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                onPrepareMergeFromCard?.();
              }}
              disabled={!onPrepareMergeFromCard || row.productId == null}
            >
              <MergeType sx={{ mr: 1 }} fontSize="small" /> Prep merge…
            </MenuItem>
            {onShowAllThisProduct ?
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  onShowAllThisProduct();
                }}
              >
                <FilterAlt sx={{ mr: 1 }} fontSize="small" />
                {productFilterActive ? 'Clear product filter' : 'Show all this product'}
              </MenuItem>
            : null}
          </Menu>
          <Button size="small" variant="outlined" startIcon={<LibraryBooks />} disabled={printMultipleDisabled} onClick={onPrintMultiple}>
            Print multiple…
          </Button>
          <Button size="small" startIcon={<Gavel />} variant="outlined" onClick={onOpenDispute}>
            Dispute
          </Button>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Manifest · read-only · row {row.rowNum}
            </Typography>
            <Typography variant="h6">{manifestTitle}</Typography>
            <Typography variant="body2" color="text.secondary">
              {[row.brand, row.model].filter(Boolean).join(' · ') || product?.brand || '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              SKU {row.sku || '—'} · units {row.qtyDispositioned}/{row.qty}
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: 'ui-monospace, monospace', display: 'block' }}>
              UPC {String((row.identifiers as { upc?: string })?.upc || product?.upc || '—')}
            </Typography>
            {row.manifestNotes ?
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Manifest notes: {row.manifestNotes}
              </Typography>
            : null}
          </Box>

          <Box sx={{ borderLeft: { md: 1 }, borderColor: { md: 'divider' }, pl: { md: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between' }}>
              <Typography variant="overline" color="text.secondary">
                Catalog product
              </Typography>
              {product ?
                <FormControlLabel
                  control={<Switch size="small" checked={productEditMode} onChange={(_, v) => setProductEditMode(v)} />}
                  label={<Typography variant="caption">Edit</Typography>}
                />
              : null}
            </Box>

            {!product ?
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                No catalog product linked yet.
              </Typography>
            : productEditMode ?
              <>
                <Alert severity="warning" variant="outlined" sx={{ py: 0.5, mt: 1 }}>
                  Product edits propagate to every sibling line sharing this SKU (V-19).
                </Alert>
                <TextField sx={{ mt: 1 }} label="Title" size="small" required value={pTitle} onChange={(e) => setPTitle(e.target.value)} fullWidth />
                <TextField label="Brand" size="small" value={pBrand} onChange={(e) => setPBrand(e.target.value)} fullWidth />
                <TextField label="Model / product #" size="small" value={pModel} onChange={(e) => setPModel(e.target.value)} fullWidth />
                <TextField label="Category" size="small" value={pCategory} onChange={(e) => setPCategory(e.target.value)} fullWidth />
                <TextField
                  label="Description"
                  size="small"
                  multiline
                  minRows={2}
                  value={pDescription}
                  onChange={(e) => setPDescription(e.target.value)}
                  fullWidth
                />
                <Button
                  variant="contained"
                  size="small"
                  sx={{ mt: 1 }}
                  disabled={updateProductMutation.isPending || !pTitle.trim()}
                  onClick={() =>
                    updateProductMutation.mutate({
                      title: pTitle.trim(),
                      brand: pBrand,
                      model: pModel,
                      category: pCategory,
                      description: pDescription,
                    })
                  }
                >
                  Save product
                </Button>
              </>
            : <>
                <Typography variant="body1" fontWeight={600} sx={{ mt: 1 }}>
                  {product.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  #{product.product_number} · UPC {product.upc || '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Tags: {(product.tags || row.tags || '').trim() ? (product.tags || row.tags)?.trim() : '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Category: {product.category || '—'}
                </Typography>
              </>
            }
          </Box>

          <Box sx={{ borderLeft: { md: 1 }, borderColor: { md: 'divider' }, pl: { md: 2 } }}>
            <Typography variant="overline" color="text.secondary">
              This unit
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {activeItem.sku} · {activeItem.condition_label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {activeItem.disposition} · {activeItem.status}
            </Typography>
            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              Row units
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {row.items.map((it) => (
                <Chip
                  key={it.id}
                  size="small"
                  label={`${it.sku} · ${it.condition_label}`}
                  color={it.id === activeItem.id ? 'primary' : 'default'}
                  variant={it.id === activeItem.id ? 'filled' : 'outlined'}
                  onClick={() => onSelectItemId(it.id)}
                />
              ))}
            </Box>
          </Box>
        </Box>

        <Divider />

        {disputed ?
          <Typography color="error" variant="body2">
            Unit is disputed ({activeItem.status}).
          </Typography>
        : null}

        {(dispatchLocked || salvageLocked) && (pending || checkedIn) ?
          <Typography variant="caption" color="text.secondary">
            Salvage / dispatch routing is locked until condition clears salvage (V-23).
          </Typography>
        : null}

        {checkedIn ?
          <>
            <Alert severity="warning" variant="outlined">
              Checked in (V-24). Print shelf label reuses local printer without another check-in.
            </Alert>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField label="Shelf price" size="small" value={price} onChange={(e) => setPrice(e.target.value)} />
              <TextField label="Retail" size="small" value={retail} onChange={(e) => setRetail(e.target.value)} />
              {row.unitRetail ?
                <Typography variant="caption" color="text.secondary" display="block">
                  Manifest line MSRP (per unit): {formatCurrency(row.unitRetail)}
                </Typography>
              : null}
              <DispatchSelect />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" onClick={() => handlePrintShelfLabel()}>
                  Print shelf label
                </Button>
                <Button
                  variant="contained"
                  disabled={patchLoading}
                  onClick={() =>
                    onPatchCheckedIn({
                      price,
                      retail,
                      dispatch,
                    })
                  }
                >
                  Save edits
                </Button>
              </Box>
            </Box>
          </>
        : null}

        {pending ?
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField select label="Condition" size="small" value={conditionUi} onChange={(e) => setConditionUi(e.target.value)}>
              {CONDITION_OPTIONS.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <DispatchSelect sx={{ alignSelf: 'stretch' }} />
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              Unit economics
            </Typography>
            {row.unitRetail ?
              <Typography variant="caption" color="text.secondary" display="block">
                Manifest line MSRP (per unit): {formatCurrency(row.unitRetail)}
              </Typography>
            : null}
            <TextField label="Retail" size="small" value={retail} onChange={(e) => setRetail(e.target.value)} />
            <TextField label="Shelf price" size="small" value={price} onChange={(e) => setPrice(e.target.value)} />
            {shelfAboveManifestMsrp ?
              <Alert severity="warning" variant="outlined">
                Shelf price ({formatCurrency(String(shelfDraftNum))}) is above manifest line MSRP (
                {formatCurrency(row.unitRetail!)}). Open <strong>Manifest pricing audit</strong> (above the queue) to
                compare base cost, 2× ideal, and finalized manifest prices.
              </Alert>
            : null}
            <TextField label="Notes" size="small" multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <FormControlLabel
              control={
                <Checkbox checked={applyConditionAll} onChange={(e) => setApplyConditionAll(e.target.checked)} size="small" />
              }
              label={<Typography variant="body2">Apply condition to pending siblings (same product)</Typography>}
            />
            <FormControlLabel
              control={<Checkbox checked={applyRetailAll} onChange={(e) => setApplyRetailAll(e.target.checked)} size="small" />}
              label={<Typography variant="body2">Apply retail to pending siblings (same product)</Typography>}
            />
            <Button
              variant="contained"
              size="large"
              startIcon={<LocalPrintshop />}
              disabled={checkInLoading}
              onClick={() =>
                onCheckIn({
                  condition: conditionUi,
                  dispatch,
                  retail: retail || undefined,
                  unit_retail: retail || undefined,
                  price: price || undefined,
                  notes,
                  applyConditionAll,
                  applyRetailAll,
                })
              }
            >
              Print label & check in
            </Button>
          </Box>
        : null}

        {!pending && !checkedIn && !disputed ?
          <Typography variant="body2" color="text.secondary">
            Not editable in processor ({activeItem.status}).
          </Typography>
        : null}
      </CardContent>
    </Card>
  );
}
