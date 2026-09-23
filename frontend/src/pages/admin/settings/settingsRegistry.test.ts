import { describe, expect, it } from 'vitest';
import {
  isHiddenKey,
  keysForTab,
  metaForKey,
  parseSettingsTab,
  SETTINGS_REGISTRY,
  SETTINGS_TABS,
} from './settingsRegistry';

describe('settingsRegistry', () => {
  it('sends the assumption keys only to Assumptions', () => {
    expect(keysForTab('assumptions', Object.keys(SETTINGS_REGISTRY))).toEqual([
      'po_default_est_shrink',
      'pricing_shrinkage_factor',
      'pricing_need_window_days',
      'buying_manifest_pull_window_hours',
      'buying_manifest_pull_max_per_run',
      'buying_manifest_pull_retry_hours',
      'buying_manifest_pull_page_delay_ms',
      'buying_shipping_per_pallet',
      'buying_target_cover_weeks',
      'buying_pipeline_max_age_days',
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

  it('shows the AI tab to a superuser only', () => {
    expect(parseSettingsTab('ai', true)).toBe('system');
    expect(parseSettingsTab('ai', true, false)).toBe('system');
    expect(parseSettingsTab('ai', false, true)).toBe('ai');
    expect(SETTINGS_TABS).toContain('ai');
  });

  it('gathers every Retail QA key on its own tab', () => {
    const keys = keysForTab('retail-qa', Object.keys(SETTINGS_REGISTRY));
    expect(keys).toHaveLength(28);
    expect(keys.every((key) => key.startsWith('retail_qa.'))).toBe(true);
  });

  it('puts card surcharge on Store next to tax', () => {
    expect(metaForKey('pos.card_surcharge').tab).toBe('store');
    expect(metaForKey('pos.card_surcharge').kind).toBe('surcharge');
    expect(keysForTab('store', Object.keys(SETTINGS_REGISTRY))).toEqual([
      'tax_rate',
      'online_sales.hours',
      'pos.card_surcharge',
    ]);
  });

  it('edits tails, weekdays, ladders, and letter scores on Retail QA', () => {
    expect(metaForKey('retail_qa.cross_full_tail').kind).toBe('tail');
    expect(metaForKey('retail_qa.cross_check_weekday').kind).toBe('weekday');
    expect(metaForKey('retail_qa.verify_ladder').kind).toBe('ladder');
    expect(metaForKey('retail_qa.severity_groups').kind).toBe('severity_groups');
    expect(isHiddenKey('retail_qa.grade_scale')).toBe(true);
    expect(metaForKey('retail_qa.spot_check_count').kind).toBe('count');
    expect(isHiddenKey('retail_qa.section_check_weekdays')).toBe(true);
  });
});
