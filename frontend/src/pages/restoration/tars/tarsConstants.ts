import type { TarsExecuteVerb, TarsSource, TarsVerb } from './tarsTypes';

export const TARS_GRADE_SCALES: Record<string, string[]> = {
  Functional: ['Working', 'Repairable', 'Parts-only'],
  Completeness: ['Complete', 'Incomplete'],
  Assembly: ['Assembled', 'Flat-pack', 'Parts'],
  Condition: ['New', 'Like-new', 'Good', 'Fair', 'Salvage'],
};

export const TARS_SOURCE_COLORS: Record<TarsSource, string> = {
  Target: '#CC0000',
  Amazon: '#E47911',
  Walmart: '#0071DC',
};

export const TARS_VERB_META: Record<
  TarsVerb,
  { color: string; description: string }
> = {
  Test: { color: '#2563EB', description: 'Diagnose before committing' },
  Assemble: { color: '#7C3AED', description: 'Build to complete / assembled' },
  Repair: { color: '#1A7A4F', description: 'Fix to working condition' },
  Salvage: { color: '#B45309', description: 'Part out for component value' },
  'As-is': { color: '#64748B', description: 'Sell in current condition' },
};

export const TARS_EXECUTE_VERBS: TarsExecuteVerb[] = ['Test', 'Assemble', 'Repair', 'Salvage'];

export const TARS_GRADE_DOT_COLORS = ['#1A7A4F', '#C2790B', '#B45309', '#C0392B', '#64748B'];

export const TARS_DEFAULT_HOURLY_RATE = 18;
export const TARS_PAYROLL_MULTIPLIER = 1.1;
export const TARS_DEFAULT_TIME_PREMIUM = 1.0;
