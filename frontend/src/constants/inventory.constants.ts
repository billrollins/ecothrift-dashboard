import type { ItemCondition, ItemSource } from '../types/inventory.types';

/** Ordered list for source dropdowns (replaces duplicated literals in pages). */
export const ITEM_SOURCES: ItemSource[] = ['purchased', 'consignment', 'misc'];

/** Human-readable labels for item source values. */
export function formatItemSourceLabel(value: string): string {
  if (value === 'misc') return 'Miscellaneous';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** All Item.condition values (matches backend Item.CONDITION_CHOICES). */
export const ITEM_CONDITIONS: ItemCondition[] = [
  'new',
  'like_new',
  'very_good',
  'good',
  'fair',
  'salvage',
  'unknown',
];

export function formatConditionLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
