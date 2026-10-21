import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SummerLinesDialog } from './SummerLinesDialog';

describe('SummerLinesDialog (the line sale, REG-21)', () => {
  it("shows the owner's sale name and percent", () => {
    render(<SummerLinesDialog open name="Patio" percent={30} cart={null} pending={false} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('Patio sale · 30% off')).toBeInTheDocument();
    expect(screen.getByText('Scan merchandise first, then mark the sale items.')).toBeInTheDocument();
  });
});
