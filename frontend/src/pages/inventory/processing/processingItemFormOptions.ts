import { formatConditionLabel, ITEM_CONDITIONS } from '../../../constants/inventory.constants';
import type { ItemCondition } from '../../../types/inventory.types';

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

export function normalizeProcessingCondition(raw: string | null | undefined): ItemCondition {
  const value = String(raw || '').trim();
  if ((ITEM_CONDITIONS as readonly string[]).includes(value)) return value as ItemCondition;

  const key = value.toLowerCase().replace(/^used\s+/, '').replace(/\s+/g, '_');
  if ((ITEM_CONDITIONS as readonly string[]).includes(key)) return key as ItemCondition;

  return PROCESSING_ITEM_DEFAULT_CONDITION;
}
