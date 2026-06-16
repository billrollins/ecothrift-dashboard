import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import SwapHoriz from '@mui/icons-material/SwapHoriz';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { formatRichSearch, checkInRichSearch, inventoryWorkbenchItemsUrl, inventoryWorkbenchUrl } from '../../../utils/richInventorySearch';
import { formatNumber } from '../../../utils/format';
import type { ItemCheckInCatalog, Product } from '../../../types/inventory.types';
import {
  createProduct,
  getCategories,
  getItemCheckIns,
  getProduct,
  getProductUsage,
  updateProduct,
} from '../../../api/inventory.api';
import { KeyValueJsonField } from '../../../components/inventory/KeyValueJsonField';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { useAISuggestProduct } from '../../../hooks/useInventory';
import type { Category } from '../../../types/inventory.types';
import {
  categoryLabel,
  displayValueForProductField,
  initialProductAIState,
  mapSuggestedCategoryToCategoryRef,
  productAiFieldsToApiFields,
  productAiReducer,
  productAiTooltip,
  productDraftToAiContext,
  productSuggestionActive,
  hasFlippableAiSuggestions,
  PRODUCT_AI_FIELDS,
  type ProductAIFieldName,
  type ProductEditorDraft,
  type ProductFieldAI,
} from './productAiState';
import { ProductCheckInDialog } from './ProductCheckInDialog';
import {
  IDENTIFIER_KEY_LABELS,
  IDENTIFIER_PRESET_KEYS,
} from '../processing/processingIdentifiers';
import { processingTokens } from '../processing/processingTokens';
import { WorkbenchCopyableChip } from '../workbench/WorkbenchCopyableChip';

interface ProductEditorState extends ProductEditorDraft {
  productId: number | null;
  productNumber: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface ProductManagePanelProps {
  open: boolean;
  initialProduct: Product | null;
  /** Prefill identity fields when creating a new product (e.g. from processing row details). */
  rowDetailsSeed?: { draft: Partial<ProductEditorDraft>; categoryName: string };
  /** Changes re-hydrate the new-product draft (e.g. processing_row_id). */
  rowDetailsSeedKey?: number | string;
  onClose: () => void;
  /** Fired after a successful save, before the panel closes. */
  onProductSaved?: (product: Product, ctx: { created: boolean }) => void;
  embedded?: boolean;
  onApplyProductSearch?: (productId: number) => void;
  onStartProductCheckIn?: (productId: number) => void;
  onOpenProductCheckIns?: (productId: number) => void;
  onOpenItemsForProduct?: (productId: number, status?: string) => void;
}

type SectionTone = 'identity' | 'catalog' | 'tracking';

const FIELD_HIGHLIGHT: Record<SectionTone, string> = {
  identity: '#f3faf4',
  catalog: '#faf6f2',
  tracking: '#f6f4fb',
};

const JSON_ACCENTS = {
  identifiers: '#4a7ba7',
  specifications: '#6d5b9a',
} as const;

const EMPTY_EDITOR: ProductEditorState = {
  productId: null,
  productNumber: '',
  createdAt: '',
  updatedAt: '',
  title: '',
  brand: 'Generic',
  model: '',
  categoryRef: '',
  identifiers: {},
  specifications: {},
  tagsText: '',
  isActive: true,
};

const editorSurface = '#fbfcfb';
const headerSurface = '#ffffff';
const headerSubtle = '#f6f8f6';
const borderSubtle = '#dfe7df';

const compactField = {
  '& .MuiInputBase-root': { fontSize: '0.875rem', bgcolor: '#fff' },
  '& .MuiInputLabel-root': { fontSize: '0.8125rem', color: processingTokens.textMute },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: borderSubtle },
};

const formGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
  gap: 1.5,
  alignItems: 'start',
} as const;

function aiFieldSx(tone: SectionTone, active: boolean) {
  return active ? { ...compactField, '& .MuiOutlinedInput-root': { bgcolor: FIELD_HIGHLIGHT[tone] } } : compactField;
}

function normalizeSpecObject(raw: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    const normKey = key.trim().toLowerCase().replace(/[\s-]+/g, '_').slice(0, 64);
    const normVal = String(val ?? '').trim();
    if (!normKey || !normVal) continue;
    out[normKey] = normVal;
  }
  return out;
}

function identifiersToEditor(raw: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    const normVal = String(val ?? '').trim();
    if (!normVal) continue;
    out[key] = normVal;
  }
  return out;
}

/** Map processing row bookmark fields into a new-product editor draft. */
export function rowDetailsToProductEditorDraft(input: {
  title?: string;
  brand?: string;
  model?: string;
  category?: string;
  tags?: string;
  identifiers?: Record<string, unknown>;
  specifications?: Record<string, unknown>;
}): { draft: Partial<ProductEditorDraft>; categoryName: string } {
  return {
    draft: {
      title: (input.title ?? '').trim(),
      brand: (input.brand ?? '').trim() || 'Generic',
      model: (input.model ?? '').trim(),
      tagsText: (input.tags ?? '').trim(),
      identifiers: identifiersToEditor(input.identifiers),
      specifications: normalizeSpecObject(input.specifications),
    },
    categoryName: (input.category ?? '').trim(),
  };
}

