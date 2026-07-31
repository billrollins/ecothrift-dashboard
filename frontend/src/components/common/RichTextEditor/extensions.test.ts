import { describe, expect, it } from 'vitest';
import { createRichTextEditorExtensions } from './extensions';

function extensionNames(variant: 'blog' | 'email') {
  return createRichTextEditorExtensions({ variant, placeholder: 'Write something' }).map(
    (extension) => extension.name,
  );
}

describe('createRichTextEditorExtensions', () => {
  it('includes core formatting, images, tables, and history in both variants', () => {
    for (const variant of ['blog', 'email'] as const) {
      const names = extensionNames(variant);
      expect(names).toEqual(
        expect.arrayContaining([
          'starterKit',
          'underline',
          'link',
          'image',
          'placeholder',
          'blockquote',
          'table',
          'tableRow',
          'tableHeader',
          'tableCell',
        ]),
      );
    }
  });

  it('includes blog nodes only for the blog variant', () => {
    const blog = extensionNames('blog');
    const email = extensionNames('email');
    const blogOnly = [
      'dropCap',
      'pullQuote',
      'callout',
      'column',
      'columnsSection',
      'linkCard',
    ];

    expect(blog).toEqual(expect.arrayContaining(blogOnly));
    blogOnly.forEach((name) => expect(email).not.toContain(name));
  });
});
