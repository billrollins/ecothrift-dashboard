// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// The grid ships a stylesheet the test runner cannot load; the catalog checks here never draw it.
vi.mock('@mui/x-data-grid', () => ({ DataGrid: () => null }));
import { PAGE_TEMPLATES, pageTitleFor, templateDemoPath } from '../../navigation/pageRegistry';
import { DEMO_VIEWS } from './DemoPage';
import { ELEMENTS, elementCheckId } from './elementCatalog';

describe('Design Lab', () => {
  it('has a live demo for every page type, named after a real page in the top bar', () => {
    PAGE_TEMPLATES.forEach((t) => {
      expect(DEMO_VIEWS[t.id], t.id).toBeDefined();
      expect(pageTitleFor(templateDemoPath(t.id))).toBe(t.demoTitle);
    });
  });

  it('includes the three rich page types', () => {
    expect(PAGE_TEMPLATES.map((t) => t.id)).toEqual(expect.arrayContaining(['data-table', 'command-center', 'station']));
  });

  it('lists each kit element once, with a tick id the server accepts', () => {
    const ids = ELEMENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(elementCheckId(id)).toMatch(/^[A-Za-z][A-Za-z0-9_-]{0,59}$/));
  });
});
