import Add from '@mui/icons-material/Add';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import Close from '@mui/icons-material/Close';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import Remove from '@mui/icons-material/Remove';
import Search from '@mui/icons-material/Search';
import Undo from '@mui/icons-material/Undo';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState, type ReactNode, type WheelEvent } from 'react';
import { useProductSearch, useProductUsage } from '../../../hooks/useProductSearch';
import { useAISuggestItem } from '../../../hooks/useInventory';
import { preventWheelChangeNumber } from '../../../utils/formInputs';
import type {
  ItemCondition,
  ItemCheckInDTO,
  ProcessingWorkspaceItemDTO,
  ProcessingWorkspaceProductDTO,
  ProcessingWorkspaceRowDTO,
  Product,
} from '../../../types/inventory.types';
import { formatCurrency } from '../../../utils/format';
import {
  normalizeProcessingCondition,
  PROCESSING_ITEM_CONDITION_OPTIONS,
  PROCESSING_ITEM_DEFAULT_CONDITION,
  PROCESSING_ITEM_DISPATCH_OPTIONS,
} from './processingItemFormOptions';
import { effectiveRowQty } from './processingQueueCellText';
import { isLargeCheckIn, MAX_CHECK_IN_QUANTITY } from './largeCheckIn';
import { LargeCheckInConfirmDialog } from './LargeCheckInConfirmDialog';
import { identifiersSummary } from './processingManifestSummary';
import { processingTokens } from './processingTokens';

type ProductLike = Product | ProcessingWorkspaceProductDTO;
type FieldDensity = 'compact' | 'normal' | 'emphasized';

