import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Grid,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { alpha, type Theme } from '@mui/material/styles';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import SwapHoriz from '@mui/icons-material/SwapHoriz';
import { useSnackbar } from 'notistack';
import { createConsignmentItem } from '../../api/consignment.api';
import { useDevLogConfig } from '../../hooks/useDevLog';
import {
  useAISuggestItem,
  useCreateItem,
  usePurchaseOrder,
  usePurchaseOrders,
  useUpdateItem,
} from '../../hooks/useInventory';
import { devLog } from '../../utils/logger';
import { postDevLogLine } from '../../api/core.api';
import { useAgreement, useAgreements } from '../../hooks/useConsignment';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { ConfirmDialog } from '../common/ConfirmDialog';
import ItemHeroStats from './ItemHeroStats';
import {
  formatConditionLabel,
  formatItemSourceLabel,
  ITEM_CONDITIONS,
  ITEM_SOURCES,
} from '../../constants/inventory.constants';
import {
  isTaxonomyV1CategoryName,
  MIXED_LOTS_UNCATEGORIZED,
  TAXONOMY_V1_CATEGORY_NAMES,
} from '../../constants/taxonomyV1';
import { localPrintService } from '../../services/localPrintService';
import type {
  Item,
  ItemCondition,
  ItemSource,
  PurchaseOrder,
  PurchaseOrderListRow,
} from '../../types/inventory.types';
import type { ConsignmentAgreement } from '../../types/consignment.types';

const LS_PRINT_ON_SAVE = 'addItem.printOnSave';
const LS_KEEP_OPEN = 'addItem.keepOpen';

function readBoolLS(key: string, defaultVal: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return defaultVal;
    return v === 'true' || v === '1';
  } catch {
    return defaultVal;
  }
}

export const ITEM_DRAWER_FORM_ID = 'item-form-drawer';

export type ItemFormProps = {
  mode: 'create' | 'edit';
  /** Required when mode is edit; when null/undefined while loading, form is empty. */
  item?: Item | null;
  /** After create (always). Pass { keepOpen } so parent can leave drawer open. */
  onItemCreated?: (item: Item, ctx: { keepOpen: boolean }) => void;
  onItemUpdated?: (item: Item) => void;
  onCloseAfterCreate?: () => void;
  onPendingChange?: (pending: boolean) => void;
  /** For footer inventory stats (product / category / global). */
  onStatsContext?: (ctx: { productId: number | null; category: string | null }) => void;
  /** Renders beside AI pills with a vertical divider on md+ (e.g. ItemStatsPanel). */
  inventoryStatsSlot?: ReactNode;
};

type AIFieldName =
  | 'title'
  | 'brand'
  | 'category'
  | 'condition'
  | 'price'
  | 'specifications'
  | 'notes';

type FieldAI = {
  enabled: boolean;
  baseline: string;
  suggestion: string | null;
  viewing: 'original' | 'suggestion';
  edited: boolean;
};

const AI_FIELDS: AIFieldName[] = [
  'title',
  'brand',
  'category',
  'condition',
  'price',
  'specifications',
  'notes',
];

function emptyFieldAI(): FieldAI {
  return {
    enabled: true,
    baseline: '',
    suggestion: null,
    viewing: 'original',
    edited: false,
  };
}

function initialAIState(): Record<AIFieldName, FieldAI> {
  return {
    title: emptyFieldAI(),
    brand: emptyFieldAI(),
    category: emptyFieldAI(),
    condition: emptyFieldAI(),
    price: emptyFieldAI(),
    specifications: emptyFieldAI(),
    notes: emptyFieldAI(),
  };
}

type AIAction =
  | { type: 'toggle'; field: AIFieldName }
  | { type: 'all'; enabled: boolean }
  | { type: 'snapshot'; draft: Record<string, string> }
  | { type: 'receive'; suggestions: Record<string, unknown> }
  | { type: 'flip'; field: AIFieldName }
  | { type: 'markEdited'; field: AIFieldName }
  | { type: 'reset' };

