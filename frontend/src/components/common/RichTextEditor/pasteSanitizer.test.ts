import { describe, expect, it } from 'vitest';
import { cleanPastedHtml } from './pasteSanitizer';

describe('cleanPastedHtml', () => {
  it('removes document cruft while preserving allowed rich-text classes', () => {
    const cleaned = cleanPastedHtml(`
      <!--[if gte mso 9]>office cruft<![endif]-->
      <style>.bad { color: red; }</style>
      <p class="MsoNormal bt-dropcap" style="font-size: 20px" align="center">
        <span style="font-weight: 700">Hello</span>
        <mark class="foreign bt-highlight-soft" bgcolor="yellow">world</mark>
      </p>
    `);

    expect(cleaned).not.toContain('style=');
    expect(cleaned).not.toContain('MsoNormal');
    expect(cleaned).not.toContain('align=');
    expect(cleaned).not.toContain('bgcolor=');
    expect(cleaned).not.toContain('<style');
    expect(cleaned).toContain('<p class="bt-dropcap">');
    expect(cleaned).toContain('Hello');
    expect(cleaned).not.toContain('<span');
    expect(cleaned).toContain('class="bt-highlight-soft"');
  });
});
