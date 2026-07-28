import type {
  DeliveryLineItem,
  DeliveryRunPhase,
  DeliveryRunStop,
} from '../../../types/pos.types';

/** Map legacy / start phases onto the five-step flow. */
export function normalizeWizardPhase(phase: DeliveryRunPhase | string | undefined): DeliveryRunPhase {
  if (!phase || phase === 'start') return 'calls';
  if (phase === 'review') return 'calls';
  if (phase === 'truck') return 'load';
  return phase as DeliveryRunPhase;
}

export function stopLineItems(stop: DeliveryRunStop): DeliveryLineItem[] {
  if (Array.isArray(stop.line_items) && stop.line_items.length > 0) return stop.line_items;
  const parts = String(stop.items_delivered || '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (parts.length ? parts : ['Delivery items']).map((description) => ({
    line_id: null,
    sku: '',
    description,
    quantity: 1,
    scannable: false,
    scan_verified: false,
  }));
}

export function confirmedStops(stops: DeliveryRunStop[]): DeliveryRunStop[] {
  return stops.filter((s) => s.is_confirmed);
}

export function unconfirmedStops(stops: DeliveryRunStop[]): DeliveryRunStop[] {
  return stops.filter((s) => !s.is_confirmed);
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function interpolateTemplateTokens(
  body: string,
  vars: { name?: string; eta?: string; date?: string },
): string {
  let out = body;
  if (vars.name) out = out.replaceAll('{name}', vars.name);
  if (vars.eta) out = out.replaceAll('{eta}', vars.eta);
  if (vars.date) out = out.replaceAll('{date}', vars.date);
  return out;
}
