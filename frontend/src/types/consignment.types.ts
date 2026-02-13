/**
 * Consignment agreement status choices
 */
export type ConsignmentAgreementStatus = 'active' | 'paused' | 'closed';

/**
 * Consignment item status choices
 */
export type ConsignmentItemStatus =
  | 'pending_intake'
  | 'listed'
  | 'sold'
  | 'expired'
  | 'returned';

/**
 * Consignment payout status choices
 */
export type ConsignmentPayoutStatus = 'pending' | 'paid';

/**
 * Consignment payout payment method choices
 */
export type ConsignmentPayoutMethod = 'cash' | 'check' | 'store_credit';

export interface ConsignmentAgreement {
  id: number;
  consignee: number;
  consignee_name: string;
  agreement_number: string;
  commission_rate: string;
  status: ConsignmentAgreementStatus;
  start_date: string;
  end_date: string | null;
  terms: string;
  created_at: string;
}

export interface ConsignmentItem {
  id: number;
  agreement: number;
  agreement_number: string;
  consignee_name: string;
  item: number;
  item_sku: string;
  item_title: string;
  asking_price: string;
  listed_price: string;
  status: ConsignmentItemStatus;
  received_at: string;
  listed_at: string | null;
  sold_at: string | null;
  sale_amount: string | null;
  store_commission: string | null;
  consignee_earnings: string | null;
  return_date: string | null;
  notes: string;
}

export interface ConsignmentPayout {
  id: number;
  consignee: number;
  consignee_name: string;
  payout_number: string;
  period_start: string;
  period_end: string;
  items_sold: number;
  total_sales: string;
  total_commission: string;
  payout_amount: string;
  status: ConsignmentPayoutStatus;
  paid_at: string | null;
  paid_by: number | null;
  paid_by_name: string | null;
  payment_method: ConsignmentPayoutMethod;
  notes: string;
  created_at: string;
}

/**
 * Summary view for consignee list/dashboard
 */
export interface ConsigneeSummary {
  id: number;
  consignee_number: string;
  full_name: string;
  email: string;
  status: 'active' | 'paused' | 'closed';
  items_listed: number;
  items_sold: number;
  total_earnings: string;
  pending_payout: string;
}