const AI_FIELDS = ['title', 'brand', 'model', 'category', 'condition', 'price', 'retail_value', 'search_tags', 'notes'];
const FIELD_GRID = { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' };
// Owner ruling: no low cap — large quantities confirm via LargeCheckInConfirmDialog instead.
const MAX_CHECK_IN_QTY = MAX_CHECK_IN_QUANTITY;

const FIELD_DENSITY_SX: Record<FieldDensity, { input: string; label: string; inputPy?: number }> = {
  compact: { input: '0.6875rem', label: '0.625rem' },
  normal: { input: '0.8125rem', label: '0.75rem' },
  emphasized: { input: '0.875rem', label: '0.8125rem', inputPy: 0.75 },
};

function parseCheckInQuantity(raw: string): number {
  return Math.max(1, Math.min(MAX_CHECK_IN_QTY, Number.parseInt(raw, 10) || 1));
}

function strDefault(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function suggestionText(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

function productLabel(product: ProductLike): string {
  const number = product.product_number || `#${product.id}`;
  return `${number} · ${product.title}`;
}

function CheckInSectionCard({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <Paper
      variant="outlined"
      sx={{ overflow: 'hidden', borderColor: processingTokens.border, bgcolor: processingTokens.surfaceRaised, minWidth: 0 }}
    >
      <Box
        sx={{
          px: 1.25,
          py: 0.65,
          borderBottom: 1,
          borderColor: processingTokens.border,
          bgcolor: processingTokens.neutralSoft,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography variant="caption" fontWeight={900} letterSpacing={0.55} sx={{ flex: 1, textTransform: 'uppercase' }}>
          {title}
        </Typography>
        {trailing ? <Box sx={{ flexShrink: 0 }}>{trailing}</Box> : null}
      </Box>
      <Box sx={{ p: 1.1 }}>{children}</Box>
    </Paper>
  );
}

function MetricPill({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'warning' | 'good' }) {
  const color =
    tone === 'good' ? processingTokens.accentGreen
    : tone === 'warning' ? processingTokens.accentAmber
    : processingTokens.textSoft;

  return (
    <Box
      sx={{
        px: 0.8,
        py: 0.45,
        border: 1,
        borderColor: processingTokens.border,
        borderRadius: 1,
        bgcolor: processingTokens.surfaceRaised,
        minWidth: 78,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.58rem', lineHeight: 1, textTransform: 'uppercase', fontWeight: 800 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 15, fontWeight: 900, color, lineHeight: 1.15, mt: 0.25 }}>{value}</Typography>
    </Box>
  );
}

function QuantityControl({
  quantity,
  disabled,
  onChange,
  onBlur,
  onBump,
}: {
  quantity: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
  onBump: (delta: number) => void;
}) {
  const qtyValue = quantity.trim() === '' ? 0 : parseCheckInQuantity(quantity);

  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'inline-flex',
        alignItems: 'stretch',
        borderColor: processingTokens.border,
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: processingTokens.surfaceRaised,
      }}
    >
      <IconButton
        size="small"
        aria-label="Decrease quantity"
        disabled={disabled || qtyValue <= 1}
        onClick={() => onBump(-1)}
        sx={{ width: 32, borderRadius: 0, borderRight: 1, borderColor: processingTokens.border }}
      >
        <Remove sx={{ fontSize: 16 }} />
      </IconButton>
      <TextField
        value={quantity}
        aria-label="Quantity"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ''))}
        onBlur={onBlur}
        onWheel={(event: WheelEvent<HTMLInputElement>) => preventWheelChangeNumber(event)}
        variant="standard"
        slotProps={{ input: { disableUnderline: true } }}
        sx={{
          width: 56,
          m: 0,
          '& input': {
            textAlign: 'center',
            fontSize: 22,
            fontWeight: 900,
            py: 0.65,
            fontVariantNumeric: 'tabular-nums',
          },
        }}
      />
      <IconButton
        size="small"
        aria-label="Increase quantity"
        disabled={disabled || qtyValue >= MAX_CHECK_IN_QTY}
        onClick={() => onBump(1)}
        sx={{ width: 32, borderRadius: 0, borderLeft: 1, borderColor: processingTokens.border }}
      >
        <Add sx={{ fontSize: 16 }} />
      </IconButton>
    </Paper>
  );
}

function FieldText({
  label,
  value,
  onChange,
  density = 'normal',
  multiline = false,
  minRows,
  maxRows,
  gridColumn,
  tooltip,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  density?: FieldDensity;
  multiline?: boolean;
  minRows?: number;
  maxRows?: number;
  gridColumn?: string;
  tooltip?: string;
}) {
  const metrics = FIELD_DENSITY_SX[density];
  const tooltipText = tooltip ?? value;
  const field = (
    <TextField
      size="small"
      label={label}
      value={value}
      multiline={multiline}
      minRows={minRows}
      maxRows={maxRows}
      onChange={(event) => onChange(event.target.value)}
      fullWidth
      sx={{
        '& .MuiInputBase-input': {
          fontSize: metrics.input,
          ...(metrics.inputPy != null ? { py: metrics.inputPy } : {}),
        },
        '& .MuiInputLabel-root': { fontSize: metrics.label },
      }}
    />
  );

  const content =
    tooltipText.trim() ?
      <Tooltip title={tooltipText} enterDelay={350} disableInteractive>
        <Box component="span" sx={{ display: 'block', minWidth: 0 }}>
          {field}
        </Box>
      </Tooltip>
    : field;

  if (!gridColumn) return content;

  return (
    <Box sx={{ gridColumn, minWidth: 0 }}>
      {content}
    </Box>
  );
}

/**
 * Buttons-first single-choice control (P8: owner wants buttons rather than dropdowns —
 * every option visible, one click to change, no menu-open latency).
 */
function SegmentedButtons({
  label,
  value,
  options,
  onChange,
  disabled,
  helperText,
  gridColumn,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; hint?: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  helperText?: string;
  gridColumn?: string;
}) {
  return (
    <Box sx={{ minWidth: 0, ...(gridColumn ? { gridColumn } : {}) }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', fontSize: '0.62rem', mb: 0.4 }}
      >
        {label}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {options.map((option) => {
          const active = option.value === value;
          const btn = (
            <Button
              key={option.value}
              size="small"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              disableElevation
              variant={active ? 'contained' : 'outlined'}
              color={active ? 'primary' : 'inherit'}
              sx={{
                px: 1.1,
                py: 0.35,
                minWidth: 0,
                textTransform: 'none',
                fontWeight: active ? 800 : 600,
                fontSize: '0.74rem',
                lineHeight: 1.3,
                borderColor: active ? undefined : processingTokens.border,
                color: active ? undefined : processingTokens.textSoft,
                bgcolor: active ? undefined : processingTokens.surfaceRaised,
              }}
            >
              {option.label}
            </Button>
          );
          return option.hint ? (
            <Tooltip key={option.value} title={option.hint} enterDelay={400} disableInteractive>
              <span>{btn}</span>
            </Tooltip>
          ) : (
            btn
          );
        })}
      </Box>
      {helperText ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35, lineHeight: 1.2 }}>
          {helperText}
        </Typography>
      ) : null}
    </Box>
  );
}

