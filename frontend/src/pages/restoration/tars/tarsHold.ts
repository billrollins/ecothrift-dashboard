/**
 * Hold is a structured multi-select, not one reason code.
 *
 * pending_reason on the job is a derived label for the rail. The full payload
 * lives on work_session.pending.
 */
import type { PurchaseSection } from './tarsPurchase';
import { PURCHASE_SECTION_LABELS, normalizePurchaseSection } from './tarsPurchase';
import type { TarsPendingInfo, TarsPendingReason, TarsWaitFor } from './tarsWorkTypes';
import { TARS_PENDING_REASON_LABELS } from './tarsWorkTypes';

const LEGACY_REASONS = new Set<string>(Object.keys(TARS_PENDING_REASON_LABELS));

export const WAIT_PIECE_KEYS = ['time', 'space', 'help', 'other'] as const;
export type WaitPieceKey = (typeof WAIT_PIECE_KEYS)[number];

export function emptyWaitFor(): TarsWaitFor {
  return { time: '', space: '', help: '', other: '' };
}

export function deriveHoldLabel(pending: Pick<TarsPendingInfo, 'needsPurchased' | 'waitFor' | 'withOtherItems'>): string {
  const bits: string[] = [];
  const needs = pending.needsPurchased ?? [];
  if (needs.length > 0) {
    bits.push(`Needs ${needs.map((section) => PURCHASE_SECTION_LABELS[section]).join(', ')}`);
  }
  const wait = pending.waitFor;
  const waitKeys = WAIT_PIECE_KEYS.filter((key) => Boolean(wait?.[key]?.trim()));
  if (waitKeys.length > 0) {
    bits.push(`Wait: ${waitKeys.join(', ')}`);
  }
  if (pending.withOtherItems) {
    bits.push('With other items');
  }
  const label = bits.join(' · ') || 'On hold';
  return label.length > 64 ? `${label.slice(0, 63)}` : label;
}

export function pendingFromLegacyReason(reason: string, notes = ''): Pick<
  TarsPendingInfo,
  'needsPurchased' | 'waitFor' | 'withOtherItems' | 'legacyReason'
> {
  if (reason === 'parts_needed') {
    return { needsPurchased: ['parts'], waitFor: emptyWaitFor(), withOtherItems: null, legacyReason: reason };
  }
  if (reason === 'need_more_time' || reason === 'repair_time_needed' || reason === 'between_steps' || reason === 'pending_test') {
    return {
      needsPurchased: [],
      waitFor: { ...emptyWaitFor(), time: TARS_PENDING_REASON_LABELS[reason as TarsPendingReason] || notes || 'Time' },
      withOtherItems: null,
      legacyReason: reason,
    };
  }
  if (
    reason === 'tools_needed' ||
    reason === 'needs_approval' ||
    reason === 'research_sop' ||
    reason === 'safety_hold'
  ) {
    return {
      needsPurchased: [],
      waitFor: { ...emptyWaitFor(), help: TARS_PENDING_REASON_LABELS[reason as TarsPendingReason] || notes || 'Help' },
      withOtherItems: null,
      legacyReason: reason,
    };
  }
  return {
    needsPurchased: [],
    waitFor: emptyWaitFor(),
    withOtherItems: null,
    legacyReason: reason || undefined,
  };
}

export function holdHasSubstance(pending: Pick<TarsPendingInfo, 'needsPurchased' | 'waitFor' | 'withOtherItems'>): boolean {
  if ((pending.needsPurchased ?? []).length > 0) return true;
  const wait = pending.waitFor;
  if (wait && WAIT_PIECE_KEYS.some((key) => Boolean(wait[key]?.trim()))) return true;
  return pending.withOtherItems != null;
}

export function holdDisplayLabel(reason: string | null | undefined): string {
  if (!reason) return 'on hold';
  if (LEGACY_REASONS.has(reason)) return TARS_PENDING_REASON_LABELS[reason as TarsPendingReason];
  return reason;
}