function aiReducer(state: Record<AIFieldName, FieldAI>, action: AIAction): Record<AIFieldName, FieldAI> {
  switch (action.type) {
    case 'toggle': {
      const f = action.field;
      return { ...state, [f]: { ...state[f], enabled: !state[f].enabled } };
    }
    case 'all': {
      const next = { ...state };
      for (const k of AI_FIELDS) {
        next[k] = { ...next[k], enabled: action.enabled };
      }
      return next;
    }
    case 'snapshot': {
      const next = { ...state };
      for (const k of AI_FIELDS) {
        if (!next[k].enabled) continue;
        next[k] = {
          ...next[k],
          baseline: action.draft[k] ?? '',
          edited: false,
          suggestion: null,
          viewing: 'original',
        };
      }
      return next;
    }
    case 'receive': {
      const next = { ...state };
      const sug = action.suggestions;
      for (const k of AI_FIELDS) {
        if (!next[k].enabled) continue;
        if (!(k in sug) || sug[k] === undefined) continue;
        let s: string;
        if (k === 'specifications' && typeof sug[k] === 'object' && sug[k] !== null) {
          try {
            s = JSON.stringify(sug[k], null, 2);
          } catch {
            s = String(sug[k]);
          }
        } else {
          s = String(sug[k] ?? '');
        }
        if (k === 'category' && !isTaxonomyV1CategoryName(s)) {
          s = MIXED_LOTS_UNCATEGORIZED;
        }
        next[k] = {
          ...next[k],
          suggestion: s,
          viewing: 'suggestion',
          edited: false,
        };
      }
      return next;
    }
    case 'flip': {
      const f = action.field;
      const cur = state[f];
      if (!cur.suggestion) return state;
      const viewing = cur.viewing === 'original' ? 'suggestion' : 'original';
      return { ...state, [f]: { ...cur, viewing } };
    }
    case 'markEdited': {
      const f = action.field;
      return { ...state, [f]: { ...state[f], edited: true, viewing: 'original', suggestion: null } };
    }
    case 'reset':
      return initialAIState();
    default:
      return state;
  }
}