function productToEditor(product: Product): ProductEditorState {
  return {
    productId: product.id,
    productNumber: product.product_number || '',
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    title: product.title || '',
    brand: product.brand || 'Generic',
    model: product.model || '',
    categoryRef: product.category ? String(product.category) : '',
    identifiers: { ...(product.identifiers || {}) },
    specifications: normalizeSpecObject(product.specifications),
    tagsText: (product.tags || []).join(', '),
    isActive: product.is_active !== false,
  };
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

function formatShortDate(value: string | null | undefined): string {
  if (!value) return 'No date';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCheckInDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function checkInOrderLabel(row: ItemCheckInCatalog): string {
  return row.purchase_order_number?.trim() || (row.purchase_order ? `PO ${row.purchase_order}` : '—');
}

function productPaneIdentityLabel(state: ProductEditorState): string {
  if (!state.productId) return 'NEW';
  const num = state.productNumber?.trim();
  if (num) return num;
  return `#${state.productId}`;
}

function money(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
    : String(value);
}

function StatTooltip({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ p: 0.25, maxWidth: 320 }}>
      {children}
    </Box>
  );
}

function ProductStatCell({
  label,
  value,
  helper,
  mono,
  tone = 'default',
  tooltip,
  onClick,
}: {
  label: string;
  value: string;
  helper?: string;
  mono?: boolean;
  tone?: 'default' | 'good' | 'warning' | 'muted';
  tooltip?: ReactNode;
  onClick?: () => void;
}) {
  const valueColor =
    tone === 'warning'
      ? processingTokens.accentAmber
      : tone === 'good'
        ? processingTokens.primaryDark
        : tone === 'muted'
          ? processingTokens.textMute
          : processingTokens.textStrong;

  const cell = (
    <Box
      sx={{
        flex: '1 1 132px',
        minWidth: 126,
        px: 1.5,
        py: 1,
        border: 1,
        borderColor: borderSubtle,
        borderRadius: 1.5,
        bgcolor: headerSurface,
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.035)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease',
        '&:hover': onClick
          ? {
              borderColor: processingTokens.primary,
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.10)',
              transform: 'translateY(-1px)',
            }
          : undefined,
      }}
      onClick={onClick}
    >
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          color: processingTokens.textMute,
          fontSize: '0.625rem',
          fontWeight: 800,
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          lineHeight: 1.1,
        }}
      >
        {label}
      </Typography>
      <Typography
        noWrap
        sx={{
          mt: 0.45,
          fontSize: '0.9375rem',
          fontWeight: 800,
          lineHeight: 1.2,
          color: valueColor,
          fontFamily: mono ? processingTokens.monoFontFamily : undefined,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Typography>
      {helper ? (
        <Typography
          variant="caption"
          noWrap
          sx={{ display: 'block', mt: 0.25, color: processingTokens.textMute, fontSize: '0.6875rem', lineHeight: 1.15 }}
        >
          {helper}
        </Typography>
      ) : null}
    </Box>
  );

  if (!tooltip) return cell;
  return (
    <Tooltip title={tooltip} enterDelay={400} placement="bottom-start">
      {cell}
    </Tooltip>
  );
}

function editorDraft(state: ProductEditorState): ProductEditorDraft {
  return {
    title: state.title,
    brand: state.brand,
    model: state.model,
    categoryRef: state.categoryRef,
    tagsText: state.tagsText,
    identifiers: state.identifiers,
    specifications: state.specifications,
  };
}

function effectiveEditorState(
  state: ProductEditorState,
  draft: ProductEditorDraft,
  ai: Record<ProductAIFieldName, ProductFieldAI>,
  categories: Category[],
): ProductEditorState {
  return {
    ...state,
    title: displayValueForProductField('title', draft, ai, categories) as string,
    brand: displayValueForProductField('brand', draft, ai, categories) as string,
    model: displayValueForProductField('model', draft, ai, categories) as string,
    categoryRef: displayValueForProductField('categoryRef', draft, ai, categories) as string,
    tagsText: displayValueForProductField('tagsText', draft, ai, categories) as string,
    identifiers: displayValueForProductField('identifiers', draft, ai, categories) as Record<string, string>,
    specifications: displayValueForProductField('specifications', draft, ai, categories) as Record<string, string>,
  };
}

function productStateSignature(state: ProductEditorState): string {
  return JSON.stringify({
    productId: state.productId,
    title: state.title.trim(),
    brand: state.brand.trim(),
    model: state.model.trim(),
    categoryRef: state.categoryRef,
    tags: tagsFromText(state.tagsText),
    identifiers: state.identifiers,
    specifications: state.specifications,
    isActive: state.isActive,
  });
}

