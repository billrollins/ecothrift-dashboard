import type { Category } from '../../../types/inventory.types';

export type ProductAIFieldName =
  | 'title'
  | 'brand'
  | 'model'
  | 'categoryRef'
  | 'tagsText'
  | 'identifiers'
  | 'specifications';

export const PRODUCT_AI_FIELDS: ProductAIFieldName[] = [
  'title',
  'brand',
  'model',
  'categoryRef',
  'tagsText',
  'identifiers',
  'specifications',
];

export type ProductFieldAI = {
  enabled: boolean;
  baseline: string;
  suggestion: string | null;
  viewing: 'original' | 'suggestion';
  edited: boolean;
};

export type ProductEditorDraft = {
  title: string;
  brand: string;
  model: string;
  categoryRef: string;
  tagsText: string;
  identifiers: Record<string, string>;
  specifications: Record<string, string>;
};

export type ProductAIAction =
  | { type: 'toggle'; field: ProductAIFieldName }
  | { type: 'snapshot'; draft: ProductEditorDraft }
  | { type: 'receive'; suggestions: Record<string, unknown> }
  | { type: 'flip'; field: ProductAIFieldName }
  | { type: 'viewAll'; viewing: 'original' | 'suggestion' }
  | { type: 'markEdited'; field: ProductAIFieldName }
  | { type: 'reset' };

function emptyFieldAI(): ProductFieldAI {
  return {
    enabled: false,
    baseline: '',
    suggestion: null,
    viewing: 'original',
    edited: false,
  };
}

export function initialProductAIState(): Record<ProductAIFieldName, ProductFieldAI> {
  return {
    title: emptyFieldAI(),
    brand: emptyFieldAI(),
    model: emptyFieldAI(),
    categoryRef: emptyFieldAI(),
    tagsText: emptyFieldAI(),
    identifiers: emptyFieldAI(),
    specifications: emptyFieldAI(),
  };
}

function stringifyJsonObject(value: Record<string, string>): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

function parseJsonObject(raw: string): Record<string, string> {
  const t = raw.trim();
  if (!t) return {};
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      const normKey = String(key).trim();
      const normVal = String(val ?? '').trim();
      if (!normKey || !normVal) continue;
      out[normKey] = normVal;
    }
    return out;
  } catch {
    return {};
  }
}

function tagsFromSuggestion(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean).join(', ');
  }
  if (typeof raw === 'string') return raw.trim();
  return '';
}

export function categoryLabel(cat: { name: string }): string {
  return cat.name;
}

export function mapSuggestedCategoryToCategoryRef(
  suggestion: string,
  categories: Category[],
): { categoryRef: string; matched: boolean } {
  const s = suggestion.trim();
  if (!s) return { categoryRef: '', matched: false };
  for (const cat of categories) {
    if (cat.name === s) return { categoryRef: String(cat.id), matched: true };
  }
  return { categoryRef: '', matched: false };
}

export function productDraftToAiContext(
  draft: ProductEditorDraft,
  categories: Category[],
): Record<string, unknown> {
  const selectedCategory = draft.categoryRef
    ? categories.find((cat) => String(cat.id) === draft.categoryRef)
    : null;
  const categoryName = selectedCategory ? categoryLabel(selectedCategory) : '';
  return {
    title: draft.title,
    brand: draft.brand,
    model: draft.model,
    category: categoryName,
    tags: draft.tagsText
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter(Boolean),
    identifiers: draft.identifiers,
    specifications: draft.specifications,
    category_options: categories.map((cat) => categoryLabel(cat)),
  };
}

const API_FIELD_FOR_PRODUCT_FIELD: Record<ProductAIFieldName, string> = {
  title: 'title',
  brand: 'brand',
  model: 'model',
  categoryRef: 'category',
  tagsText: 'tags',
  identifiers: 'identifiers',
  specifications: 'specifications',
};

export function productAiFieldsToApiFields(fields: ProductAIFieldName[]): string[] {
  return fields.map((f) => API_FIELD_FOR_PRODUCT_FIELD[f]);
}

