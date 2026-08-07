/** Display types for restoration jobs in TARS UI. */

import type { RestorationJobStage, TarsSource } from '../../../types/inventory.types';
import type { TarsWorkSession } from './tarsWorkTypes';

export type TarsStage = RestorationJobStage;

export type TarsDisplaySource = 'Target' | 'Amazon' | 'Walmart';

export type { TarsSource };

export interface TarsItem {
  /** Backend restoration job id when loaded from API. */
  jobId?: number;
  sku: string;
  /** Display label - e.g. ITM123 or ITM123 +2 */
  skuLabel?: string;
  catalogItemId?: number;
  productId?: number;
  orderId?: number;
  orderNumber?: string;
  sentAt?: string;
  name: string;
  brand?: string;
  model?: string;
  upc?: string;
  productNumber?: string;
  source: TarsDisplaySource;
  category: string;
  condition?: string;
  retail?: number;
  price?: number;
  stage: TarsStage;
  scale: string;
  values: Record<string, number>;
  workSession?: TarsWorkSession;
}