function parseSpecificationsInput(raw: string): Record<string, unknown> {
  const t = raw.trim();
  if (!t) return {};
  try {
    const o = JSON.parse(t) as unknown;
    return typeof o === 'object' && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function draftToContext(draft: {
  title: string;
  brand: string;
  category: string;
  condition: ItemCondition;
  price: string;
  specifications: string;
  notes: string;
}): Record<string, string> {
  return {
    title: draft.title,
    brand: draft.brand,
    category: draft.category,
    condition: draft.condition,
    price: draft.price,
    specifications: draft.specifications,
    notes: draft.notes,
  };
}

type DraftState = {
  title: string;
  brand: string;
  category: string;
  condition: ItemCondition;
  price: string;
  specifications: string;
  notes: string;
};

function displayForField(field: AIFieldName, d: DraftState, aiState: Record<AIFieldName, FieldAI>): string {
  const a = aiState[field];
  const draftVal =
    field === 'title'
      ? d.title
      : field === 'brand'
        ? d.brand
        : field === 'category'
          ? d.category
          : field === 'condition'
            ? d.condition
            : field === 'price'
              ? d.price
            : field === 'specifications'
              ? d.specifications
              : d.notes;
  if (a.edited || !a.suggestion) return draftVal;
  if (a.viewing === 'suggestion') return a.suggestion;
  return a.baseline !== '' ? a.baseline : draftVal;
}

export default function ItemForm({
  mode,
  item,
  onItemCreated,
  onItemUpdated,
  onCloseAfterCreate,
  onPendingChange,
  onStatsContext,
  inventoryStatsSlot,
}: ItemFormProps) {
  const { enqueueSnackbar } = useSnackbar();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const suggestMutation = useAISuggestItem();
  const { data: devLogCfg } = useDevLogConfig();

  const viteDevLog =
    import.meta.env.VITE_DEV_LOG === 'true' || import.meta.env.VITE_DEV_LOG === '1';

  const logAddItemForm = useCallback(
    (message: string) => {
      const targets = devLogCfg?.areas?.LOG_ADD_ITEM_FORM ?? [];
      if (targets.includes('browser') && viteDevLog) {
        devLog.log('[add_item_form]', message);
      }
      if (targets.includes('file')) {
        void postDevLogLine({ area: 'LOG_ADD_ITEM_FORM', message }).catch(() => {});
      }
    },
    [devLogCfg?.areas, viteDevLog],
  );

  useEffect(() => {
    logAddItemForm(`item form mounted; mode=${mode}`);
  }, [mode, logAddItemForm]);

  const [draft, setDraft] = useState({
    title: '',
    brand: 'Generic',
    category: '',
    condition: 'unknown' as ItemCondition,
    price: '',
    retail_value: '',
    source: 'purchased' as ItemSource,
    specifications: '',
    notes: '',
    purchaseOrderId: null as number | null,
    agreementId: null as number | null,
    location: '',
  });

  const [ai, dispatchAi] = useReducer(aiReducer, initialAIState());
  const [pendingRefusal, setPendingRefusal] = useState<{
    suggestions: Record<string, unknown>;
    reason: string;
  } | null>(null);

  useEffect(() => {
    if (mode !== 'edit' || !item) return;
    setDraft({
      title: item.title,
      brand: item.brand ?? '',
      category: item.category,
      condition: item.condition,
      price: item.price,
      retail_value: item.retail_value ?? '',
      source: item.source,
      specifications:
        item.specifications && Object.keys(item.specifications).length > 0
          ? JSON.stringify(item.specifications, null, 2)
          : '',
      notes: item.notes ?? '',
      purchaseOrderId: item.purchase_order,
      agreementId: null,
      location: item.location ?? '',
    });
    dispatchAi({ type: 'reset' });
  }, [mode, item?.id, item?.updated_at]);

  const [printOnSave, setPrintOnSave] = useState(() => readBoolLS(LS_PRINT_ON_SAVE, false));
  const [keepOpen, setKeepOpen] = useState(() => readBoolLS(LS_KEEP_OPEN, false));
  const [poSearchInput, setPoSearchInput] = useState('');
  const [agreementSearchInput, setAgreementSearchInput] = useState('');
  const debouncedPoSearch = useDebouncedValue(poSearchInput, 300);
  const debouncedAgreementSearch = useDebouncedValue(agreementSearchInput, 300);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      localStorage.setItem(LS_PRINT_ON_SAVE, String(printOnSave));
    } catch {
      /* ignore */
    }
  }, [printOnSave]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEEP_OPEN, String(keepOpen));
    } catch {
      /* ignore */
    }
  }, [keepOpen]);

  useEffect(() => {
    onPendingChange?.(createItem.isPending || updateItem.isPending);
  }, [createItem.isPending, updateItem.isPending, onPendingChange]);

  useEffect(() => {
    onStatsContext?.({
      productId: mode === 'edit' && item ? item.product ?? null : null,
      category: draft.category?.trim() || null,
    });
  }, [mode, item?.id, item?.product, draft.category, onStatsContext]);

  const { data: ordersData } = usePurchaseOrders(
    {
      page_size: 20,
      ...(debouncedPoSearch.trim() ? { search: debouncedPoSearch.trim() } : {}),
    },
    { enabled: mode === 'create' && draft.source === 'purchased' },
  );
  const { data: selectedPoDetail } = usePurchaseOrder(draft.purchaseOrderId);

  const purchaseOrders: (PurchaseOrderListRow | PurchaseOrder)[] = useMemo(() => {
    const list = ordersData?.results ?? [];
    const id = draft.purchaseOrderId;
    if (!id || !selectedPoDetail) return list;
    if (list.some((o) => o.id === id)) return list;
    return [selectedPoDetail, ...list];
  }, [ordersData?.results, draft.purchaseOrderId, selectedPoDetail]);

  const { data: agreementsData } = useAgreements(
    {
      page_size: 20,
      ...(debouncedAgreementSearch.trim() ? { search: debouncedAgreementSearch.trim() } : {}),
    },
    { enabled: mode === 'create' && draft.source === 'consignment' },
  );
  const { data: selectedAgreementDetail } = useAgreement(draft.agreementId);

  const agreements: ConsignmentAgreement[] = useMemo(() => {
    const list = agreementsData?.results ?? [];
    const id = draft.agreementId;
    if (!id || !selectedAgreementDetail) return list;
    if (list.some((a) => a.id === id)) return list;
    return [selectedAgreementDetail, ...list];
  }, [agreementsData?.results, draft.agreementId, selectedAgreementDetail]);

  useEffect(() => {
    setPoSearchInput('');
    setAgreementSearchInput('');
  }, [draft.source]);

  const resetForm = useCallback(() => {
    setDraft({
      title: '',
      brand: 'Generic',
      category: '',
      condition: 'unknown',
      price: '',
      retail_value: '',
      source: 'purchased',
      specifications: '',
      notes: '',
      purchaseOrderId: null,
      agreementId: null,
      location: '',
    });
    setPoSearchInput('');
    setAgreementSearchInput('');
    setFieldErrors({});
    dispatchAi({ type: 'reset' });
  }, []);

  const ctx = useMemo(() => draftToContext(draft), [draft]);

  const runSuggest = async () => {
    const fields = AI_FIELDS.filter((f) => ai[f].enabled);
    if (fields.length === 0) {
      enqueueSnackbar('Enable at least one field for AI assist.', { variant: 'warning' });
      return;
    }
    logAddItemForm(`Generate clicked; fields=${fields.join(',')}`);
    dispatchAi({
      type: 'snapshot',
      draft: {
        title: draft.title,
        brand: draft.brand,
        category: draft.category,
        condition: draft.condition,
        price: draft.price,
        specifications: draft.specifications,
        notes: draft.notes,
      },
    });
    try {
      const result = await suggestMutation.mutateAsync({
        fields,
        context: ctx,
      });
      logAddItemForm(
        `AI suggest succeeded; low_confidence=${result.low_confidence} examples_used=${result.examples_used} timing=${JSON.stringify(result.timing ?? {})}`,
      );
      if (result.low_confidence) {
        logAddItemForm(`AI flagged low confidence: ${result.low_confidence_reason}`);
        setPendingRefusal({
          suggestions: result.suggestions,
          reason: result.low_confidence_reason || 'AI had very low confidence in these suggestions.',
        });
      } else {
        dispatchAi({ type: 'receive', suggestions: result.suggestions });
        enqueueSnackbar(
          `Suggestions ready (${result.examples_used} store examples).`,
          { variant: 'success' },
        );
      }
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { error?: string; detail?: unknown } } })?.response
        ?.data;
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
      logAddItemForm(`AI suggest failed: ${msg}`);
      enqueueSnackbar(msg, { variant: 'error' });
    }
  };

  const setDraftField = (key: keyof typeof draft, value: string | ItemSource | ItemCondition | number | null) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const onFieldChange = (field: AIFieldName, value: string) => {
    setDraft((d) => {
      switch (field) {
        case 'title':
          return { ...d, title: value };
        case 'brand':
          return { ...d, brand: value };
        case 'category':
          return { ...d, category: value };
        case 'condition':
          return { ...d, condition: value as ItemCondition };
        case 'price':
          return { ...d, price: value };
        case 'specifications':
          return { ...d, specifications: value };
        case 'notes':
          return { ...d, notes: value };
        default:
          return d;
      }
    });
    const a = ai[field];
    if (a.suggestion && !a.edited && a.viewing === 'suggestion') {
      dispatchAi({ type: 'markEdited', field });
    }
  };

  const handleCreate = async () => {
    if (mode !== 'create') return;
    const ds: DraftState = {
      title: draft.title,
      brand: draft.brand,
      category: draft.category,
      condition: draft.condition,
      price: draft.price,
      specifications: draft.specifications,
      notes: draft.notes,
    };
    const titleForSubmit = displayForField('title', ds, ai).trim();

    logAddItemForm(`create item submit; source=${draft.source} sku_pending=true`);

    const resolvedTitle =
      ai.title.suggestion && !ai.title.edited && ai.title.viewing === 'suggestion'
        ? ai.title.suggestion
        : draft.title;
    const resolvedBrand =
      ai.brand.suggestion && !ai.brand.edited && ai.brand.viewing === 'suggestion'
        ? ai.brand.suggestion
        : draft.brand;
    const resolvedCategory =
      ai.category.suggestion && !ai.category.edited && ai.category.viewing === 'suggestion'
        ? ai.category.suggestion
        : draft.category;
    const resolvedCondition = (() => {
      const a = ai.condition;
      if (a.suggestion && !a.edited && a.viewing === 'suggestion' && a.suggestion) {
        return a.suggestion as ItemCondition;
      }
      return draft.condition;
    })();
    const resolvedSpecsStr =
      ai.specifications.suggestion &&
      !ai.specifications.edited &&
      ai.specifications.viewing === 'suggestion'
        ? ai.specifications.suggestion
        : draft.specifications;
    const resolvedNotes =
      ai.notes.suggestion && !ai.notes.edited && ai.notes.viewing === 'suggestion'
        ? ai.notes.suggestion
        : draft.notes;
    const resolvedPrice =
      ai.price.suggestion && !ai.price.edited && ai.price.viewing === 'suggestion'
        ? ai.price.suggestion
        : draft.price;

    const brandFinal = resolvedBrand.trim() || 'Generic';
    const catTrim = resolvedCategory.trim();
    const retailTrim = draft.retail_value.trim();

    const moneyOk = (s: string) => {
      if (!s.trim()) return false;
      const n = Number(s);
      return Number.isFinite(n) && n >= 0;
    };

    const errs: Record<string, string> = {};
    if (!titleForSubmit) errs.title = 'Title is required';
    if (!catTrim || !isTaxonomyV1CategoryName(catTrim)) errs.category = 'Choose a category';
    if (!moneyOk(retailTrim)) errs.retail_value = 'Enter a valid retail / MSRP';
    if (!moneyOk(resolvedPrice)) errs.price = 'Enter a valid price';
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      enqueueSnackbar('Fix the highlighted fields to continue.', { variant: 'warning' });
      return;
    }
    setFieldErrors({});

    const resolvedSpecsObj = parseSpecificationsInput(resolvedSpecsStr);

    const payload: Record<string, unknown> = {
      title: resolvedTitle,
      brand: brandFinal,
      category: catTrim,
      price: resolvedPrice || '0',
      retail_value: retailTrim,
      source: draft.source,
      condition: resolvedCondition,
      specifications: resolvedSpecsObj,
      notes: resolvedNotes,
    };
    if (draft.source === 'purchased' && draft.purchaseOrderId) {
      payload.purchase_order = draft.purchaseOrderId;
    }

    try {
      const item = await createItem.mutateAsync(payload);
      if (draft.source === 'consignment' && draft.agreementId && item.id) {
        const price = resolvedPrice || '0';
        await createConsignmentItem({
          agreement: draft.agreementId,
          item: item.id,
          asking_price: price,
          listed_price: price,
          received_at: new Date().toISOString(),
          status: 'pending_intake',
        });
      }

      onItemCreated?.(item, { keepOpen });

      if (printOnSave) {
        const ok = await localPrintService
          .printLabel({
            qr_data: item.sku,
            text: `$${Number(item.price).toFixed(2)}`,
            product_title: item.title,
            product_brand: item.brand?.trim() || undefined,
            product_model: item.product_number?.trim() || undefined,
            include_text: true,
          })
          .then(() => true)
          .catch(() => false);
        if (!ok) {
          enqueueSnackbar('Print server may be offline', { variant: 'warning' });
        }
      }

      if (keepOpen) {
        enqueueSnackbar(`Created ${item.sku}`, { variant: 'success' });
        resetForm();
        return;
      }

      enqueueSnackbar('Item created', { variant: 'success' });
      resetForm();
      onCloseAfterCreate?.();
    } catch {
      enqueueSnackbar('Failed to create item', { variant: 'error' });
    }
  };

  const handleUpdate = async () => {
    if (mode !== 'edit' || !item?.id) return;
    const ds: DraftState = {
      title: draft.title,
      brand: draft.brand,
      category: draft.category,
      condition: draft.condition,
      price: draft.price,
      specifications: draft.specifications,
      notes: draft.notes,
    };
    const titleForSubmit = displayForField('title', ds, ai).trim();
    if (!titleForSubmit) {
      enqueueSnackbar('Title is required', { variant: 'warning' });
      return;
    }

    const resolvedTitle =
      ai.title.suggestion && !ai.title.edited && ai.title.viewing === 'suggestion'
        ? ai.title.suggestion
        : draft.title;
    const resolvedBrand =
      ai.brand.suggestion && !ai.brand.edited && ai.brand.viewing === 'suggestion'
        ? ai.brand.suggestion
        : draft.brand;
    const resolvedCategory =
      ai.category.suggestion && !ai.category.edited && ai.category.viewing === 'suggestion'
        ? ai.category.suggestion
        : draft.category;
    const resolvedCondition = (() => {
      const a = ai.condition;
      if (a.suggestion && !a.edited && a.viewing === 'suggestion' && a.suggestion) {
        return a.suggestion as ItemCondition;
      }
      return draft.condition;
    })();
    const resolvedSpecsStr =
      ai.specifications.suggestion &&
      !ai.specifications.edited &&
      ai.specifications.viewing === 'suggestion'
        ? ai.specifications.suggestion
        : draft.specifications;
    const resolvedNotes =
      ai.notes.suggestion && !ai.notes.edited && ai.notes.viewing === 'suggestion'
        ? ai.notes.suggestion
        : draft.notes;
    const resolvedPrice =
      ai.price.suggestion && !ai.price.edited && ai.price.viewing === 'suggestion'
        ? ai.price.suggestion
        : draft.price;

    let specifications: Record<string, unknown> = {};
    if (resolvedSpecsStr.trim()) {
      try {
        const parsed = JSON.parse(resolvedSpecsStr) as unknown;
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          enqueueSnackbar('Specifications must be a JSON object.', { variant: 'warning' });
          return;
        }
        specifications = parsed as Record<string, unknown>;
      } catch {
        enqueueSnackbar('Specifications must be valid JSON.', { variant: 'warning' });
        return;
      }
    }

    try {
      const updated = await updateItem.mutateAsync({
        id: item.id,
        data: {
          title: resolvedTitle,
          brand: resolvedBrand.trim() || 'Generic',
          category: resolvedCategory,
          condition: resolvedCondition,
          price: resolvedPrice || '0',
          retail_value: draft.retail_value.trim() || undefined,
          source: draft.source,
          specifications,
          notes: resolvedNotes,
          location: draft.location,
        },
      });
      enqueueSnackbar('Item updated', { variant: 'success' });
      onItemUpdated?.(updated);
    } catch {
      enqueueSnackbar('Failed to update item', { variant: 'error' });
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'create') void handleCreate();
    else void handleUpdate();
  };

  const loadingAi = suggestMutation.isPending;

  const renderAiAdornment = (field: AIFieldName) => {
    const a = ai[field];
    if (loadingAi && a.enabled) {
      return (
        <InputAdornment position="end">
          <CircularProgress size={16} />
        </InputAdornment>
      );
    }
    if (a.suggestion && !a.edited) {
      return (
        <InputAdornment position="end">
          <Chip
            size="small"
            icon={<SwapHoriz sx={{ fontSize: 16 }} />}
            label={a.viewing === 'suggestion' ? 'AI' : 'Orig'}
            onClick={() => dispatchAi({ type: 'flip', field })}
            sx={{ cursor: 'pointer' }}
          />
        </InputAdornment>
      );
    }
    return (
      <InputAdornment position="end">
        <Chip
          size="small"
          label="AI"
          color={a.enabled ? 'primary' : 'default'}
          variant={a.enabled ? 'filled' : 'outlined'}
          onClick={() => dispatchAi({ type: 'toggle', field })}
        />
      </InputAdornment>
    );
  };

  const dForDisplay: DraftState = {
    title: draft.title,
    brand: draft.brand,
    category: draft.category,
    condition: draft.condition,
    price: draft.price,
    specifications: draft.specifications,
    notes: draft.notes,
  };
  const titleVal = displayForField('title', dForDisplay, ai);
  const brandVal = displayForField('brand', dForDisplay, ai);
  const categoryVal = displayForField('category', dForDisplay, ai);
  const condVal = displayForField('condition', dForDisplay, ai);
  const priceVal = displayForField('price', dForDisplay, ai);

  const categoryOptions = useMemo(() => {
    const v = categoryVal.trim();
    if (v && !isTaxonomyV1CategoryName(v)) return [...TAXONOMY_V1_CATEGORY_NAMES, v];
    return [...TAXONOMY_V1_CATEGORY_NAMES];
  }, [categoryVal]);
  const specVal = displayForField('specifications', dForDisplay, ai);
  const notesVal = displayForField('notes', dForDisplay, ai);

  const suggestionActive = (field: AIFieldName) =>
    Boolean(ai[field].suggestion && !ai[field].edited && ai[field].viewing === 'suggestion');

  const allAiEnabled = AI_FIELDS.every((f) => ai[f].enabled);
  const anyAiEnabled = AI_FIELDS.some((f) => ai[f].enabled);
  const suggestDisabled = loadingAi || !anyAiEnabled;

  const segmentMutedSx = {
    opacity: 0.45,
    filter: 'grayscale(0.25)',
  } as const;

  const segmentLoaded = (theme: Theme, tint: 'primary' | 'secondary') => ({
    boxShadow: `inset 0 0 0 1px ${alpha(theme.palette[tint].main, 0.55)}`,
    bgcolor: alpha(theme.palette[tint].main, 0.18),
  });

  const aiSuggestPillInner = (
    <Box
      sx={{
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        width: 'min(100%, 420px)',
        borderRadius: 999,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'primary.main',
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
        boxShadow: (theme) => theme.shadows[2],
      }}
    >
        <Button
          size="medium"
          disableElevation
          disabled={allAiEnabled}
          onClick={() => dispatchAi({ type: 'all', enabled: true })}
          sx={(theme) => ({
            borderRadius: 0,
            flex: 1,
            minWidth: 0,
            px: 2,
            py: 1.1,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.875rem',
            color: 'text.primary',
            borderRight: '1px solid',
            borderColor: 'divider',
            ...(allAiEnabled ? segmentMutedSx : segmentLoaded(theme, 'primary')),
            '&.Mui-disabled': segmentMutedSx,
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.22) },
          })}
        >
          All on
        </Button>
        <Button
          size="medium"
          disableElevation
          disabled={!anyAiEnabled}
          onClick={() => dispatchAi({ type: 'all', enabled: false })}
          sx={(theme) => ({
            borderRadius: 0,
            flex: 1,
            minWidth: 0,
            px: 2,
            py: 1.1,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.875rem',
            color: 'text.primary',
            borderRight: '1px solid',
            borderColor: 'divider',
            ...(!anyAiEnabled ? segmentMutedSx : segmentLoaded(theme, 'secondary')),
            '&.Mui-disabled': segmentMutedSx,
            '&:hover': { bgcolor: alpha(theme.palette.secondary.main, 0.2) },
          })}
        >
          All off
        </Button>
        <Button
          size="medium"
          variant="contained"
          color="primary"
          disableElevation
          disabled={suggestDisabled}
          onClick={() => void runSuggest()}
          startIcon={loadingAi ? <CircularProgress size={18} color="inherit" /> : <AutoAwesome sx={{ fontSize: 20 }} />}
          sx={(theme) => ({
            borderRadius: 0,
            flex: 1,
            minWidth: 0,
            px: 2,
            py: 1.1,
            textTransform: 'none',
            fontWeight: 800,
            fontSize: '0.875rem',
            boxShadow: suggestDisabled ? 'none' : theme.shadows[4],
            ...(suggestDisabled ? segmentMutedSx : {}),
            '&.Mui-disabled': { ...segmentMutedSx, color: 'action.disabled' },
            '&:hover': { boxShadow: suggestDisabled ? 'none' : theme.shadows[6] },
          })}
        >
          AI Suggest
        </Button>
      </Box>
  );

  const aiSuggestPillBar = (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        justifyContent: 'flex-start',
        mb: inventoryStatsSlot != null ? 0 : 2,
        mt: inventoryStatsSlot != null ? 0 : 0.5,
      }}
    >
      {aiSuggestPillInner}
    </Box>
  );

  const aiPillsAndStatsRow =
    inventoryStatsSlot != null ? (
      <Stack direction="column" spacing={2} sx={{ mt: 1 }}>
        <Box sx={{ minWidth: 0 }}>{aiSuggestPillBar}</Box>
        <Box sx={{ minWidth: 0, minHeight: 0 }}>{inventoryStatsSlot}</Box>
      </Stack>
    ) : (
      aiSuggestPillBar
    );

  return (
    <>
    <Box component="form" id={ITEM_DRAWER_FORM_ID} onSubmit={handleFormSubmit} sx={{ display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ pt: 1, pb: 1, px: 0.5 }}>
        {mode === 'edit' && item && <ItemHeroStats item={item} />}

        <Typography
          variant="caption"
          fontWeight={600}
          letterSpacing={0.06}
          color="text.secondary"
          display="block"
          sx={{ mb: 1 }}
        >
          ITEM DETAILS
        </Typography>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              size="small"
              label="Title"
              required
              value={titleVal}
              onChange={(e) => {
                setFieldErrors((p) => {
                  const n = { ...p };
                  delete n.title;
                  return n;
                });
                onFieldChange('title', e.target.value);
              }}
              error={Boolean(fieldErrors.title)}
              helperText={fieldErrors.title}
              sx={{
                mt: 0.5,
                ...(suggestionActive('title') ? { '& .MuiOutlinedInput-root': { bgcolor: 'action.hover' } } : {}),
              }}
              slotProps={{ input: { endAdornment: renderAiAdornment('title') } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="Brand"
              required={mode === 'create'}
              value={brandVal}
              onChange={(e) => onFieldChange('brand', e.target.value)}
              sx={suggestionActive('brand') ? { '& .MuiOutlinedInput-root': { bgcolor: 'action.hover' } } : {}}
              slotProps={{ input: { endAdornment: renderAiAdornment('brand') } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Autocomplete
              options={categoryOptions}
              value={categoryVal ? categoryVal : null}
              onChange={(_, v) => {
                setFieldErrors((p) => {
                  const n = { ...p };
                  delete n.category;
                  return n;
                });
                onFieldChange('category', v ?? '');
              }}
              getOptionLabel={(o) => o}
              isOptionEqualToValue={(a, b) => a === b}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  label="Category"
                  required={mode === 'create'}
                  error={Boolean(fieldErrors.category)}
                  helperText={fieldErrors.category}
                  sx={
                    suggestionActive('category')
                      ? { '& .MuiOutlinedInput-root': { bgcolor: 'action.hover' } }
                      : {}
                  }
                  slotProps={{
                    input: {
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {renderAiAdornment('category')}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    },
                  }}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              size="small"
              select
              label="Condition"
              value={condVal || 'unknown'}
              onChange={(e) => onFieldChange('condition', e.target.value)}
              sx={suggestionActive('condition') ? { '& .MuiOutlinedInput-root': { bgcolor: 'action.hover' } } : {}}
              slotProps={{ input: { endAdornment: renderAiAdornment('condition') } }}
            >
              {ITEM_CONDITIONS.map((c) => (
                <MenuItem key={c} value={c}>
                  {formatConditionLabel(c)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="Price"
              type="number"
              required={mode === 'create'}
              value={priceVal}
              onChange={(e) => {
                setFieldErrors((p) => {
                  const n = { ...p };
                  delete n.price;
                  return n;
                });
                onFieldChange('price', e.target.value);
              }}
              error={Boolean(fieldErrors.price)}
              helperText={fieldErrors.price}
              sx={suggestionActive('price') ? { '& .MuiOutlinedInput-root': { bgcolor: 'action.hover' } } : {}}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  endAdornment: renderAiAdornment('price'),
                },
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="Retail (MSRP)"
              type="number"
              required={mode === 'create'}
              value={draft.retail_value}
              onChange={(e) => {
                setFieldErrors((p) => {
                  const n = { ...p };
                  delete n.retail_value;
                  return n;
                });
                setDraftField('retail_value', e.target.value);
              }}
              error={Boolean(fieldErrors.retail_value)}
              helperText={fieldErrors.retail_value}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                },
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              size="small"
              select
              label="Source"
              value={draft.source}
              onChange={(e) => {
                const s = e.target.value as ItemSource;
                setDraftField('source', s);
                setDraftField('purchaseOrderId', null);
                setDraftField('agreementId', null);
              }}
            >
              {ITEM_SOURCES.map((s) => (
                <MenuItem key={s} value={s}>
                  {formatItemSourceLabel(s)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          {mode === 'create' && draft.source === 'purchased' && (
            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete
                size="small"
                options={purchaseOrders}
                filterOptions={(x) => x}
                inputValue={poSearchInput}
                onInputChange={(_, v) => setPoSearchInput(v)}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                getOptionLabel={(o) => `${o.order_number} — ${o.vendor_name}`}
                value={purchaseOrders.find((o) => o.id === draft.purchaseOrderId) ?? null}
                onChange={(_, v) => setDraftField('purchaseOrderId', v?.id ?? null)}
                renderInput={(params) => <TextField {...params} label="Purchase order (optional)" />}
              />
            </Grid>
          )}
          {mode === 'create' && draft.source === 'consignment' && (
            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete
                size="small"
                options={agreements}
                filterOptions={(x) => x}
                inputValue={agreementSearchInput}
                onInputChange={(_, v) => setAgreementSearchInput(v)}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                getOptionLabel={(o) => `${o.agreement_number} — ${o.consignee_name}`}
                value={agreements.find((o) => o.id === draft.agreementId) ?? null}
                onChange={(_, v) => setDraftField('agreementId', v?.id ?? null)}
                renderInput={(params) => <TextField {...params} label="Agreement (optional)" />}
              />
            </Grid>
          )}
          {mode === 'edit' && (
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                size="small"
                label="Location"
                value={draft.location}
                onChange={(e) => setDraftField('location', e.target.value)}
              />
            </Grid>
          )}
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              size="small"
              label="Specifications (JSON)"
              multiline
              minRows={3}
              value={specVal}
              onChange={(e) => onFieldChange('specifications', e.target.value)}
              placeholder='{"color": "blue", "size": "M"}'
              sx={suggestionActive('specifications') ? { '& .MuiOutlinedInput-root': { bgcolor: 'action.hover' } } : {}}
              slotProps={{ input: { endAdornment: renderAiAdornment('specifications') } }}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              size="small"
              label="Notes"
              multiline
              rows={2}
              value={notesVal}
              onChange={(e) => onFieldChange('notes', e.target.value)}
              sx={suggestionActive('notes') ? { '& .MuiOutlinedInput-root': { bgcolor: 'action.hover' } } : {}}
              slotProps={{ input: { endAdornment: renderAiAdornment('notes') } }}
            />
          </Grid>
        </Grid>

        {aiPillsAndStatsRow}
      </Box>

      {mode === 'create' && (
        <Stack
          direction="row"
          spacing={2}
          flexWrap="wrap"
          justifyContent="flex-end"
          sx={{ px: 1, py: 1.5, borderTop: 1, borderColor: 'divider' }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={printOnSave}
                onChange={(_, v) => setPrintOnSave(v)}
                size="small"
              />
            }
            label="Print label on save"
          />
          <FormControlLabel
            control={
              <Switch checked={keepOpen} onChange={(_, v) => setKeepOpen(v)} size="small" />
            }
            label="Keep form open"
          />
        </Stack>
      )}
    </Box>
    <ConfirmDialog
      open={pendingRefusal != null}
      severity="warning"
      title="AI flagged low confidence"
      message={pendingRefusal?.reason ?? ''}
      confirmLabel="Use anyway"
      cancelLabel="Cancel"
      onConfirm={() => {
        if (pendingRefusal) {
          dispatchAi({ type: 'receive', suggestions: pendingRefusal.suggestions });
          enqueueSnackbar('Low-confidence suggestions applied.', { variant: 'info' });
          logAddItemForm('User forced low-confidence suggestions');
        }
        setPendingRefusal(null);
      }}
      onCancel={() => {
        logAddItemForm('User cancelled low-confidence suggestions');
        setPendingRefusal(null);
      }}
    />
    </>
  );
}
