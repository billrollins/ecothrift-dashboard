import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichTextEditorToolbar, toolbarItemsForVariant } from './RichTextEditorToolbar';

describe('RichTextEditorToolbar', () => {
  it('renders generic and blog controls for the blog variant', () => {
    render(<RichTextEditorToolbar editor={null} variant="blog" onImageClick={() => {}} />);

    expect(screen.getByTitle('Table')).toBeTruthy();
    expect(screen.getByTitle('Insert image')).toBeTruthy();
    expect(screen.getByTitle('Two columns')).toBeTruthy();
    expect(screen.getByTitle('Callout box')).toBeTruthy();
    expect(screen.getByTitle('Embed / link card')).toBeTruthy();
  });

  it('filters blog-only controls from the email variant using the shared config', () => {
    render(<RichTextEditorToolbar editor={null} variant="email" onImageClick={() => {}} />);

    expect(toolbarItemsForVariant('email')).not.toContain('columns');
    expect(screen.getByTitle('Table')).toBeTruthy();
    expect(screen.getByTitle('Insert image')).toBeTruthy();
    expect(screen.queryByTitle('Two columns')).toBeNull();
    expect(screen.queryByTitle('Callout box')).toBeNull();
    expect(screen.queryByTitle('Embed / link card')).toBeNull();
  });
});
