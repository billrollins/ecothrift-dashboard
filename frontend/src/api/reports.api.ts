import api from './client';

/** The sales tax report for a period (owner 2026-10-13; apps/pos/services/sales_tax.py). Money is "123.45". */
export interface SalesTaxReport {
  start: string;
  end: string;
  sales: number;
  gross_sales: string;
  exempt_sales: string;
  taxable_sales: string;
  parts: { merchandise: string; discounts: string; delivery_fees: string; assembly: string; other?: string };
  tax_collected: string;
  tax_at_rate: string;
  rounding: string;
  rates: {
    rate: string;
    count: number;
    taxable: string;
    tax_collected: string;
    tax_at_rate: string;
    state_rate: string;
    state_tax: string;
    local_rate: string;
    local_tax: string;
  }[];
  days: { day: string; count: number; taxable: string; tax: string }[];
  payments: { method: string; count: number; total: string }[];
  card_surcharge: string;
  thrift_credit: string;
  collected_total: string;
  voided: { count: number; taxable: string; tax: string };
  /** Thrift+ 3-day returns in the period, by return day (T4): price (before tax) and tax given back as credit. */
  thrift_plus_returns: {
    count: number;
    taxable_back: string;
    tax_back: string;
    refund: string;
    credit: string;
    days: { day: string; count: number; taxable_back: string; tax_back: string }[];
    note: string;
  };
  taxable_sales_less_returns: string;
  tax_collected_less_returns: string;
}

/** Both days included (YYYY-MM-DD). The owner only. */
export async function fetchSalesTax(start: string, end: string): Promise<SalesTaxReport> {
  const { data } = await api.get<SalesTaxReport>('/pos/reports/sales-tax/', { params: { start, end } });
  return data;
}
