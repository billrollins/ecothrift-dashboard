/** Lifecycle stage for a restoration job (mock + future API). */
export type TarsStage = 'intake' | 'sent' | 'workstation' | 'executing' | 'done';

export type TarsVerb = 'Test' | 'Assemble' | 'Repair' | 'Salvage' | 'As-is';

export type TarsExecuteVerb = 'Test' | 'Assemble' | 'Repair' | 'Salvage';

export type TarsSource = 'Target' | 'Amazon' | 'Walmart';

/** How sure we are about a dollar amount or time estimate. */
export type TarsCostState = 'unknown' | 'zero' | 'estimate' | 'known';

export interface TarsCostField {
  state: TarsCostState;
  amount: number;
}

export interface TarsPath {
  verb: TarsVerb;
  grade: string;
  parts: TarsCostField;
  hours: TarsCostField;
  /** Retail value for this path's target grade (may differ from queue defaults). */
  value: TarsCostField;
}

export interface TarsItem {
  sku: string;
  name: string;
  brand?: string;
  model?: string;
  upc?: string;
  productNumber?: string;
  source: TarsSource;
  category: string;
  condition?: string;
  retail?: number;
  price?: number;
  stage: TarsStage;
  scale: string;
  values: Record<string, number>;
  paths: TarsPath[];
  chosen?: { verb: TarsVerb; grade: string };
}

export interface TarsPathRow extends TarsPath {
  idx: number;
  resolvedValue: number;
  labor: number | null;
  cost: number | null;
  profit: number | null;
  hasUnknownCost: boolean;
}

export interface TarsPathEvaluation {
  rows: TarsPathRow[];
  bestIdx: number;
  selectedIdx: number;
  maxAbsProfit: number;
}