function isProductDirty(
  baseline: ProductEditorState,
  state: ProductEditorState,
  draft: ProductEditorDraft,
  ai: Record<ProductAIFieldName, ProductFieldAI>,
  categories: Category[],
): boolean {
  const current = effectiveEditorState(state, draft, ai, categories);
  return productStateSignature(current) !== productStateSignature(baseline);
}

export function ProductManagePanel({
  open,
  initialProduct,
  rowDetailsSeed,
  rowDetailsSeedKey,
  onClose,
  onProductSaved,
  embedded = false,
  onApplyProductSearch,
  onStartProductCheckIn,
  onOpenProductCheckIns,
  onOpenItemsForProduct,
}: ProductManagePanelProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [state, setState] = useState<ProductEditorState>(EMPTY_EDITOR);
  const [baselineState, setBaselineState] = useState<ProductEditorState>(EMPTY_EDITOR);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInProduct, setCheckInProduct] = useState<Product | null>(null);
  const [ai, dispatchAi] = useReducer(productAiReducer, undefined, initialProductAIState);
  const suggestMutation = useAISuggestProduct();
  const hydratedEditorKeyRef = useRef<string | null>(null);
  const appliedCategorySeedRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      hydratedEditorKeyRef.current = null;
      appliedCategorySeedRef.current = null;
      return;
    }
    const hydrateKey =
      initialProduct?.id != null ?
        `product:${initialProduct.id}`
      : `new:${rowDetailsSeedKey ?? 'blank'}`;
    if (hydratedEditorKeyRef.current === hydrateKey) return;
    hydratedEditorKeyRef.current = hydrateKey;
    appliedCategorySeedRef.current = null;
    const next =
      initialProduct ?
        productToEditor(initialProduct)
      : { ...EMPTY_EDITOR, ...(rowDetailsSeed?.draft ?? {}) };
    setState(next);
    setBaselineState(next);
    setConfirmLeaveOpen(false);
    setCheckInOpen(false);
    setCheckInProduct(null);
    dispatchAi({ type: 'reset' });
  }, [open, initialProduct?.id, initialProduct, rowDetailsSeed, rowDetailsSeedKey]);

  const categoriesQuery = useQuery({
    queryKey: ['categories', 'product-manage'],
    queryFn: async () => {
      const { data } = await getCategories({ page_size: 500, ordering: 'name' });
      return data.results ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const usageQuery = useQuery({
    queryKey: ['product-usage', state.productId],
    queryFn: async () => {
      const { data } = await getProductUsage(state.productId as number);
      return data;
    },
    enabled: open && state.productId != null,
  });

  const checkInsQuery = useQuery({
    queryKey: ['item-check-ins', 'product-manage', state.productId],
    queryFn: async () => (
      await getItemCheckIns({ product: state.productId, page_size: 5, ordering: '-created_at' })
    ).data,
    enabled: open && state.productId != null,
    staleTime: 30_000,
  });

  const isEditing = state.productId != null;
  const categories = categoriesQuery.data ?? [];

  useEffect(() => {
    if (!open || initialProduct || !rowDetailsSeed?.categoryName || categories.length === 0) return;
    const seedKey = `${rowDetailsSeedKey ?? 'blank'}:${rowDetailsSeed.categoryName}`;
    if (appliedCategorySeedRef.current === seedKey) return;
    const mapped = mapSuggestedCategoryToCategoryRef(rowDetailsSeed.categoryName, categories);
    if (!mapped.matched) return;
    appliedCategorySeedRef.current = seedKey;
    setState((prev) => ({ ...prev, categoryRef: mapped.categoryRef }));
    setBaselineState((prev) => ({ ...prev, categoryRef: mapped.categoryRef }));
  }, [open, initialProduct, rowDetailsSeed, rowDetailsSeedKey, categories]);

  const draft = editorDraft(state);

  const titleVal = displayValueForProductField('title', draft, ai, categories) as string;
  const brandVal = displayValueForProductField('brand', draft, ai, categories) as string;
  const modelVal = displayValueForProductField('model', draft, ai, categories) as string;
  const categoryRefVal = displayValueForProductField('categoryRef', draft, ai, categories) as string;
  const tagsVal = displayValueForProductField('tagsText', draft, ai, categories) as string;
  const identifiersVal = displayValueForProductField('identifiers', draft, ai, categories) as Record<string, string>;
  const specificationsVal = displayValueForProductField('specifications', draft, ai, categories) as Record<string, string>;

  const isDirty = useMemo(
    () => isProductDirty(baselineState, state, draft, ai, categories),
    [baselineState, state, draft, ai, categories],
  );

  const loadingAi = suggestMutation.isPending;
  const suggestDisabled = loadingAi;
  const canFlipAiSuggestions = hasFlippableAiSuggestions(ai);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: titleVal.trim(),
        brand: brandVal.trim() || 'Generic',
        model: modelVal.trim(),
        category: categoryRefVal ? Number(categoryRefVal) : null,
        identifiers: identifiersVal,
        tags: tagsFromText(tagsVal),
        specifications: specificationsVal,
        is_active: state.isActive,
      };
      if (!payload.title) throw new Error('Title is required.');
      if (!payload.category) throw new Error('Category is required.');
      if (state.productId) {
        const { data } = await updateProduct(state.productId, payload);
        return data;
      }
      const { data } = await createProduct(payload);
      return data;
    },
    onSuccess: async (saved) => {
      const created = state.productId == null;
      enqueueSnackbar(created ? 'Product created.' : 'Product updated.', { variant: 'success' });
      const next = productToEditor(saved);
      setState(next);
      setBaselineState(next);
      dispatchAi({ type: 'reset' });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      onProductSaved?.(saved, { created });
      if (!embedded) onClose();
    },
    onError: (err: unknown) => {
      enqueueSnackbar(err instanceof Error ? err.message : 'Could not save product.', { variant: 'error' });
    },
  });

  const setField = <K extends keyof ProductEditorState>(key: K, value: ProductEditorState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    const aiFieldMap: Partial<Record<keyof ProductEditorState, ProductAIFieldName>> = {
      title: 'title',
      brand: 'brand',
      model: 'model',
      categoryRef: 'categoryRef',
      tagsText: 'tagsText',
      identifiers: 'identifiers',
      specifications: 'specifications',
    };
    const aiField = aiFieldMap[key];
    if (aiField) dispatchAi({ type: 'markEdited', field: aiField });
  };

  const handleCopy = () => {
    setState((prev) => ({
      ...prev,
      productId: null,
      productNumber: '',
      createdAt: '',
      updatedAt: '',
    }));
    dispatchAi({ type: 'reset' });
  };

  const forceClose = () => {
    setConfirmLeaveOpen(false);
    onClose();
  };

  const requestClose = () => {
    if (saveMutation.isPending) return;
    if (checkInOpen) {
      setCheckInOpen(false);
      setCheckInProduct(null);
      return;
    }
    if (isDirty) {
      setConfirmLeaveOpen(true);
      return;
    }
    forceClose();
  };

  const canSaveProduct = Boolean(titleVal.trim() && categoryRefVal) && !saveMutation.isPending;
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    if (!open || checkInOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('[role="listbox"], [role="menu"], .MuiPopover-root')) {
        return;
      }

      if (!panelRef.current?.contains(target)) return;

      if (e.key === 'Escape') {
        if (confirmLeaveOpen) return;
        e.preventDefault();
        requestCloseRef.current();
        return;
      }

      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (confirmLeaveOpen) return;
      if (target.tagName === 'TEXTAREA') return;
      if (target.closest('button')) return;

      const nestedDialog = target.closest('.MuiDialog-root');
      if (nestedDialog && !panelRef.current.contains(nestedDialog)) return;

      if (!canSaveProduct) return;

      e.preventDefault();
      saveMutation.mutate();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, checkInOpen, confirmLeaveOpen, canSaveProduct, saveMutation]);

  const openCheckIn = async () => {
    if (!state.productId) {
      enqueueSnackbar('Save the product first, then check in items.', { variant: 'info' });
      return;
    }
    if (isDirty) {
      enqueueSnackbar('Save product changes before check-in.', { variant: 'warning' });
      return;
    }
    if (embedded && onStartProductCheckIn) {
      onStartProductCheckIn(state.productId);
      return;
    }
    try {
      const { data } = await getProduct(state.productId);
      setCheckInProduct(data);
      setCheckInOpen(true);
    } catch (err: unknown) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Could not load product.', { variant: 'error' });
    }
  };

  const runSuggest = async () => {
    dispatchAi({ type: 'snapshot', draft });
    try {
      const result = await suggestMutation.mutateAsync({
        fields: productAiFieldsToApiFields(PRODUCT_AI_FIELDS),
        context: productDraftToAiContext(draft, categories),
      });
      dispatchAi({ type: 'receive', suggestions: result.suggestions });

      let categoryNote = '';
      if (
        typeof result.suggestions.category === 'string'
        && result.suggestions.category.trim()
      ) {
        const mapped = mapSuggestedCategoryToCategoryRef(String(result.suggestions.category), categories);
        if (!mapped.matched) {
          categoryNote = 'AI category did not match an existing category';
        }
      }

      if (result.low_confidence) {
        const msg = categoryNote
          ? `${categoryNote} — ${result.low_confidence_reason || 'Low confidence suggestions.'}`
          : result.low_confidence_reason || 'Low confidence suggestions.';
        enqueueSnackbar(msg, { variant: 'warning' });
      } else if (categoryNote) {
        enqueueSnackbar(categoryNote, { variant: 'warning' });
      } else {
        enqueueSnackbar(`Suggestions ready (${result.examples_used} store examples).`, { variant: 'success' });
      }
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { error?: string; detail?: unknown } } })?.response?.data;
      const detail =
        typeof data?.detail === 'string'
          ? data.detail
          : Array.isArray(data?.detail)
            ? data.detail.map((x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
            : '';
      const msg =
        (typeof data?.error === 'string' && data.error) ||
        detail ||
        (e instanceof Error ? e.message : '') ||
        'AI request failed';
      enqueueSnackbar(msg, { variant: 'error' });
      dispatchAi({ type: 'reset' });
    }
  };

  const renderAiAdornment = (field: ProductAIFieldName) => {
    const a = ai[field];
    if (!a.suggestion || a.edited) return null;
    const chipSx = {
      cursor: 'pointer',
      height: 22,
      borderColor: `${processingTokens.primary}55`,
      color: processingTokens.primaryDark,
      bgcolor: processingTokens.primarySoft,
      '& .MuiChip-icon': { color: processingTokens.primary },
    };
    return (
      <InputAdornment position="end">
        <Tooltip title={productAiTooltip(field, draft, ai, categories)} placement="top">
          <Chip
            size="small"
            variant="outlined"
            icon={<SwapHoriz sx={{ fontSize: 16 }} />}
            label={a.viewing === 'suggestion' ? 'AI' : 'Orig'}
            onClick={() => dispatchAi({ type: 'flip', field })}
            sx={{
              ...chipSx,
              bgcolor: processingTokens.primarySoftStrong,
              borderColor: processingTokens.primary,
              fontWeight: 600,
            }}
          />
        </Tooltip>
      </InputAdornment>
    );
  };

  const renderJsonAiAdornment = (field: 'identifiers' | 'specifications') => {
    const a = ai[field];
    if (!a.suggestion || a.edited) return null;
    const accent = JSON_ACCENTS[field];
    return (
      <Tooltip title={productAiTooltip(field, draft, ai, categories)} placement="top">
        <Chip
          size="small"
          variant="outlined"
          icon={<SwapHoriz sx={{ fontSize: 14 }} />}
          label={a.viewing === 'suggestion' ? 'AI' : 'Orig'}
          onClick={() => dispatchAi({ type: 'flip', field })}
          sx={{
            cursor: 'pointer',
            height: 20,
            borderColor: accent,
            color: accent,
            bgcolor: `${accent}20`,
            fontWeight: 600,
            '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem' },
            '& .MuiChip-icon': { color: accent },
          }}
        />
      </Tooltip>
    );
  };

  const usage = usageQuery.data;
  const usageLoading = isEditing && usageQuery.isFetching;
  const linkedItemCount = usage?.item_count ?? 0;
  const linkedOrderCount = usage?.order_count ?? 0;
  const hasLinkedItems = isEditing && !usageLoading && (usage?.item_count ?? 0) > 0;
  const onShelfCount = usage?.on_shelf_count ?? 0;
  const soldCount = usage?.sold_count ?? 0;
  const checkIns = checkInsQuery.data?.results ?? [];
  const checkInCount = checkInsQuery.data?.count ?? checkIns.length;
  const latestCheckIn = checkIns[0] ?? null;
  const checkInsLoading = isEditing && checkInsQuery.isFetching;

  const openManageItems = (status?: string) => {
    if (!state.productId) return;
    if (onOpenItemsForProduct) {
      onOpenItemsForProduct(state.productId, status);
      return;
    }
    const filters: Record<string, string | number> = { product: state.productId };
    if (status) filters.status = status;
    navigate(inventoryWorkbenchItemsUrl({ filters }));
  };

  const openProductCheckIns = () => {
    if (!state.productId) return;
    if (onOpenProductCheckIns) {
      onOpenProductCheckIns(state.productId);
      return;
    }
    navigate(inventoryWorkbenchUrl({
      tab: 'checkins',
      q: checkInRichSearch({ product: state.productId }),
    }));
  };

  const ordersTooltip = (
    <StatTooltip>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, mb: 0.5 }}>
        Last orders by order date
      </Typography>
      {(usage?.recent_orders ?? []).length ? usage?.recent_orders?.map((order) => (
        <Typography key={`${order.order_number}-${order.ordered_date}`} variant="caption" sx={{ display: 'block' }}>
          {order.order_number} · {formatShortDate(order.ordered_date)}
        </Typography>
      )) : (
        <Typography variant="caption">No linked orders.</Typography>
      )}
    </StatTooltip>
  );

  const itemsTooltip = (
    <StatTooltip>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, mb: 0.5 }}>
        Items by status
      </Typography>
      {(usage?.status_counts ?? []).length ? usage?.status_counts?.map((row) => (
        <Typography key={row.status || row.label} variant="caption" sx={{ display: 'block' }}>
          {row.label}: {row.count} ({row.pct}%)
        </Typography>
      )) : (
        <Typography variant="caption">No linked items.</Typography>
      )}
    </StatTooltip>
  );

  const onShelfTooltip = (
    <StatTooltip>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, mb: 0.5 }}>
        On shelf by location
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        Total: {onShelfCount}
      </Typography>
      {(usage?.on_shelf_locations ?? []).length ? usage?.on_shelf_locations?.map((row) => (
        <Typography key={row.location} variant="caption" sx={{ display: 'block' }}>
          {row.location}: {row.count} ({row.pct}%)
        </Typography>
      )) : (
        <Typography variant="caption">No on-shelf items.</Typography>
      )}
    </StatTooltip>
  );

  const soldTooltip = (
    <StatTooltip>
      <Typography variant="caption" sx={{ display: 'block' }}>
        Avg cost: {money(usage?.avg_cost)}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        Avg profit: {money(usage?.avg_profit)}
      </Typography>
    </StatTooltip>
  );

  const checkInsTooltip = (
    <StatTooltip>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, mb: 0.5 }}>
        Recent check-ins
      </Typography>
      {checkIns.length ?
        checkIns.map((row) => (
          <Typography key={row.id} variant="caption" sx={{ display: 'block' }}>
            #{row.id} · {formatCheckInDateTime(row.created_at)} · {checkInOrderLabel(row)}
          </Typography>
        ))
      : <Typography variant="caption">No check-ins yet.</Typography>}
    </StatTooltip>
  );

  const editorBody = (
    <>
      <DialogTitle
        sx={{
          p: 0,
          bgcolor: headerSurface,
          borderBottom: 1,
          borderColor: borderSubtle,
        }}
      >
        <Box
          sx={{
            px: 2.75,
            pt: 1.75,
            pb: 1.25,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" component="span" sx={{ display: 'block', fontWeight: 800, color: processingTokens.textStrong, lineHeight: 1.2 }}>
              {isEditing ? 'Edit product details' : 'Create product details'}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.35, color: processingTokens.textMute }}>
              {isEditing ?
                'Edit the product details below. Enter saves · Esc cancels.'
              : 'Fill in the product details below, then save to create. Enter saves · Esc cancels.'}
            </Typography>
          </Box>
          <WorkbenchCopyableChip
            size="small"
            label={productPaneIdentityLabel(state)}
            copyText={isEditing ? productPaneIdentityLabel(state) : undefined}
            variant={isEditing ? 'outlined' : 'filled'}
            color={isEditing ? 'default' : 'primary'}
            clickable={isEditing && Boolean(state.productId)}
            onBadgeClick={
              isEditing && onApplyProductSearch && state.productId ?
                () => onApplyProductSearch(state.productId!)
              : undefined
            }
            sx={{
              height: 22,
              fontFamily: processingTokens.monoFontFamily,
              fontWeight: 800,
              fontSize: '0.72rem',
              letterSpacing: 0.4,
              ...(isEditing
                ? { borderColor: borderSubtle, color: processingTokens.textSoft, bgcolor: headerSubtle }
                : {}),
            }}
          />
        </Box>

        <Box
          sx={{
            display: 'flex',
            width: '100%',
            overflowX: 'auto',
            bgcolor: headerSubtle,
            color: processingTokens.statsHeaderText,
            borderTop: 1,
            borderColor: borderSubtle,
            px: 1.25,
            py: 1,
            gap: 0.75,
          }}
        >
          <ProductStatCell
            label="# Orders"
            value={usageLoading ? '...' : formatNumber(linkedOrderCount)}
            helper="Linked POs"
            tone={linkedOrderCount ? 'default' : 'muted'}
            tooltip={ordersTooltip}
          />
          <ProductStatCell
            label="# Check-ins"
            value={checkInsLoading ? '...' : formatNumber(checkInCount)}
            helper={latestCheckIn ?
              `#${formatNumber(latestCheckIn.id)} · ${formatCheckInDateTime(latestCheckIn.created_at)}`
            : checkInCount ? 'Click to view'
            : 'No check-ins yet'}
            tone={checkInCount ? 'default' : 'muted'}
            tooltip={checkInsTooltip}
            onClick={isEditing ? openProductCheckIns : undefined}
          />
          <ProductStatCell
            label="# Items"
            value={usageLoading ? '...' : formatNumber(linkedItemCount)}
            helper="Click to view"
            tone={hasLinkedItems ? 'warning' : 'default'}
            tooltip={itemsTooltip}
            onClick={isEditing ? () => openManageItems() : undefined}
          />
          <ProductStatCell
            label="On Shelf"
            value={usageLoading ? '...' : formatNumber(onShelfCount)}
            helper="Click to view"
            tone={onShelfCount ? 'good' : 'muted'}
            tooltip={onShelfTooltip}
            onClick={isEditing ? () => openManageItems('on_shelf') : undefined}
          />
          <ProductStatCell
            label="# Sold"
            value={usageLoading ? '...' : `${formatNumber(soldCount)} (${money(usage?.avg_sold_price)})`}
            helper="Click to view"
            tone={soldCount ? 'default' : 'muted'}
            tooltip={soldTooltip}
            onClick={isEditing ? () => openManageItems('sold') : undefined}
          />
        </Box>
      </DialogTitle>

      <DialogContent
        sx={{
          pt: 0,
          pb: 1.75,
          px: 2.75,
          overflow: 'hidden',
          bgcolor: editorSurface,
          '&.MuiDialogContent-root': {
            paddingTop: '18px',
          },
        }}
      >
        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mb: 1.25 }}
        >
          <Button
            size="small"
            variant="outlined"
            startIcon={<ContentCopyOutlinedIcon />}
            onClick={handleCopy}
            disabled={!state.title.trim() && !state.productId}
            sx={{
              borderColor: `${processingTokens.ecoBrown}88`,
              color: processingTokens.ecoBrownDark,
              bgcolor: '#fff',
              flexShrink: 0,
              '&:hover': { borderColor: processingTokens.ecoBrown, bgcolor: processingTokens.ecoBrownSoft },
            }}
          >
            Duplicate
          </Button>
          <Box sx={{ flex: 1, minWidth: 8 }} />
          <Button
            size="small"
            variant="outlined"
            startIcon={loadingAi ? <CircularProgress size={14} /> : <AutoAwesome sx={{ fontSize: 16 }} />}
            disabled={suggestDisabled}
            onClick={() => void runSuggest()}
            sx={{
              minWidth: 108,
              borderColor: `${processingTokens.primary}66`,
              color: processingTokens.primaryDark,
              bgcolor: processingTokens.primarySoft,
              fontWeight: 700,
              '&:hover': { borderColor: processingTokens.primary, bgcolor: processingTokens.primarySoftStrong },
            }}
          >
            Suggest
          </Button>
          <Tooltip title="Show original values for all suggested fields">
            <span>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                disabled={!canFlipAiSuggestions}
                onClick={() => dispatchAi({ type: 'viewAll', viewing: 'original' })}
                sx={{ minWidth: 0, px: 1.1, borderColor: borderSubtle, bgcolor: '#fff', color: processingTokens.textSoft }}
              >
                Original
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Show AI values for all suggested fields">
            <span>
              <Button
                size="small"
                variant="outlined"
                disabled={!canFlipAiSuggestions}
                onClick={() => dispatchAi({ type: 'viewAll', viewing: 'suggestion' })}
                sx={{
                  minWidth: 0,
                  px: 1.1,
                  borderColor: `${processingTokens.primary}66`,
                  color: processingTokens.primaryDark,
                  bgcolor: '#fff',
                  '&:hover': { borderColor: processingTokens.primary, bgcolor: processingTokens.primarySoftStrong },
                }}
              >
                AI values
              </Button>
            </span>
          </Tooltip>
        </Stack>
        <Box
          sx={{
            p: 2,
            border: 1,
            borderColor: borderSubtle,
            borderRadius: 2,
            bgcolor: headerSurface,
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
          }}
        >
          <Box sx={formGridSx}>
          <TextField
            size="small"
            label="Title"
            required
            fullWidth
            value={titleVal}
            onChange={(e) => setField('title', e.target.value)}
            sx={{
              gridColumn: '1 / -1',
              ...aiFieldSx('identity', productSuggestionActive('title', ai)),
            }}
            slotProps={{ input: { endAdornment: renderAiAdornment('title') } }}
          />
          <TextField
            size="small"
            label="Brand"
            required
            fullWidth
            value={brandVal}
            onChange={(e) => setField('brand', e.target.value)}
            sx={aiFieldSx('identity', productSuggestionActive('brand', ai))}
            slotProps={{ input: { endAdornment: renderAiAdornment('brand') } }}
          />
          <TextField
            size="small"
            label="Model"
            fullWidth
            value={modelVal}
            onChange={(e) => setField('model', e.target.value)}
            sx={aiFieldSx('identity', productSuggestionActive('model', ai))}
            slotProps={{ input: { endAdornment: renderAiAdornment('model') } }}
          />
          <TextField
            select
            size="small"
            label="Category"
            fullWidth
            value={categoryRefVal}
            onChange={(e) => setField('categoryRef', e.target.value)}
            sx={aiFieldSx('catalog', productSuggestionActive('categoryRef', ai))}
            slotProps={{ input: { endAdornment: renderAiAdornment('categoryRef') } }}
          >
            <MenuItem value="">Select category</MenuItem>
            {categories.map((cat) => (
              <MenuItem key={cat.id} value={String(cat.id)}>
                {categoryLabel(cat)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Tags"
            fullWidth
            value={tagsVal}
            onChange={(e) => setField('tagsText', e.target.value)}
            placeholder="remote, lego, vintage"
            sx={aiFieldSx('tracking', productSuggestionActive('tagsText', ai))}
            slotProps={{ input: { endAdornment: renderAiAdornment('tagsText') } }}
          />
          <KeyValueJsonField
            compact
            label="Identifiers"
            value={identifiersVal}
            onChange={(next) => setField('identifiers', next)}
            presetKeys={IDENTIFIER_PRESET_KEYS}
            presetKeyLabels={IDENTIFIER_KEY_LABELS}
            emptySummary="No identifiers"
            mode="identifiers"
            accentColor={JSON_ACCENTS.identifiers}
            softBg={productSuggestionActive('identifiers', ai) ? '#eef5fc' : '#fff'}
            endAdornment={renderJsonAiAdornment('identifiers')}
          />
          <KeyValueJsonField
            compact
            label="Specifications"
            value={specificationsVal}
            onChange={(next) => setField('specifications', next)}
            emptySummary="No specifications"
            mode="specifications"
            accentColor={JSON_ACCENTS.specifications}
            softBg={productSuggestionActive('specifications', ai) ? '#f3f0fa' : '#fff'}
            endAdornment={renderJsonAiAdornment('specifications')}
          />
          </Box>
        </Box>
      </DialogContent>

      <Divider />

      <DialogActions
        sx={{
          px: 2.75,
          py: 1.15,
          bgcolor: headerSurface,
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: 1,
          borderColor: borderSubtle,
        }}
      >
        <Tooltip
          title={state.isActive ? 'Active — open for new item links' : 'Inactive — hidden from new assignments'}
          placement="top"
        >
          <FormControlLabel
            sx={{
              m: 0,
              ml: -0.5,
              '& .MuiFormControlLabel-label': { fontSize: '0.8125rem', color: processingTokens.textSoft, fontWeight: 600 },
            }}
            control={
              <Switch
                size="small"
                checked={state.isActive}
                onChange={(e) => setField('isActive', e.target.checked)}
              />
            }
            label={state.isActive ? 'Active' : 'Inactive'}
          />
        </Tooltip>
        <Stack direction="row" spacing={0.75} alignItems="center">
          {isEditing ?
            <Button
              size="small"
              variant="outlined"
              startIcon={<Inventory2OutlinedIcon />}
              disabled={saveMutation.isPending || isDirty}
              onClick={() => void openCheckIn()}
              sx={{ borderColor: borderSubtle, color: processingTokens.textSoft, bgcolor: '#fff' }}
            >
              Check in items
            </Button>
          : null}
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            onClick={requestClose}
            disabled={saveMutation.isPending}
            sx={{ borderColor: borderSubtle, color: processingTokens.textSoft, bgcolor: '#fff' }}
          >
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<SaveOutlinedIcon />}
            disabled={saveMutation.isPending || !titleVal.trim() || !categoryRefVal}
            onClick={() => saveMutation.mutate()}
            sx={{
              bgcolor: processingTokens.primary,
              '&:hover': { bgcolor: processingTokens.primaryDark },
              boxShadow: '0 2px 8px rgba(46, 125, 50, 0.22)',
              fontWeight: 800,
            }}
          >
            {isEditing ? 'Save product' : 'Create product'}
          </Button>
        </Stack>
      </DialogActions>
    </>
  );

  const editorSurfaceNode = embedded ? (
    <Box
      ref={panelRef}
      sx={{
        height: '100%',
        minHeight: 0,
        display: open && !checkInOpen ? 'flex' : 'none',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: editorSurface,
      }}
    >
      {editorBody}
    </Box>
  ) : (
    <Dialog
      open={open && !checkInOpen}
      onClose={requestClose}
      fullWidth
      maxWidth="lg"
      PaperProps={{
        ref: panelRef,
        sx: {
          borderRadius: 3,
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          bgcolor: editorSurface,
          boxShadow: '0 18px 60px rgba(15, 23, 42, 0.22)',
        },
      }}
    >
      {editorBody}
    </Dialog>
  );

  return (
    <>
    {editorSurfaceNode}

    <ConfirmDialog
      open={confirmLeaveOpen}
      title="Leave without saving?"
      message="You have unsaved changes. Close anyway and discard them?"
      confirmLabel="Leave"
      cancelLabel="Stay"
      severity="warning"
      onConfirm={forceClose}
      onCancel={() => setConfirmLeaveOpen(false)}
    />

    {checkInProduct ?
      <ProductCheckInDialog
        open={checkInOpen}
        product={checkInProduct}
        onClose={() => {
          setCheckInOpen(false);
          setCheckInProduct(null);
        }}
        onOpenProduct={() => {
          setCheckInOpen(false);
        }}
      />
    : null}
    </>
  );
}
