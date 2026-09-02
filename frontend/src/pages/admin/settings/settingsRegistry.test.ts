import { describe, expect, it } from 'vitest';
import {
  isHiddenKey,
  keysForTab,
  metaForKey,
  parseSettingsTab,
  SETTINGS_REGISTRY,
} from './settingsRegistry';

describe('settingsRegistry', () => {
  it('sends the four assumption keys only to Assumptions', () => {
    expect(keysForTab('assumptions', Object.keys(SETTINGS_REGISTRY))).toEqual([
      'po_default_est_shrink',
      'pricing_shrinkage_factor',
      'pricing_need_window_days',
      'delivery_service_minutes_per_stop',
    ]);
  });

  it('hides receipt storefront keys from every tab', () => {
    expect(isHiddenKey('store_name')).toBe(true);
    expect(keysForTab('system', ['store_name', 'tax_rate', 'mystery'])).toEqual(['mystery']);
  });

  it('drops unknown keys onto System as raw', () => {
    expect(metaForKey('custom_flag')).toEqual({
      label: 'custom_flag',
      help: 'Not in the curated registry. Edit carefully.',
      tab: 'system',
      kind: 'raw',
    });
  });

  it('parses URL tabs and refuses Permissions to a Manager', () => {
    expect(parseSettingsTab('store', false)).toBe('store');
    expect(parseSettingsTab('retail-qa', false)).toBe('retail-qa');
    expect(parseSettingsTab('permissions', false)).toBe('system');
    expect(parseSettingsTab('permissions', true)).toBe('permissions');
    expect(parseSettingsTab('nope', true)).toBe('system');
  });

  it('gathers every Retail QA key on its own tab', () => {
    const keys = keysForTab('retail-qa', Object.keys(SETTINGS_REGISTRY));
    expect(keys).toHaveLength(12);
    expect(keys.every((key) => key.startsWith('retail_qa.'))).toBe(true);
  });

  it('edits weights as percents, letters as scores, and audit floors as counts', () => {
    expect(metaForKey('retail_qa.owner_weight').kind).toBe('weight');
    expect(metaForKey('retail_qa.grade_a').kind).toBe('score');
    expect(metaForKey('retail_qa.audit_min_items').kind).toBe('count');
  });
});
