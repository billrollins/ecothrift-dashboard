import type { TarsCostField, TarsCostState } from './tarsTypes';

export const TARS_COST_STATE_LABELS: Record<TarsCostState, string> = {
  unknown: 'Unknown',
  zero: '$0',
  estimate: 'Est.',
  known: 'Known',
};

export function costField(
  state: TarsCostState,
  amount = 0,
): TarsCostField {
  return { state, amount: state === 'unknown' ? 0 : amount };
}

export function knownCost(amount: number): TarsCostField {
  return amount === 0 ? costField('zero', 0) : costField('known', amount);
}

export function resolveCostAmount(field: TarsCostField): number | null {
  if (field.state === 'unknown') return null;
  return field.amount;
}

export function costFieldHasValue(field: TarsCostField): boolean {
  return field.state !== 'unknown';
}

export function formatCostField(field: TarsCostField, fmtUsd: (n: number) => string): string {
  switch (field.state) {
    case 'unknown':
      return '—';
    case 'zero':
      return '$0';
    case 'estimate':
      return `~${fmtUsd(field.amount)}`;
    case 'known':
      return fmtUsd(field.amount);
    default:
      return '—';
  }
}

export function formatHoursField(field: TarsCostField): string {
  switch (field.state) {
    case 'unknown':
      return '—';
    case 'zero':
      return '0h';
    case 'estimate':
      return `~${field.amount}h`;
    case 'known':
      return `${field.amount}h`;
    default:
      return '—';
  }
}
