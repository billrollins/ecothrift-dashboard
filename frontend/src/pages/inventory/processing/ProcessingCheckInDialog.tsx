import Add from '@mui/icons-material/Add';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import Close from '@mui/icons-material/Close';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import Remove from '@mui/icons-material/Remove';
import Search from '@mui/icons-material/Search';
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
  ProcessingCheckInBatchDTO,
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
import { formatSearchTagsCsv } from './processingGoogleQuery';
import { effectiveRowQty } from './processingQueueCellText';
import { isLargeCheckIn, MAX_CHECK_IN_QUANTITY } from './largeCheckIn';
import { LargeCheckInConfirmDialog } from './LargeCheckInConfirmDialog';
import { identifiersSummary } from './processingManifestSummary';
import { processingTokens } from './processingTokens';

type CheckInProductMode = 'new' | 'existing' | 'prior' | 'keep' | 'edit';
type ProductLike = Product | ProcessingWorkspaceProductDTO;
type FieldDensity = 'compact' | 'normal' | 'emphasized';

const AI_FIELDS = ['title', 'brand', 'model', 'category', 'condition', 'price', 'retail_value', 'specifications', 'search_tags', 'notes'];
const APPLYABLE_AI_FIELDS = new Set(AI_FIELDS);
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

function compactJson(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
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
  if (typeof value === 'object') return compactJson(value);
  return String(value);
}

function dedupeProducts(products: Array<ProductLike | null | undefined>): ProductLike[] {
  const seen = new Set<number>();
  const out: ProductLike[] = [];
  for (const product of products) {
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    out.push(product);
  }
  return out;
}

function productLabel(product: ProductLike): string {
  const number = product.product_number || `#${product.id}`;
  return `${number} - ${product.title}`;
}

function CheckInSectionCard({
  title,
  note,
  trailing,
  children,
}: {
  title: string;
  note?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        overflow: 'hidden',
        borderColor: processingTokens.border,
        bgcolor: processingTokens.surfaceRaised,
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          px: 1.25,
          py: 0.65,
          borderBottom: 1,
          borderColor: processingTokens.border,
          bgcolor: processingTokens.neutralSoft,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" fontWeight={900} letterSpacing={0.55} sx={{ display: 'block', textTransform: 'uppercase' }}>
            {title}
          </Typography>
          {note ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.25, mt: 0.15 }}>
              {note}
            </Typography>
          ) : null}
        </Box>
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

function HeaderQuantityControl({
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
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 132 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, letterSpacing: 0.55, textTransform: 'uppercase', lineHeight: 1, mb: 0.35 }}>
        Quantity
      </Typography>
      <Paper
        variant="outlined"
        sx={{
          display: 'flex',
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
    </Box>
  );
}

function FieldText({
  label,
  value,
  onChange,
  onProductIdentityChange,
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
  onProductIdentityChange?: () => void;
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
      onChange={(event) => {
        onProductIdentityChange?.();
        onChange(event.target.value);
      }}
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
  batch: ProcessingCheckInBatchDTO | null;
}

export interface ProcessingCheckInDialogProps {
  open: boolean;
  row: ProcessingWorkspaceRowDTO;
  loading: boolean;
  seed?: ProcessingCheckInSeed | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>, options: { printLabels: boolean }) => Promise<boolean>;
}

