import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { SalesTaxReport } from '../../api/reports.api';
import SalesTaxTab, { periods, salesTaxCsv } from './SalesTaxTab';

const REPORT: SalesTaxReport = {
  start: '2026-09-01', end: '2026-09-30', sales: 1345,
  gross_sales: '51883.55', exempt_sales: '0.00', taxable_sales: '51883.55',
  parts: { merchandise: '52100.00', discounts: '-316.45', delivery_fees: '80.00', assembly: '20.00' },
  tax_collected: '3631.98', tax_at_rate: '3631.85', rounding: '0.13',
  rates: [{ rate: '0.0700', count: 1345, taxable: '51883.55', tax_collected: '3631.98', tax_at_rate: '3631.85', state_rate: '0.055',
    state_tax: '2853.60', local_rate: '0.015', local_tax: '778.25' }],
  days: [{ day: '2026-09-02', count: 60, taxable: '2400.00', tax: '168.00' }],
  payments: [{ method: 'card', count: 900, total: '40000.00' }, { method: 'cash', count: 445, total: '15515.53' }],
  card_surcharge: '337.13', thrift_credit: '0.00', collected_total: '55515.53',
  voided: { count: 2, taxable: '40.00', tax: '2.80' },
  thrift_plus_returns: {
    count: 1, taxable_back: '64.00', tax_back: '4.48', refund: '68.48', credit: '68.48',
    days: [{ day: '2026-09-04', count: 1, taxable_back: '64.00', tax_back: '4.48' }],
    note: 'For the CPA: Thrift+ 3-day returns refund 80% of the price and its tax as Thrift+ credit, on the return day.',
  },
  taxable_sales_less_returns: '51819.55',
  tax_collected_less_returns: '3627.50',
};

vi.mock('../../api/reports.api', () => ({ fetchSalesTax: vi.fn(async () => REPORT) }));

describe('Sales tax report (owner 2026-10-13)', () => {
  it('opens on the last full month, with the numbers for the return', async () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <SalesTaxTab />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    const box = await screen.findByTestId('for-the-return');
    expect(within(box).getByText('Net taxable sales')).toBeInTheDocument();
    expect(within(box).getAllByText('$51,883.55').length).toBeGreaterThan(0);
    expect(within(box).getByText('State tax (5.5%)')).toBeInTheDocument();
    expect(within(box).getByText('$2,853.60')).toBeInTheDocument();
    expect(within(box).getByText('Local tax (1.5%)')).toBeInTheDocument();
    expect(within(box).getByText('Total tax at 7%')).toBeInTheDocument();
    expect(screen.getByText(/2 sales from this period were voided/)).toBeInTheDocument();
    expect(screen.getByText('$337.13')).toBeInTheDocument();
    expect(within(box).getByText('Tax refunded on Thrift+ returns')).toBeInTheDocument();
    expect(within(box).getByText('$4.48')).toBeInTheDocument();
    expect(within(box).getByText('Tax collected less tax refunded')).toBeInTheDocument();
    expect(within(box).getByText('$3,627.50')).toBeInTheDocument();
    // Phone: each day is a card (the table is for wider screens), return days included.
    const cards = screen.getByTestId('tax-days-cards');
    expect(within(cards).getByText('Wed Sep 2')).toBeInTheDocument();
    expect(within(cards).getByText('$4.48 tax refunded')).toBeInTheDocument();
  });

  it('lists the periods newest first, the running one last', () => {
    const months = periods('month', new Date(2026, 9, 13));
    expect(months[0]).toMatchObject({ key: '2026-09', start: '2026-09-01', end: '2026-09-30' });
    expect(months.at(-1)).toMatchObject({ key: '2026-10', end: '2026-10-13' });
    expect(periods('quarter', new Date(2026, 9, 13))[0]).toMatchObject({ start: '2026-07-01', end: '2026-09-30' });
    expect(periods('year', new Date(2026, 9, 13))[0]).toMatchObject({ start: '2025-01-01', end: '2025-12-31' });
  });

  it('downloads the same numbers as a CSV', () => {
    const csv = salesTaxCsv(REPORT);
    expect(csv).toContain('Net taxable sales,51883.55');
    expect(csv).toContain('State tax (5.5%),2853.60');
    expect(csv).toContain('2026-09-02,60,2400.00,168.00,0.00');
    expect(csv).toContain('2026-09-04,0,0.00,0.00,4.48');
    expect(csv).toContain('Tax refunded on Thrift+ returns,4.48');
    expect(csv).toContain('Tax collected less tax refunded,3627.50');
    expect(csv).toContain('"2 sales, 40.00 taxable, 2.80 tax"');
    expect(csv).not.toContain('Tax-exempt sales to non-profits');
  });

  it('lists tax-exempt sales to non-profits with the organization and number in the CSV (2026-10-21)', () => {
    const csv = salesTaxCsv({
      ...REPORT,
      exempt_organizations: [
        { receipt: 'R-20261021-004', day: '2026-10-21', org: 'Open Door Mission', number: '05-123456',
          certificate_photo: false, amount: '120.00', by: 'Pat Clerk' },
        { receipt: 'R-20261021-009', day: '2026-10-21', org: 'Scout Troop 12', number: '',
          certificate_photo: true, amount: '15.00', by: 'Pat Clerk' },
      ],
    });
    expect(csv).toContain('Tax-exempt sales to non-profits');
    expect(csv).toContain('2026-10-21,R-20261021-004,Open Door Mission,05-123456,120.00,Pat Clerk');
    expect(csv).toContain('2026-10-21,R-20261021-009,Scout Troop 12,(photo on file),15.00,Pat Clerk');
  });
});
