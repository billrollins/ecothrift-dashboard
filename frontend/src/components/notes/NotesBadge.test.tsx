import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NOTES_BADGE_COMPACT_HEIGHT, NOTES_BADGE_COMPACT_WIDTH, NOTES_BADGE_HEIGHT, NOTES_BADGE_WIDTH, NotesBadge } from './NotesBadge';

describe('NotesBadge', () => {
  it('keeps a fixed footprint for zero and many', () => {
    const { rerender } = render(<NotesBadge count={0} onClick={vi.fn()} />);
    const zero = screen.getByRole('button', { name: 'Notes (0)' });
    expect(zero).toHaveStyle({ width: `${NOTES_BADGE_WIDTH}px`, height: `${NOTES_BADGE_HEIGHT}px` });

    rerender(<NotesBadge count={12} onClick={vi.fn()} />);
    const many = screen.getByRole('button', { name: 'Notes (12)' });
    expect(many).toHaveTextContent('12');
    expect(many).toHaveStyle({ width: `${NOTES_BADGE_WIDTH}px`, height: `${NOTES_BADGE_HEIGHT}px` });
  });

  it('tucks a compact count into a smaller reserved chip', () => {
    render(<NotesBadge compact count={3} onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Notes (3)' })).toHaveStyle({
      width: `${NOTES_BADGE_COMPACT_WIDTH}px`,
      height: `${NOTES_BADGE_COMPACT_HEIGHT}px`,
    });
  });

  it('keeps the compact chip the same size on the dark bench', () => {
    render(<NotesBadge compact tone="dark" count={3} onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Notes (3)' })).toHaveStyle({
      width: `${NOTES_BADGE_COMPACT_WIDTH}px`,
      height: `${NOTES_BADGE_COMPACT_HEIGHT}px`,
    });
  });
});
