import { describe, expect, it } from 'vitest';
import { NAV_ITEM_CATALOG } from './navItemCatalog';
import { PAGE_REGISTRY, designBrief, nextStep, pageTitleFor, withChecks } from './pageRegistry';

describe('page registry', () => {
  it('gives every sidebar page a page type (none left "not sorted")', () => {
    expect(PAGE_REGISTRY.filter((p) => p.template === 'unsorted').map((p) => p.id)).toEqual([]);
  });

  it('lists each page once, from the sidebar catalog', () => {
    const ids = PAGE_REGISTRY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(NAV_ITEM_CATALOG[id]).toBeDefined());
  });

  it('puts the Design Lab in Admin and needs no design of its own', () => {
    const lab = PAGE_REGISTRY.find((p) => p.id === 'designLab');
    expect(lab?.workspaceId).toBe('admin');
    expect(lab && nextStep(lab)).toBeNull();
  });

  it('writes a brief that names the page, its type and its demo', () => {
    const receiving = PAGE_REGISTRY.find((p) => p.id === 'receiving')!;
    const brief = designBrief(receiving, 'https://dash.example');
    expect(brief).toContain('Receiving (https://dash.example/inventory/receiving)');
    expect(brief).toContain('List and detail');
    expect(brief).toContain('/admin/design-lab/demo/list-detail');
  });

  it('merges the owner\'s saved ticks and moves the next step on', () => {
    const merged = withChecks(PAGE_REGISTRY, { receiving: { template: true, design: true, done: false, by: 'Bill', at: '2026-11-13T14:00:00' } });
    const receiving = merged.find((p) => p.id === 'receiving')!;
    expect(receiving.check).toEqual({ template: true, design: true, done: false });
    expect(receiving.checkedBy).toBe('Bill');
    expect(nextStep(receiving)).toBe('done');
    expect(merged.find((p) => p.id === 'vendors')!.check.template).toBe(false);
  });

  it('names the page at an address for the top bar, the most specific sidebar page winning', () => {
    expect(pageTitleFor('/inventory/vendors')).toBe('Vendors');
    expect(pageTitleFor('/admin/design-lab')).toBe('Design Lab');
    expect(pageTitleFor('/nowhere')).toBe('');
    expect(pageTitleFor('/admin/design-lab/demo/data-table')).toBe('Orders');
  });
});
