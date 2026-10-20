import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CartSummary, SalesNumbers } from '../../api/pos.api';
import { SalesNumbersBlock } from './SalesNumbersBlock';

const numbers: SalesNumbers = {
  item_sales: '1234.50',
  returns: '-36.00',
  net_item_sales: '1198.50',
  thriftplus_revenue: '17.50',
  thriftplus_revenue_instant: '17.50',
  thriftplus_revenue_returned: '0.00',
  thriftplus_revenue_expired: '0.00',
  tax: '80.45',
  tax_collected: '84.93',
  tax_refunded: '4.48',
  fees_customers_paid: '26.61',
  fees_card_surcharge: '1.61',
  fees_delivery: '25.00',
  fees_we_pay: '0.86',
  fees_we_pay_percent: '1',
  debit_charged: '85.60',
  card_type_not_set: '0.00',
  paid_with: {
    cash: '900.00',
    card: '300.00',
    card_debit: '240.00',
    card_credit: '60.00',
    card_type_not_set: '0.00',
    payroll: '0.00',
    thriftplus_credit: '50.00',
    earlier_thriftbucks: '35.00',
  },
  thriftbucks_owed_new: '120.00',
  sales_count: 14,
  reconciles: { money_in: '1285.00', accounted_for: '1285.00', difference: '0.00' },
};

function summary(extra: Partial<SalesNumbers> = {}, paid: Partial<SalesNumbers['paid_with']> = {}): CartSummary {
  return {
    count: 14,
    total: '1300.00',
    average: '92.86',
    voided_count: 1,
    thrift_count: 6,
    by_method: { cash: '900.00' },
    sales_numbers: { ...numbers, ...extra, paid_with: { ...numbers.paid_with, ...paid } },
  };
}

function renderBlock(s: CartSummary) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <SalesNumbersBlock summary={s} />
    </ThemeProvider>,
  );
}

const row = (group: string, label: string) =>
  within(screen.getByRole('group', { name: group })).getByText(label).parentElement as HTMLElement;

describe('SalesNumbersBlock', () => {
  it('shows item sales, returns, net item sales and Thrift+ revenue in plain words', () => {
    renderBlock(summary());
    expect(row('Sales', 'Item sales')).toHaveTextContent('$1,234.50');
    expect(row('Sales', 'Returns')).toHaveTextContent('−$36.00');
    expect(row('Sales', 'Net item sales')).toHaveTextContent('$1,198.50');
    expect(row('Sales', 'Thrift+ revenue')).toHaveTextContent('$17.50');
  });

  it('shows tax and the two kinds of fees', () => {
    renderBlock(summary());
    expect(row('Tax and fees', 'Tax')).toHaveTextContent('$80.45');
    expect(row('Tax and fees', 'Fees customers paid')).toHaveTextContent('$26.61');
    expect(row('Tax and fees', 'Fees we pay')).toHaveTextContent('$0.86');
    expect(screen.getByText(/1% of debit cards/)).toBeInTheDocument();
    expect(screen.queryByText(/no fee worked out/)).not.toBeInTheDocument();
  });

  it('says so when a card sale has no card type, instead of guessing a fee', () => {
    renderBlock(summary({ card_type_not_set: '85.60' }, { card_type_not_set: '85.60' }));
    expect(screen.getAllByText(/Card type not set/)).toHaveLength(2);
    expect(screen.getByText(/no fee worked out/)).toBeInTheDocument();
  });

  it('shows how it was paid: cash, card, Thrift+ credit and earlier ThriftBucks', () => {
    renderBlock(summary());
    expect(row('Paid with', 'Cash')).toHaveTextContent('$900.00');
    expect(row('Paid with', 'Card')).toHaveTextContent('$300.00');
    expect(row('Paid with', 'Debit')).toHaveTextContent('$240.00');
    expect(row('Paid with', 'Credit')).toHaveTextContent('$60.00');
    expect(row('Paid with', 'Thrift+ credit')).toHaveTextContent('$50.00');
    expect(row('Paid with', 'ThriftBucks from earlier visits')).toHaveTextContent('$35.00');
    expect(screen.queryByText('Payroll deduction')).not.toBeInTheDocument();
  });

  it('adds payroll deduction only when there is some, and keeps the counts', () => {
    renderBlock(summary({}, { payroll: '12.00' }));
    expect(row('Paid with', 'Payroll deduction')).toHaveTextContent('$12.00');
    expect(screen.getByText('14 sales · 6 Thrift+ · 1 voided')).toBeInTheDocument();
  });

  it('shows nothing when the server sent no block', () => {
    const s = summary();
    const { container } = renderBlock({ ...s, sales_numbers: undefined as unknown as SalesNumbers });
    expect(container).toBeEmptyDOMElement();
  });
});
