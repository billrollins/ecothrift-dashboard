import { formatConditionLabel, ITEM_CONDITIONS } from '../../../constants/inventory.constants';
import type { ItemCondition, ItemStatus } from '../../../types/inventory.types';

export function formatItemStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const PROCESSING_ITEM_STATUS_OPTIONS: Array<{ value: ItemStatus; label: string }> = (
  ['intake', 'processing', 'on_shelf', 'sold', 'returned', 'scrapped', 'lost'] as ItemStatus[]
).map((value) => ({
  value,
  label: formatItemStatusLabel(value),
}));

/** Manual processing edits — sold is set only through point of sale. */
export const PROCESSING_ITEM_PATCHABLE_STATUS_OPTIONS = PROCESSING_ITEM_STATUS_OPTIONS.filter(
  (option) => option.value !== 'sold',
);

export const PROCESSING_ITEM_CONDITION_OPTIONS = ITEM_CONDITIONS.filter((condition) => condition !== 'unknown').map(
  (value) => ({
    value,
    label: formatConditionLabel(value),
  }),
);

export const PROCESSING_ITEM_DEFAULT_CONDITION: ItemCondition = 'good';

export const PROCESSING_ITEM_DISPATCH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'on_shelf', label: 'On shelf / floor' },
  { value: 'restoration', label: 'Restoration' },
  { value: 'back_storage', label: 'Back storage' },
  { value: 'online_sales', label: 'Online sales' },
  { value: 'salvage', label: 'Salvage' },
];

export function processingDispatchLabel(raw: string | null | undefined): string {
  const value = normalizeProcessingDispatch(raw);
  return PROCESSING_ITEM_DISPATCH_OPTIONS.find((option) => option.value === value)?.label
    ?? formatItemStatusLabel(value);
}

export function normalizeProcessingDispatch(raw: string | null | undefined): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return 'on_shelf';
  const key = trimmed.toLowerCase().replace(/\s+/g, '_');
  const byValue = PROCESSING_ITEM_DISPATCH_OPTIONS.find((option) => option.value === key);
  if (byValue) return byValue.value;
  const byLabel = PROCESSING_ITEM_DISPATCH_OPTIONS.find(
    (option) => option.label.toLowerCase() === trimmed.toLowerCase(),
  );
  return byLabel?.value ?? 'on_shelf';
}

export function normalizeProcessingCondition(raw: string | null | undefined): ItemCondition {
  const value = String(raw || '').trim();
  if ((ITEM_CONDITIONS as readonly string[]).includes(value)) return value as ItemCondition;

  const key = value.toLowerCase().replace(/^used\s+/, '').replace(/\s+/g, '_');
  if ((ITEM_CONDITIONS as readonly string[]).includes(key)) return key as ItemCondition;

  return PROCESSING_ITEM_DEFAULT_CONDITION;
}
