import { describe, expect, it } from 'vitest';
import { adjustChangeCount, dataUriToFile, svgFileName } from './aiHelpers';

describe('aiHelpers', () => {
  it('turns a data URI into an SVG file', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>';
    const file = dataUriToFile(`data:image/svg+xml;base64,${btoa(svg)}`, 'x.svg');
    expect(file.type).toBe('image/svg+xml');
    expect(file.name).toBe('x.svg');
    expect(file.size).toBe(svg.length);
  });

  it('makes a safe file name', () => {
    expect(svgFileName('  Front Table #2 ')).toBe('front-table-2.svg');
    expect(svgFileName('***')).toBe('element.svg');
  });

  it('counts changes including settings', () => {
    const zero = { added: 0, changed: 0, removed: 0 };
    const result = {
      summary: {
        counts: { elements: { added: 1, changed: 2, removed: 0 }, zones: zero, paths: zero, labels: zero, infoBlocks: { added: 0, changed: 0, removed: 1 } },
        lines: [],
        more: 0,
      },
      settings_patch: { planWidth: 2400 },
    };
    expect(adjustChangeCount(result)).toBe(5);
  });
});
