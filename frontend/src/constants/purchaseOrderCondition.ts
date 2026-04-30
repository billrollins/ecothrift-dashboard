import type { PurchaseOrderCondition } from '../types/inventory.types';

/** Same labels/values as order detail; keep modal and detail aligned. */
export const PO_CONDITION_OPTIONS: { value: PurchaseOrderCondition | ''; label: string }[] = [
  { value: '', label: 'Not Set' },
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Used - Good' },
  { value: 'fair', label: 'Used - Fair' },
  { value: 'salvage', label: 'Salvage' },
  { value: 'mixed', label: 'Mixed' },
];
