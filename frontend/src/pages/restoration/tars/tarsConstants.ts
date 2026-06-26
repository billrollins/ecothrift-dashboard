import type { TarsDisplaySource } from './tarsTypes';

export const TARS_GRADE_SCALES: Record<string, string[]> = {
  Functional: ['Working', 'Repairable', 'Parts-only'],
  Completeness: ['Complete', 'Incomplete'],
  Assembly: ['Assembled', 'Flat-pack', 'Parts'],
  Condition: ['New', 'Like-new', 'Good', 'Fair', 'Salvage'],
};

export const TARS_SOURCE_COLORS: Record<TarsDisplaySource, string> = {
  Target: '#CC0000',
  Amazon: '#E47911',
  Walmart: '#0071DC',
};

export const TARS_GRADE_DOT_COLORS = ['#1A7A4F', '#C2790B', '#B45309', '#C0392B', '#64748B'];

export const TARS_DEFAULT_HOURLY_RATE = 18;
export const TARS_PAYROLL_MULTIPLIER = 1.1;
export const TARS_DEFAULT_TIME_PREMIUM = 1.0;
