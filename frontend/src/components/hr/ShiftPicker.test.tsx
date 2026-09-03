import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShiftPicker } from './ShiftPicker';

describe('ShiftPicker', () => {
  it('groups seven tiles under three department eyebrows', () => {
    render(<ShiftPicker lang="en" onPick={vi.fn()} />);
    expect(screen.getByText('Retail')).toBeInTheDocument();
    expect(screen.getByText('Warehouse')).toBeInTheDocument();
    expect(screen.getByText('Office')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Cashier - Open' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Management' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Customer Service' })).toHaveStyle({ whiteSpace: 'nowrap' });
  });
});
