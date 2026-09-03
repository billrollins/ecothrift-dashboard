import { describe, expect, it } from 'vitest';
import { SHIFT_DEPARTMENTS, SHIFT_OPTIONS, STRINGS, pick, shiftDepartment, t, triggerLabel } from './routines';

describe('t', () => {
  it('returns Spanish when asked, English otherwise', () => {
    expect(t('today', 'es')).toBe('Hoy');
    expect(t('today', 'en')).toBe('Today');
    expect(t('today', undefined)).toBe('Today');
  });

  it('has a non-empty Spanish string for every key', () => {
    for (const [key, row] of Object.entries(STRINGS)) {
      expect(row.es.trim(), key).not.toBe('');
      expect(row.en.trim(), key).not.toBe('');
    }
  });
});

describe('triggerLabel', () => {
  it('names each trigger in the requested language', () => {
    expect(triggerLabel('daily', 'es')).toBe('Diario');
    expect(triggerLabel('on_demand', 'en')).toBe('On demand');
    expect(triggerLabel('unknown', 'es')).toBe('unknown');
  });
});

describe('pick', () => {
  it('uses the Spanish field when it has text', () => {
    const row = { label: 'Trash', label_es: 'Basura' };
    expect(pick(row, 'label', 'es')).toBe('Basura');
    expect(pick(row, 'label', 'en')).toBe('Trash');
    expect(pick({ label: 'Trash', label_es: '' }, 'label', 'es')).toBe('Trash');
  });
});

describe('shift departments', () => {
  it('orders Retail, Warehouse, Office and includes office', () => {
    expect(SHIFT_DEPARTMENTS.map((row) => row.key)).toEqual(['retail', 'warehouse', 'office']);
    expect(SHIFT_OPTIONS.some((row) => row.key === 'office')).toBe(true);
    expect(SHIFT_OPTIONS).toHaveLength(7);
  });

  it('names the department in the requested language', () => {
    expect(shiftDepartment('retail_open', 'es')).toBe('Tienda');
    expect(shiftDepartment('retail_open', 'en')).toBe('Retail');
    expect(shiftDepartment('processing', 'es')).toBe('Bodega');
    expect(shiftDepartment('office', 'en')).toBe('Office');
  });
});
