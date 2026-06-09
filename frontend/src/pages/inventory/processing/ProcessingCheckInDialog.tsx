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
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode, type WheelEvent } from 'react';
import { getProducts } from '../../../api/inventory.api';
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
import { identifiersSummary } from './processingManifestSummary';
import { processingTokens } from './processingTokens';

type CheckInProductMode = 'new' | 'existing' | 'prior' | 'keep' | 'edit';
type ProductLike = Product | ProcessingWorkspaceProductDTO;
type FieldDensity = 'compact' | 'normal' | 'emphasized';

const AI_FIELDS = ['title', 'brand', 'model', 'category', 'condition', 'price', 'retail_value', 'specifications', 'search_tags', 'notes'];
const APPLYABLE_AI_FIELDS = new Set(AI_FIELDS);
const FIELD_GRID = { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' };
const MAX_CHECK_IN_QTY = 500;

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

function FieldSelect({
  label,
  value,
  onChange,
  disabled,
  helperText,
  children,
  density = 'normal',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  helperText?: string;
  children: ReactNode;
  density?: FieldDensity;
}) {
  const metrics = FIELD_DENSITY_SX[density];
  const tooltipValue = helperText ? `${value}${helperText ? `\n${helperText}` : ''}` : value;
  const field = (
    <TextField
      select
      label={label}
      size="small"
      value={value}
      disabled={disabled}
      helperText={helperText}
      onChange={(event) => onChange(event.target.value)}
      fullWidth
      sx={{
        '& .MuiInputBase-input': { fontSize: metrics.input },
        '& .MuiInputLabel-root': { fontSize: metrics.label },
      }}
    >
      {children}
    </TextField>
  );

  if (!value.trim()) return field;

  return (
    <Tooltip title={tooltipValue} enterDelay={350} disableInteractive>
      <Box component="span" sx={{ display: 'block', minWidth: 0 }}>
        {field}
      </Box>
    </Tooltip>
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
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, unknown> | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiSpecs, setAiSpecs] = useState<Record<string, unknown> | null>(null);
  const [aiSearchTags, setAiSearchTags] = useState<string[]>([]);

  const selectedPriorProduct = priorProducts.find((product) => product.id === selectedPriorProductId) ?? null;

  const { data: productsPage, isFetching: productsFetching } = useQuery({
    queryKey: ['products', 'processing-check-in', productSearch],
    queryFn: async () => {
      const { data } = await getProducts({ search: productSearch.trim() || undefined, page_size: 25 });
      return data;
    },
    enabled: open && productMode === 'existing',
    staleTime: 30_000,
  });
  const productOptions = useMemo(() => productsPage?.results ?? [], [productsPage?.results]);

  const qtyValue = Math.max(1, Number.parseInt(quantity, 10) || 1);
  const qtyLeftAfter = Math.max(0, (row.qtyRemaining ?? Math.max(0, row.qty - row.qtyDispositioned)) - qtyValue);
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
    const defaultMode: CheckInProductMode = seedProductId ? 'prior' : 'new';

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
    setPTitle(seed?.item.product_title || seed?.batch?.product?.title || row.title || rowLinkedProduct?.title || '');
    setPBrand(seed?.item.product_brand || seed?.batch?.product?.brand || row.brand || rowLinkedProduct?.brand || '');
    setPModel(seed?.item.product_model || seed?.batch?.product?.model || row.model || rowLinkedProduct?.model || '');
    setPCategory(seed?.batch?.product?.category || row.category || rowLinkedProduct?.category || '');
    setPUpc(seed?.batch?.product?.upc || rowLinkedProduct?.upc || String((row.identifiers as { upc?: string })?.upc || ''));
    setSearchTagsCsv(row.tags || '');
    setAiSuggestions(null);
    setAiMessage(null);
    setAiSpecs(null);
    setAiSearchTags([]);
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

  async function submit(printLabels: boolean) {
    const ok = await onSubmit(buildPayload(), { printLabels });
    if (ok) onClose();
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
              Row {row.rowNum} detailed check-in
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
              <MetricPill label="Prior" value={row.qtyDispositioned ?? 0} />
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
                <TextField
                  select
                  size="small"
                  label="Product action"
                  value={productMode}
                  onChange={(event) => handleProductModeChange(event.target.value as CheckInProductMode)}
                  fullWidth
                >
                  <MenuItem value="new">Create new Product for this check-in</MenuItem>
                  {priorProducts.length ? <MenuItem value="prior">Use prior Product from this row</MenuItem> : null}
                  <MenuItem value="existing">Use existing catalog Product</MenuItem>
                  {rowLinkedProduct ? <MenuItem value="keep">Use row-linked Product without edits</MenuItem> : null}
                  {rowLinkedProduct ? <MenuItem value="edit">Edit shared row-linked Product</MenuItem> : null}
                </TextField>

                {productMode === 'prior' ? (
                  <TextField
                    select
                    size="small"
                    label="Prior Product"
                    value={selectedPriorProductId ?? ''}
                    onChange={(event) => {
                      const id = Number(event.target.value);
                      const product = priorProducts.find((p) => p.id === id) ?? null;
                      setSelectedPriorProductId(product?.id ?? null);
                      if (product) fillProductFields(product);
                    }}
                    fullWidth
                  >
                    {priorProducts.map((product) => (
                      <MenuItem key={product.id} value={product.id}>
                        {productLabel(product)}
                      </MenuItem>
                    ))}
                  </TextField>
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
                <FieldSelect
                  label="Condition"
                  value={condition}
                  onChange={(next) => {
                    const normalized = normalizeProcessingCondition(next);
                    setCondition(normalized);
                    if (normalized === 'salvage') setDispatch('salvage');
                  }}
                >
                  {PROCESSING_ITEM_CONDITION_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </FieldSelect>
                <FieldSelect
                  label="Location / dispatch"
                  value={dispatch}
                  disabled={salvageLocked}
                  helperText={salvageLocked ? 'Salvage condition routes to salvage.' : undefined}
                  onChange={setDispatch}
                >
                  {PROCESSING_ITEM_DISPATCH_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </FieldSelect>
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
    </Dialog>
  );
}
