import api from './client';

/**
 * The Truck Plan of one order (`apps/inventory/services/truck_plan.py`). Never blank (#99): a truck with no plan of
 * its own gets the store default (`is_default`).
 */
export interface TruckPlanDTO {
  /** True while the truck follows the store default plan; a saved change makes it the truck's own. */
  is_default: boolean;
  /** Where tag prices start on this truck, as a percent of retail ("55"). */
  pricing_start_pct: string | null;
  watch_for: string;
  known_issues: string;
  crew: { id: number; name: string }[];
  dispute_due_date: string | null;
  updated_by: string;
  updated_at: string | null;
}

export interface TruckOnTrackDTO {
  /** Tag prices so far + the estimate for what is left. */
  total: string | null;
  priced_so_far: string | null;
  priced_items: number;
  estimated_left: string | null;
  units_left: number;
  units_own_price: number;
  units_by_rate: number;
  units_no_estimate: number;
  rate_pct: number | null;
  /** Where the rate came from: this truck's prices so far, or the plan's start point. */
  rate_basis: 'truck' | 'plan' | '';
  /** Positive = over the target, negative = under. */
  vs_target: string | null;
}

export interface TruckDisputePartDTO {
  units: number;
  retail: string | null;
}

export interface TruckDisputesDTO {
  items: number;
  retail: string | null;
  retail_pct: number | null;
  parts: { not_received: TruckDisputePartDTO; broken: TruckDisputePartDTO; damaged: TruckDisputePartDTO };
  truck_retail: string | null;
  threshold_pct: number;
  threshold_retail: string | null;
  over_threshold: boolean;
  price_plus_fees: string | null;
  worth: string | null;
  lines_without_retail: number;
}

/** The numbers at the top of Processing and in the Truck Plan window. */
export interface TruckSummaryDTO {
  order: { id: number; order_number: string; vendor: string; description: string; notes: string };
  paid: { total: string | null; price: string | null; fees: string | null; shipping: string | null };
  target: {
    total: string | null;
    default: string | null;
    is_default: boolean;
    multiple: number;
    set_by: string;
    set_at: string | null;
  };
  on_track: TruckOnTrackDTO;
  disputes: TruckDisputesDTO;
  dates: {
    delivered: string | null;
    expected_delivery: string | null;
    dispute_due: string | null;
    dispute_due_from_plan: boolean;
    dispute_business_days: number;
  };
  /** Close the truck (#88): filed or not, and what is worth filing and is not filed yet (null = nothing to chase). */
  claim: {
    filed: boolean;
    filed_on: string | null;
    amount_asked: string | null;
    amount_back: string | null;
    finalized_at: string | null;
    not_filed: string | null;
  };
  plan: TruckPlanDTO;
  can_set_target: boolean;
  /** A superuser may change the store default plan. */
  can_edit_default?: boolean;
}

/** The store default plan every truck starts with (#99). */
export interface TruckPlanDefaultDTO {
  pricing_start_pct: string | null;
  watch_for: string;
  known_issues: string;
  updated_by: string;
  updated_at: string | null;
}

export interface TruckPlanWindowDTO extends TruckSummaryDTO {
  staff: { id: number; name: string }[];
}

export interface TruckPlanSaveBody {
  pricing_start_pct?: string | null;
  watch_for?: string;
  known_issues?: string;
  crew_ids?: number[];
  dispute_due_date?: string | null;
}

export function getTruckSummary(orderId: number): Promise<{ data: TruckSummaryDTO }> {
  return api.get<TruckSummaryDTO>(`/inventory/orders/${orderId}/truck-summary/`);
}

export function getTruckPlan(orderId: number): Promise<{ data: TruckPlanWindowDTO }> {
  return api.get<TruckPlanWindowDTO>(`/inventory/orders/${orderId}/truck-plan/`);
}

export function saveTruckPlan(orderId: number, body: TruckPlanSaveBody): Promise<{ data: TruckPlanWindowDTO }> {
  return api.put<TruckPlanWindowDTO>(`/inventory/orders/${orderId}/truck-plan/`, body);
}

/** The truck follows the store default again (its own plan is removed). */
export function truckPlanBackToDefault(orderId: number): Promise<{ data: TruckPlanWindowDTO }> {
  return api.delete<TruckPlanWindowDTO>(`/inventory/orders/${orderId}/truck-plan/`);
}

/** Superuser only: change the store default. Every truck still on it follows; trucks with their own plan do not. */
export function saveTruckPlanDefault(
  body: { pricing_start_pct: string | null; watch_for: string },
): Promise<{ data: TruckPlanDefaultDTO }> {
  return api.put<TruckPlanDefaultDTO>('/inventory/orders/truck-plan-default/', body);
}

/** Superuser only. An empty total puts the target back to 2 x Paid. */
export function setTruckTarget(orderId: number, total: string | null): Promise<{ data: TruckPlanWindowDTO }> {
  return api.post<TruckPlanWindowDTO>(`/inventory/orders/${orderId}/truck-plan/target/`, { total });
}
