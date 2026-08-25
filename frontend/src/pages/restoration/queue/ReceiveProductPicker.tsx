/**
 * Keep the current product, pick another, or start a blank one — same slot either way.
 *
 * Salvage additionals skip the catalog: the slot stays, the copy changes.
 */
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { updateProduct } from '../../../api/inventory.api';
import { ProductSearchAutocomplete } from '../../../components/inventory/ProductSearchAutocomplete';
import { apiErrorDetail, useProductUsage } from '../../../hooks/useProductSearch';
import type { Product } from '../../../types/inventory.types';
import type { CheckInProductSummary } from '../../inventory/processing/ProcessingCheckInEditStats';
import { emptyNewProductDraft, type ReceiveNewProductDraft } from './restorationReceive';

export type ReceiveProductMode = 'keep' | 'existing' | 'new' | 'none';

/** One identity row — keep / new / edit all fit so switching never moves a row. */
export const PRODUCT_SLOT_HEIGHT = 54;

export interface ReceiveProductPickerProps {
  kind: 'main' | 'part';
  scope: string;
  current: CheckInProductSummary | null;
  mode: ReceiveProductMode;
  onModeChange: (mode: ReceiveProductMode) => void;
  existing: Product | null;
  onExistingChange: (product: Product | null) => void;
  draft: ReceiveNewProductDraft;
  onDraftChange: (draft: ReceiveNewProductDraft) => void;
  disabled?: boolean;
  skipCatalog?: boolean;
}

