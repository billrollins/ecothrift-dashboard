import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CsvViewerDialog } from './CsvViewerDialog';

describe('CsvViewerDialog', () => {
  it('renders sticky headers, row numbers, and preview messaging', () => {
    render(
      <CsvViewerDialog
        open
        onClose={() => {}}
        title="Manifest"
        subtitle="order.csv"
        headers={['sku', 'qty']}
        rows={[
          { row_number: 1, raw: { sku: 'A', qty: '2' } },
          { row_number: 2, raw: { sku: 'B', qty: '1' } },
        ]}
        totalRowCount={40}
      />,
    );
    expect(screen.getByText('sku')).toBeTruthy();
    expect(screen.getByText('qty')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText(/Showing 2 preview rows of 40 total/i)).toBeTruthy();
  });

  it('shows loading and error states', () => {
    const { rerender } = render(
      <CsvViewerDialog open onClose={() => {}} title="M" headers={[]} rows={[]} loading />,
    );
    expect(screen.getByRole('progressbar')).toBeTruthy();
    rerender(
      <CsvViewerDialog
        open
        onClose={() => {}}
        title="M"
        headers={[]}
        rows={[]}
        error="Could not load preview"
      />,
    );
    expect(screen.getAllByText('Could not load preview').length).toBeGreaterThan(0);
  });

  it('triggers download action', () => {
    const onDownload = vi.fn();
    render(
      <CsvViewerDialog
        open
        onClose={() => {}}
        title="Manifest"
        headers={['a']}
        rows={[{ raw: { a: '1' } }]}
        onDownload={onDownload}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /download full csv/i }));
    expect(onDownload).toHaveBeenCalled();
  });
});