export function ProcessingCheckInDialog({
  open,
  row,
  loading,
  seed = null,
  onClose,
  onSubmit,
}: ProcessingCheckInDialogProps) {
  const rowLinkedProduct = row.product;
  const aiSuggest = useAISuggestItem();
  const priorProducts = useMemo(
    () => dedupeProducts((row.checkInBatches ?? []).map((batch) => batch.product)),
    [row.checkInBatches],
  );

  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState<ItemCondition>(PROCESSING_ITEM_DEFAULT_CONDITION);
  const [dispatch, setDispatch] = useState(row.dispatch || 'on_shelf');
  const [retail, setRetail] = useState(row.unitRetail ?? '');
  const [price, setPrice] = useState(row.price ?? '');
  const [notes, setNotes] = useState('');
  const [productMode, setProductMode] = useState<CheckInProductMode>('new');
  const [productSearch, setProductSearch] = useState('');
  const [selectedExistingProduct, setSelectedExistingProduct] = useState<Product | null>(null);
  const [selectedPriorProductId, setSelectedPriorProductId] = useState<number | null>(null);
  const [pTitle, setPTitle] = useState('');
  const [pBrand, setPBrand] = useState('');
  const [pModel, setPModel] = useState('');
  const [pCategory, setPCategory] = useState('');
  const [pUpc, setPUpc] = useState('');
  const [searchTagsCsv, setSearchTagsCsv] = useState('');
  /** Pending large check-in awaiting confirmation; value = printLabels of the request. */
  const [volumeConfirm, setVolumeConfirm] = useState<boolean | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, unknown> | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiSpecs, setAiSpecs] = useState<Record<string, unknown> | null>(null);
  const [aiSearchTags, setAiSearchTags] = useState<string[]>([]);

  const selectedPriorProduct = priorProducts.find((product) => product.id === selectedPriorProductId) ?? null;

  const { products: productOptions, isFetching: productsFetching } = useProductSearch(
    'processing-check-in',
    productSearch,
    open && productMode === 'existing',
    25,
  );

  // Blast-radius fetch only when staff pick "Edit linked" — nothing loads on dialog open.
  const editTargetProductId =
    open && productMode === 'edit' ? (rowLinkedProduct?.id ?? null) : null;
  const { usage: editUsage } = useProductUsage(editTargetProductId);

  const productModeOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; hint?: string }> = [
      { value: 'new', label: 'New product', hint: 'Create a new catalog Product from the fields below.' },
    ];
    if (priorProducts.length) {
      options.push({ value: 'prior', label: 'Prior from row', hint: 'Reuse a Product already checked in on this row.' });
    }
    options.push({ value: 'existing', label: 'Search catalog', hint: 'Pick any existing catalog Product.' });
    if (rowLinkedProduct) {
      options.push(
        { value: 'keep', label: 'Keep linked', hint: `Use ${productLabel(rowLinkedProduct)} as-is.` },
        { value: 'edit', label: 'Edit linked', hint: `Update the shared fields on ${productLabel(rowLinkedProduct)}.` },
      );
    }
    return options;
  }, [priorProducts.length, rowLinkedProduct]);

  const qtyValue = Math.max(1, Number.parseInt(quantity, 10) || 1);
  // P7 collapse: masters cap/report against the COMBINED group numbers.
  const effQty = effectiveRowQty(row);
  const qtyLeftAfter = Math.max(0, effQty.remaining - qtyValue);
  const salvageLocked = condition === 'salvage';
  const existingSelectionRequired = productMode === 'existing' && !selectedExistingProduct;
  const priorSelectionRequired = productMode === 'prior' && !selectedPriorProduct;
  const submitDisabled = loading || existingSelectionRequired || priorSelectionRequired;

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

  useEffect(() => {
    if (!open) return;
    const defaults = seed?.batch?.defaults ?? {};
    const seedProductId = seed?.batch?.product?.id ?? null;
    const hasLinkedProduct = Boolean(row.productId && row.product);
    const defaultMode: CheckInProductMode = seedProductId
      ? 'prior'
      : hasLinkedProduct
        ? 'keep'
        : 'new';

    setQuantity('1');
    setCondition(normalizeProcessingCondition(seed?.item.condition || seed?.item.condition_label || row.condition));
    setDispatch(seed?.item.dispatch || strDefault(defaults.dispatch) || row.dispatch || 'on_shelf');
    setRetail(seed?.item.retail ?? (strDefault(defaults.retail) || row.unitRetail || ''));
    setPrice(seed?.item.price ?? (strDefault(defaults.price) || row.price || ''));
    setNotes(strDefault(defaults.notes) || seed?.item.notes || row.manifestNotes || '');
    setProductMode(defaultMode);
    setSelectedExistingProduct(null);
    setSelectedPriorProductId(seedProductId);
    setProductSearch('');
    setPTitle(
      seed?.item.product_title
      || seed?.batch?.product?.title
      || (defaultMode === 'keep' ? row.product?.title : null)
      || row.title
      || rowLinkedProduct?.title
      || '',
    );
    setPBrand(
      seed?.item.product_brand
      || seed?.batch?.product?.brand
      || (defaultMode === 'keep' ? row.product?.brand : null)
      || row.brand
      || rowLinkedProduct?.brand
      || '',
    );
    setPModel(
      seed?.item.product_model
      || seed?.batch?.product?.model
      || (defaultMode === 'keep' ? row.product?.model : null)
      || row.model
      || rowLinkedProduct?.model
      || '',
    );
    setPCategory(
      seed?.batch?.product?.category
      || (defaultMode === 'keep' ? row.product?.category : null)
      || row.category
      || rowLinkedProduct?.category
      || '',
    );
    setPUpc(
      seed?.batch?.product?.upc
      || (defaultMode === 'keep' ? row.product?.upc : null)
      || rowLinkedProduct?.upc
      || String((row.identifiers as { upc?: string })?.upc || ''),
    );
    setSearchTagsCsv(row.tags || '');
    setAiSuggestions(null);
    setAiMessage(null);
    setAiSpecs(null);
    setAiSearchTags([]);
    setVolumeConfirm(null);
  }, [open, seed, row, rowLinkedProduct]);

  function switchToNewForIdentityEdit() {
    if (productMode !== 'new' && productMode !== 'edit') {
      setProductMode('new');
      setSelectedExistingProduct(null);
      setSelectedPriorProductId(null);
    }
  }

  function fillProductFields(product: ProductLike) {
    setPTitle(product.title || '');
    setPBrand(product.brand || '');
    setPModel(product.model || '');
    setPCategory(product.category || '');
    setPUpc(product.upc || '');
  }

  function handleProductModeChange(mode: CheckInProductMode) {
    setProductMode(mode);
    setAiMessage(null);

    if (mode === 'new') {
      setSelectedExistingProduct(null);
      setSelectedPriorProductId(null);
      setPTitle(row.title || '');
      setPBrand(row.brand || '');
      setPModel(row.model || '');
      setPCategory(row.category || '');
      setPUpc(String((row.identifiers as { upc?: string })?.upc || ''));
      return;
    }
    if (mode === 'keep' || mode === 'edit') {
      setSelectedExistingProduct(null);
      setSelectedPriorProductId(null);
      if (rowLinkedProduct) fillProductFields(rowLinkedProduct);
      return;
    }
    if (mode === 'prior') {
      setSelectedExistingProduct(null);
      const prior = selectedPriorProduct ?? priorProducts[0] ?? null;
      setSelectedPriorProductId(prior?.id ?? null);
      if (prior) fillProductFields(prior);
    }
  }

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
      specifications: compactJson(aiSpecs || row.specs || rowLinkedProduct?.specs),
      description: row.description || '',
      search_tags: aiSearchTags.length ? aiSearchTags.join(', ') : row.tags || '',
    };
    try {
      const result = await aiSuggest.mutateAsync({ fields: AI_FIELDS, context });
      setAiSuggestions(result.suggestions ?? {});
      setAiMessage(
        result.low_confidence ?
          result.low_confidence_reason || 'AI returned low-confidence suggestions. Review before applying.'
        : `AI suggestions ready (${result.examples_used ?? 0} store examples).`,
      );
    } catch {
      setAiMessage('AI suggestions failed. You can still check in manually.');
    }
  }

  function applySuggestion(field: string) {
    if (!aiSuggestions || !(field in aiSuggestions)) return;
    const value = aiSuggestions[field];
    if (field === 'title') {
      switchToNewForIdentityEdit();
      setPTitle(suggestionText(value));
    } else if (field === 'brand') {
      switchToNewForIdentityEdit();
      setPBrand(suggestionText(value));
    } else if (field === 'model') {
      switchToNewForIdentityEdit();
      setPModel(suggestionText(value));
    } else if (field === 'category') {
      switchToNewForIdentityEdit();
      setPCategory(suggestionText(value));
    } else if (field === 'condition') {
      setCondition(normalizeProcessingCondition(suggestionText(value)));
    } else if (field === 'price') {
      setPrice(suggestionText(value));
    } else if (field === 'retail_value') {
      setRetail(suggestionText(value));
    } else if (field === 'notes') {
      setNotes(suggestionText(value));
    } else if (field === 'specifications' && value && typeof value === 'object' && !Array.isArray(value)) {
      setAiSpecs(value as Record<string, unknown>);
    } else if (field === 'search_tags') {
      const tags = parseTags(value);
      setAiSearchTags(tags);
      setSearchTagsCsv(formatSearchTagsCsv(tags));
    }
  }

  function applyAllSuggestions() {
    if (!aiSuggestions) return;
    for (const field of Object.keys(aiSuggestions)) applySuggestion(field);
    setAiMessage('Applied AI suggestions. Review changed fields before check-in.');
  }

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      product_mode:
        productMode === 'prior' ? 'existing'
        : productMode,
      quantity: qtyValue,
      condition,
      dispatch,
      retail: retail || undefined,
      unit_retail: retail || undefined,
      price: price || undefined,
      notes,
      specifications: aiSpecs || row.specs || rowLinkedProduct?.specs || undefined,
      search_tags: aiSearchTags.length ? aiSearchTags : parseTags(searchTagsCsv || row.tags),
    };
    if (productMode === 'existing' && selectedExistingProduct) {
      payload.product_id = selectedExistingProduct.id;
      return payload;
    }
    if (productMode === 'prior' && selectedPriorProduct) {
      payload.product_id = selectedPriorProduct.id;
      return payload;
    }
    if (productMode === 'keep') return payload;

    payload.title = pTitle.trim() || row.title || rowLinkedProduct?.title;
    payload.brand = pBrand || row.brand || rowLinkedProduct?.brand;
    payload.model = pModel || row.model || rowLinkedProduct?.model;
    payload.category = pCategory || row.category || rowLinkedProduct?.category;
    payload.upc = pUpc || String((row.identifiers as { upc?: string })?.upc || rowLinkedProduct?.upc || '');
    return payload;
  }

  async function doSubmit(printLabels: boolean) {
    const ok = await onSubmit(buildPayload(), { printLabels });
    if (ok) onClose();
  }

  async function submit(printLabels: boolean) {
    if (isLargeCheckIn(qtyValue)) {
      // Big runs confirm intent first; printing additionally requires typing PRINT <qty>.
      setVolumeConfirm(printLabels);
      return;
    }
    await doSubmit(printLabels);
  }

  const suggestionEntries = aiSuggestions ?
    Object.entries(aiSuggestions).filter(([field, value]) => APPLYABLE_AI_FIELDS.has(field) && suggestionText(value))
  : [];

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
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ minWidth: 0, justifySelf: 'start' }}>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.1 }}>
              {row.collapsedGroup ?
                `Rows ${[row.rowNum, ...row.collapsedGroup.memberRowNumbers].join(', ')} (collapsed) detailed check-in`
              : `Row ${row.rowNum} detailed check-in`}
            </Typography>
            <Typography variant="h6" sx={{ lineHeight: 1.15 }}>
              Create checked-in item(s)
            </Typography>
          </Box>
          <HeaderQuantityControl
            quantity={quantity}
            disabled={loading}
            onChange={setQuantity}
            onBlur={handleQuantityBlur}
            onBump={bumpQuantity}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.75, justifySelf: 'end' }}>
            <Stack direction="row" spacing={0.75} sx={{ display: { xs: 'none', md: 'flex' } }}>
              <MetricPill label="Left after" value={qtyLeftAfter} tone={qtyLeftAfter === 0 ? 'good' : 'warning'} />
              <MetricPill label="Prior" value={effQty.dispositioned} />
            </Stack>
            <IconButton aria-label="Close check-in" onClick={onClose} disabled={loading} size="small">
              <Close />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent
        dividers={false}
        sx={{
          p: 1.25,
          bgcolor: processingTokens.cardDeckBg,
          overflow: { xs: 'auto', md: 'hidden' },
        }}
      >
        <Stack spacing={1.25} sx={{ minWidth: 0, maxWidth: '100%' }}>
          <CheckInSectionCard
            title="Product"
              note="Rows provide defaults. Pick an existing Product or create a new one for this check-in."
              trailing={
                <Tooltip title="AI is user-triggered and does not run when the modal opens.">
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
                <SegmentedButtons
                  label="Product action"
                  value={productMode}
                  options={productModeOptions}
                  disabled={loading}
                  onChange={(mode) => handleProductModeChange(mode as CheckInProductMode)}
                />

                {productMode === 'prior' ? (
                  <SegmentedButtons
                    label="Prior product"
                    value={selectedPriorProductId != null ? String(selectedPriorProductId) : ''}
                    options={priorProducts.map((product) => ({
                      value: String(product.id),
                      label: productLabel(product),
                    }))}
                    disabled={loading}
                    onChange={(raw) => {
                      const id = Number(raw);
                      const product = priorProducts.find((p) => p.id === id) ?? null;
                      setSelectedPriorProductId(product?.id ?? null);
                      if (product) fillProductFields(product);
                    }}
                  />
                ) : null}

                {productMode === 'edit' && editUsage && (editUsage.item_count > 0 || editUsage.order_count > 0) ? (
                  <Alert severity="warning" sx={{ py: 0.35 }}>
                    Editing this shared product affects <strong>{editUsage.item_count.toLocaleString()} item{editUsage.item_count === 1 ? '' : 's'}</strong>{' '}
                    across <strong>{editUsage.order_count.toLocaleString()} order{editUsage.order_count === 1 ? '' : 's'}</strong>.
                  </Alert>
                ) : null}

                {productMode === 'existing' ? (
                  <Autocomplete
                    size="small"
                    options={productOptions}
                    value={selectedExistingProduct}
                    loading={productsFetching}
                    onChange={(_event, value) => {
                      setSelectedExistingProduct(value);
                      if (value) fillProductFields(value);
                    }}
                    onInputChange={(_event, value) => setProductSearch(value)}
                    getOptionLabel={(option) => `${option.product_number ?? option.id} - ${option.title}`}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderInput={(params) => <TextField {...params} label="Search products" />}
                  />
                ) : null}

                <Box sx={{ display: 'grid', gridTemplateColumns: FIELD_GRID, gap: 1 }}>
                  <FieldText label="Title" value={pTitle} density="compact" onChange={setPTitle} onProductIdentityChange={switchToNewForIdentityEdit} />
                  <FieldText label="Brand" value={pBrand} density="compact" onChange={setPBrand} onProductIdentityChange={switchToNewForIdentityEdit} />
                  <FieldText label="Model" value={pModel} density="compact" onChange={setPModel} onProductIdentityChange={switchToNewForIdentityEdit} />
                  <FieldText label="Category" value={pCategory} onChange={setPCategory} onProductIdentityChange={switchToNewForIdentityEdit} />
                  <FieldText
                    label="Identifiers"
                    value={pUpc}
                    density="emphasized"
                    onChange={setPUpc}
                    onProductIdentityChange={switchToNewForIdentityEdit}
                    gridColumn="1 / -1"
                    tooltip={pUpc.trim() || identifiersSummary(row.identifiers ?? {})}
                  />
                  {identifiersSummary(row.identifiers ?? {}) && !pUpc.trim() ?
                    <Typography variant="caption" color="text.secondary" sx={{ gridColumn: '1 / -1', mt: -0.5 }}>
                      Row defaults: {identifiersSummary(row.identifiers ?? {})}
                    </Typography>
                  : null}
                  <FieldText
                    label="Tags"
                    value={searchTagsCsv}
                    density="emphasized"
                    onChange={setSearchTagsCsv}
                    gridColumn="1 / -1"
                  />
                  <FieldText
                    label="Notes"
                    value={notes}
                    density="emphasized"
                    multiline
                    minRows={3}
                    maxRows={6}
                    onChange={setNotes}
                    gridColumn="1 / -1"
                  />
                  <Paper variant="outlined" sx={{ p: 0.85, borderColor: processingTokens.border, bgcolor: processingTokens.surfaceTint, gridColumn: '1 / -1' }}>
                    <Stack direction="row" spacing={0.75} alignItems="flex-start">
                      <InfoOutlined sx={{ fontSize: 17, color: processingTokens.textMute, mt: 0.1 }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
                          Product impact
                        </Typography>
                        <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.25 }}>
                          {productMode === 'new' ? 'Only the item(s) created now'
                          : productMode === 'edit' ? 'Updates shared Product fields'
                          : 'Uses existing Product without editing it'}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>
                </Box>

                {aiMessage ? (
                  <Alert severity={aiSuggestions ? 'info' : 'warning'} sx={{ py: 0.35 }}>
                    {aiMessage}
                  </Alert>
                ) : null}
                {suggestionEntries.length ? (
                  <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
                    <Button size="small" variant="outlined" onClick={applyAllSuggestions}>
                      Apply all AI
                    </Button>
                    {suggestionEntries.map(([field, value]) => (
                      <Chip
                        key={field}
                        size="small"
                        icon={<AutoAwesome sx={{ fontSize: 14 }} />}
                        label={`${field}: ${suggestionText(value).slice(0, 36)}`}
                        onClick={() => applySuggestion(field)}
                        sx={{ maxWidth: 260 }}
                      />
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            </CheckInSectionCard>

            <CheckInSectionCard title="Item" note="These values apply to the item(s) created by this check-in.">
              <Box sx={{ display: 'grid', gridTemplateColumns: FIELD_GRID, gap: 1 }}>
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
                />
                {row.unitRetail ?
                  <Typography variant="caption" color="text.secondary" sx={{ gridColumn: { md: '2 / 3' }, alignSelf: 'center' }}>
                    Manifest {formatCurrency(row.unitRetail)}
                  </Typography>
                : null}
              </Box>
            </CheckInSectionCard>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.25, gap: 1, borderTop: 1, borderColor: processingTokens.border, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>
          {submitDisabled && existingSelectionRequired ? 'Select a Product before checking in.' : 'Review product action before creating items.'}
        </Typography>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="outlined"
          startIcon={<Search />}
          disabled={submitDisabled}
          onClick={() => submit(false)}
        >
          Check in without printing
        </Button>
        <Button
          variant="contained"
          startIcon={<LocalPrintshop />}
          disabled={submitDisabled}
          onClick={() => submit(true)}
        >
          Check in & print
        </Button>
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