export interface ProcessingCheckInSeed {
  item: ProcessingWorkspaceItemDTO;
  itemCheckIn: ItemCheckInDTO | null;
}

export interface ProcessingCheckInDialogProps {
  open: boolean;
  row: ProcessingWorkspaceRowDTO;
  loading: boolean;
  saveProductLoading?: boolean;
  seed?: ProcessingCheckInSeed | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>, options: { printLabels: boolean }) => Promise<boolean>;
  /** Edit mode: update the seeded check-in in place (add/remove items, patch fields). */
  onUpdateItemCheckIn?: (itemCheckInId: number, payload: Record<string, unknown>, options: { printLabels: boolean }) => Promise<boolean>;
  /** Persist product decision on the row without checking in. */
  onSaveProduct?: (payload: Record<string, unknown>) => Promise<boolean>;
}

/** Per-field AI suggestion state: AI value applied, original kept for one-click revert. */
interface AiFieldState {
  label: string;
  before: string;
  after: string;
  useAi: boolean;
}

export function ProcessingCheckInDialog({
  open,
  row,
  loading,
  seed = null,
  onClose,
  onSubmit,
  onUpdateItemCheckIn,
  onSaveProduct,
  saveProductLoading = false,
}: ProcessingCheckInDialogProps) {
  const rowLinkedProduct = row.product;
  const aiSuggest = useAISuggestItem();

  // Edit mode: a prior check-in was clicked — this dialog EDITS that check-in in place.
  const editCheckIn = seed?.itemCheckIn && onUpdateItemCheckIn ? seed.itemCheckIn : null;
  const isEditMode = editCheckIn != null;
  const originalQty = editCheckIn?.quantity ?? 0;

  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState<ItemCondition>(PROCESSING_ITEM_DEFAULT_CONDITION);
  const [dispatch, setDispatch] = useState(row.dispatch || 'on_shelf');
  const [retail, setRetail] = useState(row.unitRetail ?? '');
  const [price, setPrice] = useState(row.price ?? '');
  const [notes, setNotes] = useState('');
  const [searchTagsCsv, setSearchTagsCsv] = useState('');
  const [pTitle, setPTitle] = useState('');
  const [pBrand, setPBrand] = useState('');
  const [pModel, setPModel] = useState('');
  const [pCategory, setPCategory] = useState('');
  const [pUpc, setPUpc] = useState('');

  /** Product attachment: null = a NEW product will be created from the fields. */
  const [attachedProduct, setAttachedProduct] = useState<ProductLike | null>(null);
  const [productEdited, setProductEdited] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  /** Pending large check-in awaiting confirmation; value = printLabels of the request. */
  const [volumeConfirm, setVolumeConfirm] = useState<boolean | null>(null);
  const [aiFields, setAiFields] = useState<Record<string, AiFieldState>>({});
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiSpecs, setAiSpecs] = useState<Record<string, unknown> | null>(null);

  const { products: productOptions, isFetching: productsFetching } = useProductSearch(
    'processing-check-in',
    productSearch,
    open && searchOpen,
    25,
  );

  // Blast-radius fetch only once staff actually edit an attached product.
  const { usage: editUsage } = useProductUsage(
    open && productEdited && attachedProduct ? attachedProduct.id : null,
  );

  const qtyValue = Math.max(1, Number.parseInt(quantity, 10) || 1);
  const qtyDelta = isEditMode ? qtyValue - originalQty : 0;
  // P7 collapse: masters cap/report against the COMBINED group numbers.
  const effQty = effectiveRowQty(row);
  const qtyLeftAfter = Math.max(0, effQty.remaining - qtyValue);
  const salvageLocked = condition === 'salvage';
  const submitDisabled = loading;
  const saveProductDisabled =
    saveProductLoading
    || loading
    || !onSaveProduct
    || (!attachedProduct && !(pTitle.trim() || row.title || rowLinkedProduct?.title));

  function handleQuantityBlur() {
    if (!quantity.trim()) {
      setQuantity('1');
      return;
    }
    setQuantity(String(parseCheckInQuantity(quantity)));
  }

  function bumpQuantity(delta: number) {
    setQuantity(String(parseCheckInQuantity(String(Math.max(0, qtyValue || 1) + delta))));
  }

  function fillProductFields(product: ProductLike) {
    setPTitle(product.title || '');
    setPBrand(product.brand || '');
    setPModel(product.model || '');
    setPCategory(
      typeof product.category === 'number'
        ? ('category_name' in product ? product.category_name || '' : '')
        : product.category || '',
    );
    setPUpc(product.identifiers?.upc || product.upc || '');
  }

  useEffect(() => {
    if (!open) return;
    const defaults = seed?.itemCheckIn?.defaults ?? {};
    const seedProduct = seed?.itemCheckIn?.product ?? null;
    const initialAttached = seedProduct ?? rowLinkedProduct ?? null;

    setQuantity(editCheckIn ? String(editCheckIn.quantity) : '1');
    setCondition(normalizeProcessingCondition(seed?.item.condition || seed?.item.condition_label || row.condition));
    setDispatch(seed?.item.dispatch || strDefault(defaults.dispatch) || row.dispatch || 'on_shelf');
    setRetail(seed?.item.retail ?? (strDefault(defaults.retail) || row.unitRetail || ''));
    setPrice(seed?.item.price ?? (strDefault(defaults.price) || row.price || ''));
    setNotes(strDefault(defaults.notes) || seed?.item.notes || row.manifestNotes || '');
    setSearchTagsCsv(row.tags || '');
    setAttachedProduct(initialAttached);
    setProductEdited(false);
    setSearchOpen(false);
    setProductSearch('');
    if (initialAttached) {
      fillProductFields(initialAttached);
    } else {
      setPTitle(row.title || '');
      setPBrand(row.brand || '');
      setPModel(row.model || '');
      setPCategory(row.category || '');
      setPUpc(String((row.identifiers as { upc?: string })?.upc || ''));
    }
    setAiFields({});
    setAiMessage(null);
    setAiSpecs(null);
    setVolumeConfirm(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editCheckIn derives from seed
  }, [open, seed, row, rowLinkedProduct]);

  function markProductEdited() {
    if (attachedProduct) setProductEdited(true);
  }

  function detachToNewProduct() {
    setAttachedProduct(null);
    setProductEdited(false);
    setSearchOpen(false);
    setPTitle(row.title || '');
    setPBrand(row.brand || '');
    setPModel(row.model || '');
    setPCategory(row.category || '');
    setPUpc(String((row.identifiers as { upc?: string })?.upc || ''));
  }

  function attachFromSearch(product: Product | null) {
    if (!product) return;
    setAttachedProduct(product);
    setProductEdited(false);
    setSearchOpen(false);
    setProductSearch('');
    fillProductFields(product);
  }

  // -- AI suggest: auto-applies, each changed field keeps a one-click AI ⇄ original toggle.
  const fieldAccess: Record<string, { label: string; get: () => string; set: (v: string) => void; product?: boolean }> = {
    title: { label: 'Title', get: () => pTitle, set: setPTitle, product: true },
    brand: { label: 'Brand', get: () => pBrand, set: setPBrand, product: true },
    model: { label: 'Model', get: () => pModel, set: setPModel, product: true },
    category: { label: 'Category', get: () => pCategory, set: setPCategory, product: true },
    condition: {
      label: 'Condition',
      get: () => condition,
      set: (v) => {
        const normalized = normalizeProcessingCondition(v);
        setCondition(normalized);
        if (normalized === 'salvage') setDispatch('salvage');
      },
    },
    price: { label: 'Price', get: () => price, set: setPrice },
    retail_value: { label: 'Retail', get: () => retail, set: setRetail },
    search_tags: { label: 'Tags', get: () => searchTagsCsv, set: setSearchTagsCsv },
    notes: { label: 'Notes', get: () => notes, set: setNotes },
  };

  async function runAiSuggest() {
    setAiMessage(null);
    const context = {
      title: pTitle,
      brand: pBrand,
      model: pModel,
      category: pCategory,
      condition,
      price,
      retail_value: retail,
      notes,
      specifications: suggestionText(aiSpecs || row.specs || rowLinkedProduct?.specs),
      search_tags: searchTagsCsv || row.tags || '',
    };
    try {
      const result = await aiSuggest.mutateAsync({ fields: [...AI_FIELDS, 'specifications'], context });
      const suggestions = result.suggestions ?? {};
      const nextStates: Record<string, AiFieldState> = {};
      let productTouched = false;
      for (const field of AI_FIELDS) {
        const access = fieldAccess[field];
        const after = field === 'search_tags' ? parseTags(suggestions[field]).join(', ') : suggestionText(suggestions[field]);
        if (!access || !after) continue;
        const before = access.get();
        if (after.trim() === before.trim()) continue;
        access.set(after);
        nextStates[field] = { label: access.label, before, after, useAi: true };
        if (access.product) productTouched = true;
      }
      const specs = suggestions.specifications;
      if (specs && typeof specs === 'object' && !Array.isArray(specs)) {
        setAiSpecs(specs as Record<string, unknown>);
      }
      if (productTouched && attachedProduct) setProductEdited(true);
      setAiFields(nextStates);
      setAiMessage(
        Object.keys(nextStates).length === 0 ?
          'AI had no changes to suggest.'
        : result.low_confidence ?
          result.low_confidence_reason || 'AI filled the toggled fields below — low confidence, review before saving.'
        : `AI filled ${Object.keys(nextStates).length} field(s) — toggle any of them back below.`,
      );
    } catch {
      setAiMessage('AI suggestions failed. You can still check in manually.');
    }
  }

  function toggleAiField(field: string) {
    const state = aiFields[field];
    const access = fieldAccess[field];
    if (!state || !access) return;
    const useAi = !state.useAi;
    access.set(useAi ? state.after : state.before);
    setAiFields((prev) => ({ ...prev, [field]: { ...state, useAi } }));
  }

  function revertAllAi() {
    for (const [field, state] of Object.entries(aiFields)) {
      if (state.useAi) fieldAccess[field]?.set(state.before);
    }
    setAiFields((prev) =>
      Object.fromEntries(Object.entries(prev).map(([k, s]) => [k, { ...s, useAi: false }])),
    );
  }

  function buildProductPart(): Record<string, unknown> {
    if (attachedProduct && !productEdited) {
      return { product_mode: 'existing', product_id: attachedProduct.id };
    }
    const fields = {
      title: pTitle.trim() || row.title || rowLinkedProduct?.title,
      brand: pBrand,
      model: pModel,
      category: pCategory,
      identifiers: {
        ...((row.identifiers as Record<string, string> | undefined) || {}),
        ...(pUpc ? { upc: pUpc } : {}),
      },
    };
    if (attachedProduct && productEdited) {
      return { product_mode: 'edit', product_id: attachedProduct.id, ...fields };
    }
    return { product_mode: 'new', ...fields };
  }

  function buildPayload(): Record<string, unknown> {
    return {
      ...buildProductPart(),
      quantity: qtyValue,
      condition,
      dispatch,
      retail: retail || undefined,
      price: price || undefined,
      notes,
      specifications: aiSpecs || row.specs || rowLinkedProduct?.specs || undefined,
      search_tags: parseTags(searchTagsCsv || row.tags),
    };
  }

  async function saveProductDecision() {
    if (!onSaveProduct || saveProductDisabled) return;
    const part = buildProductPart();
    await onSaveProduct(
      part.product_mode === 'existing' ? part : {
        ...part,
        specifications: aiSpecs || row.specs || rowLinkedProduct?.specs || undefined,
        search_tags: parseTags(searchTagsCsv || row.tags),
        price: price || undefined,
      },
    );
  }

  async function doSubmit(printLabels: boolean) {
    const ok = await onSubmit(buildPayload(), { printLabels });
    if (ok) onClose();
  }

  async function submitEdit(printLabels: boolean) {
    if (!editCheckIn || !onUpdateItemCheckIn) return;
    if (qtyDelta > 0) {
      if (!window.confirm(`Add ${qtyDelta} item${qtyDelta === 1 ? '' : 's'} to this check-in?`)) return;
    } else if (qtyDelta < 0) {
      const n = -qtyDelta;
      if (!window.confirm(`Delete ${n} item${n === 1 ? '' : 's'} from this check-in? Their tags are removed from inventory.`)) return;
    }
    const ok = await onUpdateItemCheckIn(editCheckIn.id, buildPayload(), { printLabels });
    if (ok) onClose();
  }

  async function submit(printLabels: boolean) {
    if (isEditMode) {
      await submitEdit(printLabels);
      return;
    }
    if (isLargeCheckIn(qtyValue)) {
      // Big runs confirm intent first; printing additionally requires typing PRINT <qty>.
      setVolumeConfirm(printLabels);
      return;
    }
    await doSubmit(printLabels);
  }

  const aiToggleEntries = Object.entries(aiFields);
  const rowIdentifierHint = identifiersSummary(row.identifiers ?? {});

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      fullWidth
      maxWidth="lg"
      PaperProps={{
        sx: {
          width: 'min(1180px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 48px)',
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: processingTokens.border }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.1 }}>
              {row.collapsedGroup ?
                `Rows ${[row.rowNum, ...row.collapsedGroup.memberRowNumbers].join(', ')} (collapsed)`
              : `Row ${row.rowNum}`}
            </Typography>
            <Typography variant="h6" sx={{ lineHeight: 1.15 }}>
              {isEditMode ? `Edit check-in (${originalQty} item${originalQty === 1 ? '' : 's'})` : 'Check in items'}
            </Typography>
          </Box>
          {!isEditMode ?
            <Stack direction="row" spacing={0.75} sx={{ display: { xs: 'none', md: 'flex' } }}>
              <MetricPill label="Left after" value={qtyLeftAfter} tone={qtyLeftAfter === 0 ? 'good' : 'warning'} />
              <MetricPill label="Prior" value={effQty.dispositioned} />
            </Stack>
          : null}
          <IconButton aria-label="Close check-in" onClick={onClose} disabled={loading} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent
        dividers={false}
        sx={{
          p: 1.25,
          bgcolor: processingTokens.cardDeckBg,
          overflow: 'auto',
        }}
      >
        <Stack spacing={1.25} sx={{ minWidth: 0, maxWidth: '100%' }}>
          <CheckInSectionCard
            title="Product"
            trailing={
              <Tooltip title="Fill product/item fields with AI — each change gets a toggle so you can flip back.">
                <Button
                  size="small"
                  startIcon={aiSuggest.isPending ? <CircularProgress size={14} /> : <AutoAwesome />}
                  onClick={() => void runAiSuggest()}
                  disabled={aiSuggest.isPending || loading}
                >
                  AI suggest
                </Button>
              </Tooltip>
            }
          >
            <Stack spacing={1}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                {attachedProduct ?
                  <Chip
                    color="primary"
                    variant="filled"
                    size="small"
                    label={productLabel(attachedProduct)}
                    sx={{ fontWeight: 800, maxWidth: 420 }}
                  />
                : <Chip
                    variant="outlined"
                    size="small"
                    label="New product will be created"
                    sx={{ fontWeight: 700, borderStyle: 'dashed' }}
                  />}
                {attachedProduct ?
                  <Button size="small" variant="outlined" onClick={detachToNewProduct} disabled={loading}>
                    New product
                  </Button>
                : null}
                <Button
                  size="small"
                  variant={searchOpen ? 'contained' : 'outlined'}
                  startIcon={<Search sx={{ fontSize: 15 }} />}
                  onClick={() => setSearchOpen((prev) => !prev)}
                  disabled={loading}
                >
                  Search product
                </Button>
              </Box>

              {searchOpen ?
                <Autocomplete
                  size="small"
                  options={productOptions}
                  value={null}
                  loading={productsFetching}
                  onChange={(_event, value) => attachFromSearch(value)}
                  onInputChange={(_event, value) => setProductSearch(value)}
                  getOptionLabel={(option) => `${option.product_number ?? option.id} - ${option.title}`}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  renderInput={(params) => <TextField {...params} autoFocus label="Search products — selecting attaches it" />}
                />
              : null}

              {attachedProduct && productEdited ?
                <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 700, lineHeight: 1.3 }}>
                  You are editing product {attachedProduct.product_number || `#${attachedProduct.id}`}
                  {editUsage && (editUsage.item_count > 0 || editUsage.order_count > 0) ?
                    ` — already attached to ${editUsage.item_count.toLocaleString()} item${editUsage.item_count === 1 ? '' : 's'} across ${editUsage.order_count.toLocaleString()} order${editUsage.order_count === 1 ? '' : 's'}. Saving updates it everywhere.`
                  : ' — saving updates it everywhere it is used.'}
                </Typography>
              : null}

              <Box sx={{ display: 'grid', gridTemplateColumns: FIELD_GRID, gap: 1 }}>
                <FieldText label="Title" value={pTitle} density="compact" onChange={(v) => { markProductEdited(); setPTitle(v); }} />
                <FieldText label="Brand" value={pBrand} density="compact" onChange={(v) => { markProductEdited(); setPBrand(v); }} />
                <FieldText label="Model" value={pModel} density="compact" onChange={(v) => { markProductEdited(); setPModel(v); }} />
                <FieldText label="Category" value={pCategory} onChange={(v) => { markProductEdited(); setPCategory(v); }} />
                <FieldText
                  label="Identifiers (UPC)"
                  value={pUpc}
                  onChange={(v) => { markProductEdited(); setPUpc(v); }}
                  tooltip={pUpc.trim() || rowIdentifierHint}
                />
                <FieldText label="Tags" value={searchTagsCsv} onChange={setSearchTagsCsv} />
              </Box>

              {aiMessage ? (
                <Alert severity={aiToggleEntries.length ? 'info' : 'warning'} sx={{ py: 0.35 }}>
                  {aiMessage}
                </Alert>
              ) : null}
              {aiToggleEntries.length ? (
                <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
                  <Button size="small" variant="outlined" startIcon={<Undo sx={{ fontSize: 14 }} />} onClick={revertAllAi}>
                    Revert all
                  </Button>
                  {aiToggleEntries.map(([field, state]) => (
                    <Tooltip
                      key={field}
                      title={state.useAi ? `Original: ${state.before || '(empty)'} — click to revert` : `AI: ${state.after} — click to re-apply`}
                      enterDelay={300}
                      disableInteractive
                    >
                      <Chip
                        size="small"
                        icon={state.useAi ? <AutoAwesome sx={{ fontSize: 14 }} /> : <Undo sx={{ fontSize: 14 }} />}
                        color={state.useAi ? 'secondary' : 'default'}
                        variant={state.useAi ? 'filled' : 'outlined'}
                        label={`${state.label}: ${state.useAi ? 'AI' : 'original'}`}
                        onClick={() => toggleAiField(field)}
                      />
                    </Tooltip>
                  ))}
                </Stack>
              ) : null}
            </Stack>
          </CheckInSectionCard>

          <CheckInSectionCard title="Item">
            <Box sx={{ display: 'grid', gridTemplateColumns: FIELD_GRID, gap: 1 }}>
              <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', fontSize: '0.62rem', mb: 0.4 }}
                  >
                    Quantity
                  </Typography>
                  <QuantityControl
                    quantity={quantity}
                    disabled={loading}
                    onChange={setQuantity}
                    onBlur={handleQuantityBlur}
                    onBump={bumpQuantity}
                  />
                </Box>
                {isEditMode && qtyDelta !== 0 ?
                  <Typography variant="body2" sx={{ color: qtyDelta > 0 ? processingTokens.accentGreen : 'error.main', fontWeight: 800 }}>
                    {qtyDelta > 0 ?
                      `Will ADD ${qtyDelta} item${qtyDelta === 1 ? '' : 's'} to this check-in (you'll confirm).`
                    : `Will DELETE ${-qtyDelta} item${qtyDelta === -1 ? '' : 's'} from this check-in (you'll confirm).`}
                  </Typography>
                : null}
              </Box>
              <SegmentedButtons
                label="Condition"
                value={condition}
                gridColumn="1 / -1"
                disabled={loading}
                options={PROCESSING_ITEM_CONDITION_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={(next) => {
                  const normalized = normalizeProcessingCondition(next);
                  setCondition(normalized);
                  if (normalized === 'salvage') setDispatch('salvage');
                }}
              />
              <SegmentedButtons
                label="Location / dispatch"
                value={dispatch}
                gridColumn="1 / -1"
                disabled={loading || salvageLocked}
                helperText={salvageLocked ? 'Salvage condition routes to salvage.' : undefined}
                options={PROCESSING_ITEM_DISPATCH_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={setDispatch}
              />
              <FieldText label="Shelf price" value={price} onChange={setPrice} />
              <FieldText
                label="Retail"
                value={retail}
                onChange={setRetail}
                tooltip={row.unitRetail ? `Manifest ${formatCurrency(row.unitRetail)}` : undefined}
              />
              <FieldText
                label="Notes"
                value={notes}
                multiline
                minRows={2}
                maxRows={5}
                onChange={setNotes}
                gridColumn="1 / -1"
              />
            </Box>
          </CheckInSectionCard>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.25, gap: 1, borderTop: 1, borderColor: processingTokens.border, flexWrap: 'wrap' }}>
        <Button onClick={onClose} disabled={loading || saveProductLoading} sx={{ mr: 'auto' }}>
          Cancel
        </Button>
        {isEditMode ?
          <>
            {qtyDelta > 0 ?
              <Button
                variant="outlined"
                startIcon={<LocalPrintshop />}
                disabled={submitDisabled}
                onClick={() => void submit(true)}
              >
                Save & print {qtyDelta} new label{qtyDelta === 1 ? '' : 's'}
              </Button>
            : null}
            <Button variant="contained" disabled={submitDisabled} onClick={() => void submit(false)}>
              Save changes
            </Button>
          </>
        : <>
            {onSaveProduct ?
              <Button
                variant="outlined"
                disabled={saveProductDisabled}
                onClick={() => void saveProductDecision()}
              >
                {saveProductLoading ? 'Saving…' : 'Save product'}
              </Button>
            : null}
            <Button variant="outlined" disabled={submitDisabled} onClick={() => void submit(false)}>
              Check in without printing
            </Button>
            <Button
              variant="contained"
              startIcon={<LocalPrintshop />}
              disabled={submitDisabled}
              onClick={() => void submit(true)}
            >
              Check in & print
            </Button>
          </>}
      </DialogActions>

      <LargeCheckInConfirmDialog
        open={volumeConfirm != null}
        quantity={qtyValue}
        printLabels={volumeConfirm === true}
        loading={loading}
        onCancel={() => setVolumeConfirm(null)}
        onConfirm={() => {
          const printLabels = volumeConfirm === true;
          setVolumeConfirm(null);
          void doSubmit(printLabels);
        }}
      />
    </Dialog>
  );
}
