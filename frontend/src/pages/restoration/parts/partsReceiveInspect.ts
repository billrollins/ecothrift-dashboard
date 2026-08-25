import type {
  RestorationPartsLineInspectPayload,
  RestorationPartsLineInspectVerdict,
  RestorationPartsOrderDTO,
  RestorationPartsOrderLineDTO,
} from '../../../types/inventory.types';

export const INSPECT_SLOT_MIN_HEIGHT = 188;

export interface LineInspectDraft {
  id: number;
  verdict: RestorationPartsLineInspectVerdict;
  note: string;
}

export function draftsFromOrder(order: RestorationPartsOrderDTO): LineInspectDraft[] {
  return order.lines.map((line) => ({
    id: line.id,
    verdict:
      line.inspect_verdict === 'acceptable' || line.inspect_verdict === 'issues'
        ? line.inspect_verdict
        : '',
    note: line.inspect_note || '',
  }));
}

export function lineInspectReady(draft: LineInspectDraft): boolean {
  if (draft.verdict === 'acceptable') return true;
  if (draft.verdict === 'issues') return draft.note.trim().length > 0;
  return false;
}

export function receiveInspectReady(drafts: LineInspectDraft[]): boolean {
  return drafts.length > 0 && drafts.every(lineInspectReady);
}

export function inspectNoteValue(draft: LineInspectDraft): string {
  return draft.verdict === 'issues' ? draft.note : '';
}

export function lineInspectLabel(line: RestorationPartsOrderLineDTO): string {
  return line.description?.trim() || 'Part';
}

export function toInspectPayload(drafts: LineInspectDraft[]): RestorationPartsLineInspectPayload[] {
  return drafts.map((draft) => ({
    id: draft.id,
    verdict: draft.verdict === 'issues' ? 'issues' : 'acceptable',
    note: draft.verdict === 'issues' ? draft.note.trim() : '',
  }));
}

export function orderNeedsInspect(order: RestorationPartsOrderDTO): boolean {
  return order.status === 'received' && order.review_state !== 'reviewed';
}

export function orderTypeLabel(order: RestorationPartsOrderDTO): string {
  const labels = Array.from(
    new Set(
      order.lines.map((line) => {
        if (line.category === 'ffe') return 'FFE';
        if (line.category === 'supplies') return 'Supplies';
        return 'Parts';
      }),
    ),
  );
  return labels.join(' + ') || 'Parts';
}

export function orderPartsWord(order: RestorationPartsOrderDTO): string {
  const count = order.item_count || order.lines.length;
  return count === 1 ? '1 part' : `${count} parts`;
}

export function orderGradeSpan(order: RestorationPartsOrderDTO): string {
  const from = order.job_starting_grade.trim() || '-';
  const to = order.target_grade.trim() || '-';
  return `${from} → ${to}`;
}
