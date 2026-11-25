// What each step offers: its standard fixes (code), its standard AI jobs, and the values a selection can be set to.
import type { StepKey } from '../../../api/prepSteps.api';

export interface Tool {
  name: string;
  label: string;
}

export interface SetField {
  field: string;
  label: string;
  kind: 'text' | 'money' | 'int' | 'select' | 'category' | 'subcategory';
  options?: string[];
}

export const STEP_INFO: Record<StepKey, { title: string; does: string; rules: Tool[]; ai: Tool[]; set: SetField[] }> = {
  load: {
    title: 'Load',
    does: 'Read the manifest into lines',
    rules: [],
    ai: [],
    set: [],
  },
  clean: {
    title: 'Clean',
    does: 'Titles, brands, models, quantities',
    rules: [
      { name: 'clean_titles', label: 'Clean titles' },
      { name: 'brands', label: 'Brand from title' },
    ],
    ai: [{ name: 'clean_ai', label: 'AI: clean titles and brands' }],
    set: [
      { field: 'brand', label: 'Brand', kind: 'text' },
      { field: 'title', label: 'Title', kind: 'text' },
      { field: 'qty', label: 'Qty', kind: 'int' },
    ],
  },
  match: {
    title: 'Match products',
    does: 'Each line to a product we have, or new',
    rules: [
      { name: 'match_products', label: 'Match again' },
      { name: 'take_top', label: 'Take top candidate' },
      { name: 'mark_new', label: 'Mark new product' },
      { name: 'drop_weak', label: 'Weak likes to new' },
    ],
    ai: [{ name: 'match_ai', label: 'AI: judge the matches' }],
    set: [],
  },
  category: {
    title: 'Category',
    does: 'Our category and subcategory',
    rules: [
      { name: 'category_rule', label: 'Category by rule' },
      { name: 'category_product', label: 'Use product category' },
    ],
    ai: [{ name: 'category_ai', label: 'AI: set category' }],
    set: [
      { field: 'category', label: 'Category', kind: 'category' },
      { field: 'subcategory', label: 'Subcategory', kind: 'subcategory' },
    ],
  },
  retail: {
    title: 'Retail',
    does: 'Retail of one tag, checked',
    rules: [
      { name: 'retail_manifest', label: 'Retail from manifest' },
      { name: 'retail_history', label: 'Use our past retail' },
    ],
    ai: [{ name: 'retail_ai', label: 'AI: check retail' }],
    set: [{ field: 'retail', label: 'Retail', kind: 'money' }],
  },
  price: {
    title: 'Price',
    does: 'Tag price against the truck target',
    rules: [
      { name: 'price_rule', label: 'Price by truck rule' },
      { name: 'price_sold', label: 'Price from sold history' },
    ],
    ai: [{ name: 'price_ai', label: 'AI: pick price class' }],
    set: [
      { field: 'price', label: 'Price', kind: 'money' },
      { field: 'price_class', label: 'Class', kind: 'select', options: ['S1', 'PL', 'XMAS', 'TOY', 'HBA', 'TOOL', 'GEN', 'FURN', 'APP', 'HOLD', 'DEEP', 'UNK'] },
    ],
  },
  packs: {
    title: 'Packs',
    does: 'Count per unit x units; sell whole or by unit',
    rules: [
      { name: 'packs_rule', label: 'Read packs' },
      { name: 'sell_whole', label: 'Sell whole' },
      { name: 'sell_units', label: 'Sell by unit' },
    ],
    ai: [{ name: 'packs_ai', label: 'AI: read packs' }],
    set: [
      { field: 'pack_units', label: 'Units in pack', kind: 'int' },
      { field: 'unit_count', label: 'Count per unit', kind: 'int' },
      { field: 'unit_name', label: 'Unit name', kind: 'text' },
    ],
  },
  send: {
    title: 'Send',
    does: 'What Processing gets',
    rules: [{ name: 'search_tags', label: 'Search words' }],
    ai: [{ name: 'tags_ai', label: 'AI: search words' }],
    set: [],
  },
};

export const CUSTOM_FIELDS: { field: string; label: string }[] = [
  { field: 'title', label: 'Title' },
  { field: 'brand', label: 'Brand' },
  { field: 'model', label: 'Model' },
  { field: 'qty', label: 'Qty' },
  { field: 'category', label: 'Category' },
  { field: 'subcategory', label: 'Subcategory' },
  { field: 'retail', label: 'Retail' },
  { field: 'price', label: 'Price' },
  { field: 'price_class', label: 'Class' },
  { field: 'unit_count', label: 'Count per unit' },
  { field: 'unit_name', label: 'Unit name' },
  { field: 'pack_units', label: 'Units in pack' },
  { field: 'pieces', label: 'Tags per unit' },
  { field: 'sell_as', label: 'Sell as' },
  { field: 'search_tags', label: 'Search words' },
];

/** The fields a step's custom prompt may change by default. */
export const CUSTOM_DEFAULT: Record<StepKey, string[]> = {
  load: ['title', 'brand', 'model', 'qty'],
  clean: ['title', 'brand', 'model', 'qty'],
  match: ['title', 'brand', 'model'],
  category: ['category', 'subcategory'],
  retail: ['retail'],
  price: ['price', 'price_class'],
  packs: ['unit_count', 'unit_name', 'pack_units', 'pieces', 'sell_as'],
  send: ['search_tags'],
};