export function productAiReducer(
  state: Record<ProductAIFieldName, ProductFieldAI>,
  action: ProductAIAction,
): Record<ProductAIFieldName, ProductFieldAI> {
  switch (action.type) {
    case 'toggle': {
      const f = action.field;
      return { ...state, [f]: { ...state[f], enabled: !state[f].enabled } };
    }
    case 'snapshot': {
      const next = { ...state };
      const d = action.draft;
      const baselines: Record<ProductAIFieldName, string> = {
        title: d.title,
        brand: d.brand,
        model: d.model,
        categoryRef: d.categoryRef,
        tagsText: d.tagsText,
        identifiers: stringifyJsonObject(d.identifiers),
        specifications: stringifyJsonObject(d.specifications),
      };
      for (const k of PRODUCT_AI_FIELDS) {
        next[k] = {
          ...next[k],
          enabled: true,
          baseline: baselines[k],
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
      const mapSuggestion = (field: ProductAIFieldName): string | null => {
        const apiKey = API_FIELD_FOR_PRODUCT_FIELD[field];
        if (!(apiKey in sug) || sug[apiKey] === undefined) return null;
        const val = sug[apiKey];
        if (field === 'identifiers' || field === 'specifications') {
          if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            try {
              return JSON.stringify(val);
            } catch {
              return String(val);
            }
          }
          return null;
        }
        if (field === 'tagsText') return tagsFromSuggestion(val);
        return String(val ?? '');
      };
      for (const k of PRODUCT_AI_FIELDS) {
        if (!next[k].enabled) continue;
        const s = mapSuggestion(k);
        if (s === null) continue;
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
    case 'viewAll': {
      const next = { ...state };
      for (const k of PRODUCT_AI_FIELDS) {
        const cur = next[k];
        if (!cur.suggestion || cur.edited) continue;
        next[k] = { ...cur, viewing: action.viewing };
      }
      return next;
    }
    case 'markEdited': {
      const f = action.field;
      return { ...state, [f]: { ...state[f], edited: true, viewing: 'original', suggestion: null } };
    }
    case 'reset':
      return initialProductAIState();
    default:
      return state;
  }
}

export function displayValueForProductField(
  field: ProductAIFieldName,
  draft: ProductEditorDraft,
  ai: Record<ProductAIFieldName, ProductFieldAI>,
  categories: Category[],
): string | Record<string, string> {
  const a = ai[field];
  const draftVal =
    field === 'title'
      ? draft.title
      : field === 'brand'
        ? draft.brand
        : field === 'model'
          ? draft.model
          : field === 'categoryRef'
            ? draft.categoryRef
            : field === 'tagsText'
              ? draft.tagsText
              : field === 'identifiers'
                ? draft.identifiers
                : draft.specifications;

  if (a.edited || !a.suggestion) {
    return draftVal;
  }

  if (field === 'categoryRef') {
    if (a.viewing === 'suggestion') {
      const mapped = mapSuggestedCategoryToCategoryRef(a.suggestion, categories);
      return mapped.matched ? mapped.categoryRef : a.baseline || draft.categoryRef;
    }
    return a.baseline !== '' ? a.baseline : draft.categoryRef;
  }

  if (field === 'identifiers' || field === 'specifications') {
    if (a.viewing === 'suggestion') return parseJsonObject(a.suggestion);
    if (a.baseline) return parseJsonObject(a.baseline);
    return draftVal as Record<string, string>;
  }

  if (a.viewing === 'suggestion') return a.suggestion;
  return a.baseline !== '' ? a.baseline : (draftVal as string);
}

export function productAiTooltip(
  field: ProductAIFieldName,
  draft: ProductEditorDraft,
  ai: Record<ProductAIFieldName, ProductFieldAI>,
  categories: Category[],
): string {
  const a = ai[field];
  if (!a.suggestion && !a.baseline) return '';
  if (field === 'categoryRef') {
    const beforeRef = a.baseline || draft.categoryRef;
    const beforeCat = beforeRef ? categories.find((c) => String(c.id) === beforeRef) : null;
    const beforeLabel = beforeCat ? categoryLabel(beforeCat) : beforeRef || '(none)';
    return `Before: ${beforeLabel}\nAI: ${a.suggestion || '(none)'}`;
  }
  if (field === 'identifiers' || field === 'specifications') {
    const beforeObj = a.baseline ? parseJsonObject(a.baseline) : (draft[field] as Record<string, string>);
    const afterObj = a.suggestion ? parseJsonObject(a.suggestion) : {};
    const fmt = (obj: Record<string, string>) =>
      Object.keys(obj).length
        ? Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join('\n')
        : '(empty)';
    return `Before:\n${fmt(beforeObj)}\nAI:\n${fmt(afterObj)}`;
  }
  const before = a.baseline || (field === 'tagsText' ? draft.tagsText : draft[field as 'title' | 'brand' | 'model']);
  return `Before: ${before || '(empty)'}\nAI: ${a.suggestion || '(empty)'}`;
}

export function productSuggestionActive(
  field: ProductAIFieldName,
  ai: Record<ProductAIFieldName, ProductFieldAI>,
): boolean {
  const a = ai[field];
  return Boolean(a.suggestion && !a.edited && a.viewing === 'suggestion');
}

export function hasFlippableAiSuggestions(ai: Record<ProductAIFieldName, ProductFieldAI>): boolean {
  return PRODUCT_AI_FIELDS.some((f) => ai[f].suggestion && !ai[f].edited);
}