/** Ready when every requested purchase section has been received. Wait-for holds never are. */
export function purchaseHoldReady(pending: TarsPendingInfo | undefined, pendingReason?: string): boolean {
  const needs = pending?.needsPurchased?.length
    ? pending.needsPurchased
    : pendingReason === 'parts_needed' || pending?.legacyReason === 'parts_needed'
      ? (['parts'] as PurchaseSection[])
      : [];
  if (needs.length === 0) return false;
  const received = pending?.receivedSections?.length
    ? pending.receivedSections
    : pending?.partsReceived
      ? needs
      : [];
  return needs.every((section) => received.includes(section));
}

export function normalizePending(
  raw: unknown,
  fallbackReason = '',
  fallbackNotes = '',
  fallbackStorage = '',
  fallbackStarted = '',
): TarsPendingInfo {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const needsRaw = Array.isArray(record.needsPurchased) ? record.needsPurchased : [];
  let needsPurchased = needsRaw
    .map((value) => normalizePurchaseSection(value))
    .filter((value, index, all) => all.indexOf(value) === index);

  const waitRaw = record.waitFor && typeof record.waitFor === 'object' && !Array.isArray(record.waitFor)
    ? (record.waitFor as Record<string, unknown>)
    : {};
  const waitFor: TarsWaitFor = {
    time: typeof waitRaw.time === 'string' ? waitRaw.time : '',
    space: typeof waitRaw.space === 'string' ? waitRaw.space : '',
    help: typeof waitRaw.help === 'string' ? waitRaw.help : '',
    other: typeof waitRaw.other === 'string' ? waitRaw.other : '',
  };

  let withOtherItems: TarsPendingInfo['withOtherItems'] = null;
  const otherRaw = record.withOtherItems;
  if (otherRaw && typeof otherRaw === 'object' && !Array.isArray(otherRaw)) {
    const other = otherRaw as Record<string, unknown>;
    withOtherItems = {
      knowledge: other.knowledge === 'unknown' ? 'unknown' : 'known',
      waitUntil: typeof other.waitUntil === 'string' ? other.waitUntil : '',
      waitingOnOrder: typeof other.waitingOnOrder === 'string' ? other.waitingOnOrder : '',
      otherSkus: typeof other.otherSkus === 'string' ? other.otherSkus : '',
    };
  }

  const reason = typeof record.reason === 'string' && record.reason ? record.reason : fallbackReason;
  if (needsPurchased.length === 0 && !holdHasSubstance({ needsPurchased, waitFor, withOtherItems }) && reason) {
    const mapped = pendingFromLegacyReason(reason, fallbackNotes);
    needsPurchased = mapped.needsPurchased;
    if (!waitFor.time && !waitFor.space && !waitFor.help && !waitFor.other) {
      waitFor.time = mapped.waitFor?.time ?? '';
      waitFor.space = mapped.waitFor?.space ?? '';
      waitFor.help = mapped.waitFor?.help ?? '';
      waitFor.other = mapped.waitFor?.other ?? '';
    }
    if (!withOtherItems) withOtherItems = mapped.withOtherItems ?? null;
  }

  const receivedRaw = Array.isArray(record.receivedSections) ? record.receivedSections : [];
  const receivedSections = receivedRaw.map((value) => normalizePurchaseSection(value));

  return {
    reason,
    needsPurchased,
    waitFor,
    withOtherItems,
    notes: typeof record.notes === 'string' ? record.notes : fallbackNotes,
    storageLocation: typeof record.storageLocation === 'string' ? record.storageLocation : fallbackStorage,
    pendingStartedAt: typeof record.pendingStartedAt === 'string' ? record.pendingStartedAt : fallbackStarted,
    receivedSections,
    partsReceived: Boolean(record.partsReceived),
    partsReceivedAt: typeof record.partsReceivedAt === 'string' ? record.partsReceivedAt : undefined,
    legacyReason: typeof record.legacyReason === 'string' ? record.legacyReason : undefined,
  };
}