export function ReceiveProductPicker({
  kind,
  scope,
  current,
  mode,
  onModeChange,
  existing,
  onExistingChange,
  draft,
  onDraftChange,
  disabled,
  skipCatalog,
}: ReceiveProductPickerProps) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState<CheckInProductSummary | null>(null);
  const [working, setWorking] = useState<null | 'edit' | 'change' | 'new'>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editDraft, setEditDraft] = useState({ title: '', brand: '', model: '' });
  const [modeBackup, setModeBackup] = useState<ReceiveProductMode>('keep');
  const [existingBackup, setExistingBackup] = useState<Product | null>(null);
  const [draftBackup, setDraftBackup] = useState<ReceiveNewProductDraft>(emptyNewProductDraft());

  const product = saved ?? current;
  const shownExisting = existing ? productFromCatalog(existing) : null;
  const productId = (mode === 'existing' ? shownExisting?.id : product?.id) ?? null;
  const { usage, isFetching: usageLoading } = useProductUsage(confirmOpen ? productId : null);
  const itemCount = usage?.item_count;
  const onShelfCount = usage?.on_shelf_count;

  useEffect(() => {
    setSaved(null);
    setWorking(null);
    setConfirmOpen(false);
  }, [current?.id, scope]);

  const saveProduct = useMutation({
    mutationFn: async () => {
      if (productId == null) throw new Error('No product to save');
      const title = editDraft.title.trim();
      if (!title) throw new Error('Title is required.');
      const { data } = await updateProduct(productId, {
        title,
        brand: editDraft.brand.trim() || 'Generic',
        model: editDraft.model.trim(),
      });
      return data;
    },
    onSuccess: (data) => {
      setSaved({
        id: data.id,
        product_number: data.product_number,
        title: data.title,
        brand: data.brand,
        model: data.model,
      });
      setWorking(null);
      void queryClient.invalidateQueries({ queryKey: ['product-usage', productId] });
      enqueueSnackbar('Product updated', { variant: 'success' });
    },
    onError: (err) => {
      enqueueSnackbar(apiErrorDetail(err, 'Could not save that product'), { variant: 'error' });
    },
  });

  function idleMode() {
    return kind === 'main' ? 'keep' : 'existing';
  }

  function onChange() {
    if (disabled) return;
    setModeBackup(mode);
    setExistingBackup(existing);
    setConfirmOpen(false);
    setWorking('change');
    onModeChange('existing');
  }

  function onNew() {
    if (disabled) return;
    setModeBackup(mode);
    setDraftBackup(draft);
    setConfirmOpen(false);
    onDraftChange(emptyNewProductDraft());
    setWorking('new');
    onModeChange('new');
  }

  function onEdit() {
    if (disabled) return;
    if (productId == null) {
      setModeBackup(mode);
      setDraftBackup(draft);
      setWorking('new');
      onModeChange('new');
      return;
    }
    setConfirmOpen(true);
  }

  function confirmEdit() {
    const source = mode === 'existing' ? shownExisting : product;
    setEditDraft({
      title: source?.title?.trim() || '',
      brand: source?.brand?.trim() || '',
      model: source?.model?.trim() || '',
    });
    setWorking('edit');
    setConfirmOpen(false);
  }

  function onCancel() {
    if (working === 'change') {
      onExistingChange(existingBackup);
      onModeChange(existingBackup ? 'existing' : modeBackup === 'new' ? 'new' : idleMode());
    } else if (working === 'new') {
      onDraftChange(draftBackup);
      onModeChange(modeBackup === 'existing' && !existingBackup ? idleMode() : modeBackup);
    }
    setWorking(null);
    setConfirmOpen(false);
  }

  function onSaveWorking() {
    if (working === 'edit') {
      saveProduct.mutate();
      return;
    }
    if (working === 'change') {
      if (!existing) return;
      setWorking(null);
      return;
    }
    if (!draft.title.trim()) return;
    setWorking(null);
  }

  const saveDisabled =
    disabled ||
    saveProduct.isPending ||
    (working === 'edit' && !editDraft.title.trim()) ||
    (working === 'change' && !existing) ||
    (working === 'new' && !draft.title.trim());

  return (
    <Box
      sx={{
        px: 1.25,
        py: 0.75,
        border: '1px solid #c8d6c9',
        borderRadius: 2,
        bgcolor: '#eef4ee',
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 28, mb: 0.75 }}>
        <Typography
          sx={{
            flexShrink: 0,
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: '#5c6b70',
          }}
        >
          {`Product (${productStateLabel(mode, working, Boolean(saved), skipCatalog)})`}
        </Typography>
        <Box
          sx={{
            ml: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            visibility: skipCatalog ? 'hidden' : 'visible',
          }}
        >
          {working ? (
            <>
              <CardAction
                active
                disabled={saveDisabled}
                onClick={onSaveWorking}
              >
                Save
              </CardAction>
              <CardAction disabled={disabled || saveProduct.isPending} onClick={onCancel}>
                Cancel
              </CardAction>
            </>
          ) : (
            <>
              <CardAction disabled={disabled} onClick={onEdit}>
                Edit
              </CardAction>
              <CardAction active={mode === 'existing'} disabled={disabled} onClick={onChange}>
                Change
              </CardAction>
              <CardAction active={mode === 'new'} disabled={disabled} onClick={onNew}>
                New
              </CardAction>
            </>
          )}
        </Box>
      </Box>

      <Box
        sx={{
          height: PRODUCT_SLOT_HEIGHT,
          minHeight: PRODUCT_SLOT_HEIGHT,
          overflow: 'hidden',
        }}
      >
        {skipCatalog ? (
          <SlotCopy>Leaving as salvage — no catalog. The part label is enough.</SlotCopy>
        ) : working === 'change' ? (
          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center' }}>
            <ProductSearchAutocomplete
              scope={scope}
              value={existing}
              onSelect={onExistingChange}
              label={kind === 'main' ? 'Replacement product' : 'Product for this part'}
              helperText=""
              highlightIfEmpty
              disabled={disabled}
            />
          </Box>
        ) : mode === 'existing' && shownExisting ? (
          <ProductIdentityRow
            number={shownExisting.product_number?.trim() || (shownExisting.id ? `#${shownExisting.id}` : '')}
            title={working === 'edit' ? editDraft.title : shownExisting.title?.trim() || ''}
            brand={working === 'edit' ? editDraft.brand : shownExisting.brand?.trim() || ''}
            model={working === 'edit' ? editDraft.model : shownExisting.model?.trim() || ''}
            editable={working === 'edit'}
            disabled={disabled || saveProduct.isPending}
            onChange={setEditDraft}
          />
        ) : mode === 'new' || working === 'new' ? (
          <ProductIdentityRow
            number=""
            title={draft.title}
            brand={draft.brand}
            model={draft.model}
            editable={working === 'new'}
            disabled={disabled}
            onChange={(next) => onDraftChange({ ...draft, ...next })}
          />
        ) : (
          <ProductIdentityRow
            number={product?.product_number?.trim() || (product?.id ? `#${product.id}` : '')}
            title={working === 'edit' ? editDraft.title : product?.title?.trim() || ''}
            brand={working === 'edit' ? editDraft.brand : product?.brand?.trim() || ''}
            model={working === 'edit' ? editDraft.model : product?.model?.trim() || ''}
            editable={working === 'edit'}
            disabled={disabled || saveProduct.isPending}
            emptyLabel="No product on this item."
            onChange={setEditDraft}
          />
        )}
      </Box>

      <Dialog
        open={confirmOpen}
        onClose={disabled ? undefined : () => setConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1rem' }}>
          Do you really want to edit this product?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155', minHeight: 22 }}>
            {`It is currently affecting ${countLabel(itemCount, usageLoading)} items.`}
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: '0.9rem', fontWeight: 600, color: '#334155', minHeight: 22 }}>
            {`${countLabel(onShelfCount, usageLoading)} on shelf currently`}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmOpen(false)} disabled={disabled}>
            Cancel
          </Button>
          <Button variant="contained" onClick={confirmEdit} disabled={disabled}>
            Edit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function productFromCatalog(product: Product): CheckInProductSummary {
  return {
    id: product.id,
    product_number: product.product_number,
    title: product.title,
    brand: product.brand,
    model: product.model,
  };
}

