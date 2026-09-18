import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClockTile } from '../../api/hr.api';
import { ShiftPicker, clockGroupsFromTiles } from './ShiftPicker';

const { TILES } = vi.hoisted(() => {
  const TILES: ClockTile[] = [
    { id: 1, name: 'Retail Open', department: 'Retail', department_slug: 'retail-operations', department_sort: 0, punch_code: 'retail_open' },
    { id: 2, name: 'Retail - Inventory', department: 'Retail', department_slug: 'retail-operations', department_sort: 0, punch_code: 'retail_inventory' },
    { id: 3, name: 'Retail Close', department: 'Retail', department_slug: 'retail-operations', department_sort: 0, punch_code: 'retail_close' },
    { id: 4, name: 'Retail Mid', department: 'Retail', department_slug: 'retail-operations', department_sort: 0, punch_code: 'retail_day' },
    { id: 5, name: 'Processing', department: 'Processing', department_slug: 'processing', department_sort: 1, punch_code: 'processing' },
    { id: 6, name: 'Restoration', department: 'Restoration', department_slug: 'restoration', department_sort: 2, punch_code: 'restoration' },
    { id: 7, name: 'Office', department: 'Office', department_slug: 'office', department_sort: 3, punch_code: 'office' },
  ];
  return { TILES };
});

vi.mock('../../api/hr.api', () => ({
  getClockTiles: vi.fn(async () => ({ data: TILES })),
}));

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ShiftPicker lang="en" onPick={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('clockGroupsFromTiles', () => {
  it('groups roster names under department names in sort order', () => {
    const groups = clockGroupsFromTiles(TILES);
    expect(groups.map((row) => row.en)).toEqual(['Retail', 'Processing', 'Restoration', 'Office']);
    expect(groups.map((row) => row.key)).toEqual(['retail-operations', 'processing', 'restoration', 'office']);
    expect(groups[0].shifts.map((row) => row.en)).toEqual([
      'Retail Open',
      'Retail - Inventory',
      'Retail Close',
      'Retail Mid',
    ]);
    expect(groups.some((row) => row.en === 'Warehouse')).toBe(false);
    expect(groups.flatMap((row) => row.shifts.map((shift) => shift.en))).not.toContain('Customer Service');
  });
});

describe('ShiftPicker', () => {
  it('renders roster tiles under department eyebrows', async () => {
    wrap();
    expect(await screen.findByRole('button', { name: 'Retail Open' })).toBeInTheDocument();
    expect(screen.getByText('Retail')).toBeInTheDocument();
    expect(screen.getAllByText('Processing')).toHaveLength(2);
    expect(screen.getAllByText('Restoration')).toHaveLength(2);
    expect(screen.getAllByText('Office')).toHaveLength(2);
    expect(screen.queryByText('Warehouse')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Office' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Customer Service' })).not.toBeInTheDocument();
  });
});
