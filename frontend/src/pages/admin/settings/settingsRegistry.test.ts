import { describe, expect, it } from 'vitest';
import { placedKeys, SETTINGS_LAYOUT } from './settingsLayout';
import {
  isHiddenKey,
  isKnownKey,
  isOwnerOnlyKey,
  isStateKey,
  metaForKey,
  parseSettingsTab,
  SETTINGS_REGISTRY,
  SETTINGS_TABS,
} from './settingsRegistry';

// Edited by a section's own editor (store hours, surcharge, Retail QA tables), not one row each.
const EDITED_BY_A_PIECE = new Set(['online_sales.hours', 'pos.card_surcharge', 'retail_qa.verify_ladder', 'retail_qa.owner_ladder', 'retail_qa.severity_groups']);

describe('settings layout (owner, 2026-10-07)', () => {
  it('gives every setting exactly one home, on the tab its registry entry names', () => {
    const placed = placedKeys();
    const counts = new Map<string, number>();
    for (const tab of SETTINGS_LAYOUT) for (const s of tab.sections) for (const k of s.keys ?? []) counts.set(k, (counts.get(k) ?? 0) + 1);
    expect([...counts].filter(([, n]) => n > 1)).toEqual([]);
    for (const [key, meta] of Object.entries(SETTINGS_REGISTRY)) {
      if (meta.kind === 'hidden' || meta.kind === 'state' || EDITED_BY_A_PIECE.has(key)) continue;
      expect(placed.get(key)?.tab, key).toBe(meta.tab);
    }
    for (const key of placed.keys()) expect(SETTINGS_REGISTRY[key], key).toBeTruthy();
  });

  it('has unique section ids per tab and only known tabs', () => {
    expect(SETTINGS_LAYOUT.map((t) => t.id)).toEqual(SETTINGS_TABS);
    for (const tab of SETTINGS_LAYOUT) {
      const ids = tab.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('puts the Thrift+ launch switch on its own tab, tagged pre-launch, owner only', () => {
    const tp = SETTINGS_LAYOUT.find((t) => t.id === 'thrift-plus')!;
    expect(tp.access).toBe('superuser');
    const launch = tp.sections.find((s) => s.id === 'launch')!;
    expect(launch.stage).toBe('pre-launch');
    expect(launch.keys?.[0]).toBe('thrift_plus_enabled');
    expect(metaForKey('thrift_plus_enabled').kind).toBe('switch');
    expect(metaForKey('thrift_plus_test_registers').kind).toBe('list');
    expect(isOwnerOnlyKey('thrift_plus_enabled') && isOwnerOnlyKey('pos.staff_purchases')).toBe(true);
    expect(isOwnerOnlyKey('tax_rate')).toBe(false);
  });

  it('keeps background-job state out of the setting rows, and sends unknown keys to Unsorted', () => {
    expect(isStateKey('ai_cleanup_job:384')).toBe(true);
    expect(metaForKey('ai_cleanup_job:384').label).toBe('AI cleanup job, order 384');
    expect(isStateKey('ai_price_check')).toBe(true);
    expect(isKnownKey('ai_cleanup_job:1')).toBe(true);
    expect(isKnownKey('custom_flag')).toBe(false);
    expect(metaForKey('custom_flag')).toMatchObject({ label: 'custom_flag', tab: 'system', kind: 'raw' });
    expect(isHiddenKey('hiring.careers')).toBe(true);
    expect(metaForKey('mailbox.email_signature').kind).toBe('html');
  });

  it('opens old links on the tab that took their settings, and keeps owner tabs to the owner', () => {
    expect(parseSettingsTab('assumptions', false)).toBe('buying');
    expect(parseSettingsTab('permissions', true)).toBe('people');
    expect(parseSettingsTab('retail-qa', false)).toBe('retail-qa');
    expect(parseSettingsTab('nope', true)).toBe('store');
    expect(parseSettingsTab(null, true)).toBe('store');
    expect(parseSettingsTab('ai', true, false)).toBe('store');
    expect(parseSettingsTab('ai', false, true)).toBe('ai');
    expect(parseSettingsTab('thrift-plus', true, false)).toBe('store');
    expect(parseSettingsTab('thrift-plus', false, true)).toBe('thrift-plus');
  });

  it('keeps the Retail QA editors as before', () => {
    expect(metaForKey('retail_qa.cross_full_tail').kind).toBe('tail');
    expect(metaForKey('retail_qa.cross_check_weekday').kind).toBe('weekday');
    expect(metaForKey('retail_qa.verify_ladder').kind).toBe('ladder');
    expect(isHiddenKey('retail_qa.grade_scale')).toBe(true);
    const qa = SETTINGS_LAYOUT.find((t) => t.id === 'retail-qa')!;
    const keys = qa.sections.flatMap((s) => s.keys ?? []);
    expect(keys).toHaveLength(25);
    expect(keys.every((k) => k.startsWith('retail_qa.'))).toBe(true);
  });
});