function productStateLabel(
  mode: ReceiveProductMode,
  working: null | 'edit' | 'change' | 'new',
  edited: boolean,
  skipCatalog?: boolean,
): string {
  if (skipCatalog) return 'salvage';
  if (working === 'change' || mode === 'existing') return 'changed';
  if (working === 'new' || mode === 'new') return 'new';
  if (working === 'edit' || edited) return 'edited';
  return 'original';
}

function countLabel(value: number | null | undefined, loading: boolean): string {
  if (loading || value == null) return '…';
  return String(value);
}

function CardAction({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <Button
      size="small"
      variant={active ? 'contained' : 'text'}
      disabled={disabled}
      onClick={onClick}
      sx={{
        textTransform: 'none',
        fontWeight: 700,
        fontSize: '0.72rem',
        minWidth: 0,
        px: 1,
        py: 0.15,
        lineHeight: 1.2,
      }}
    >
      {children}
    </Button>
  );
}

function SlotCopy({ children }: { children: string }) {
  return (
    <Typography
      sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        fontSize: '0.84rem',
        fontWeight: 700,
        color: '#334155',
      }}
    >
      {children}
    </Typography>
  );
}

function ProductIdentityRow({
  number,
  title,
  brand,
  model,
  editable,
  disabled,
  emptyLabel,
  onChange,
}: {
  number: string;
  title: string;
  brand: string;
  model: string;
  editable?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
  onChange?: (next: { title: string; brand: string; model: string }) => void;
}) {
  const empty = !editable && !number && !title && !brand && !model;

  return (
    <Box
      sx={{
        height: '100%',
        display: 'grid',
        gridTemplateColumns: 'minmax(72px, 0.7fr) minmax(0, 1.6fr) minmax(0, 0.9fr) minmax(0, 0.9fr)',
        gap: 1,
        alignItems: 'center',
      }}
    >
      {empty ? (
        <Typography sx={{ gridColumn: '1 / -1', fontSize: '0.84rem', fontWeight: 700, color: '#94a3b8' }}>
          {emptyLabel}
        </Typography>
      ) : (
        <>
          <ProductFact label="Product #" value={number || '—'} mono />
          <ProductCell
            label="Title"
            value={title}
            editable={editable}
            required={editable}
            disabled={disabled}
            onChange={(next) => onChange?.({ title: next, brand, model })}
          />
          <ProductCell
            label="Brand"
            value={brand}
            editable={editable}
            disabled={disabled}
            onChange={(next) => onChange?.({ title, brand: next, model })}
          />
          <ProductCell
            label="Model"
            value={model}
            editable={editable}
            disabled={disabled}
            onChange={(next) => onChange?.({ title, brand, model: next })}
          />
        </>
      )}
    </Box>
  );
}

function ProductFact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <FieldCaption>{label}</FieldCaption>
      <Typography
        noWrap
        title={value !== '—' ? value : undefined}
        sx={{
          mt: 0.2,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          fontSize: '0.8rem',
          fontWeight: 800,
          color: value === '—' ? '#94a3b8' : '#172033',
          fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : undefined,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function ProductCell({
  label,
  value,
  editable,
  required,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  editable?: boolean;
  required?: boolean;
  disabled?: boolean;
  onChange?: (value: string) => void;
}) {
  if (!editable) return <ProductFact label={label} value={value || '—'} />;
  const missing = Boolean(required && !value.trim());
  return (
    <Box sx={{ minWidth: 0 }}>
      <FieldCaption>{label}</FieldCaption>
      <TextField
        size="small"
        fullWidth
        hiddenLabel
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        sx={{
          mt: 0.2,
          '& .MuiOutlinedInput-root': {
            height: 32,
            fontSize: '0.8rem',
            fontWeight: 700,
            bgcolor: '#fff',
            ...(missing
              ? {
                  '& fieldset': { borderColor: '#d97706', borderWidth: 2 },
                  '&:hover fieldset': { borderColor: '#d97706' },
                }
              : {}),
          },
          '& .MuiOutlinedInput-input': { py: 0, px: 1 },
        }}
      />
    </Box>
  );
}

function FieldCaption({ children }: { children: string }) {
  return (
    <Typography
      sx={{
        display: 'block',
        fontSize: '0.58rem',
        fontWeight: 800,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        lineHeight: 1.1,
        color: '#65748a',
      }}
    >
      {children}
    </Typography>
  );
}
