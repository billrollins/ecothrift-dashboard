/**
 * "Print a test label" (owner, 2026-10-28): a frame on the very edge, a quarter-inch ruler along the top and the left,
 * and the size it was drawn for. Hold a ruler to it: the ticks land on the quarter inches and the frame sits on the
 * edge of the stock when the setting matches the labels in the printer. A sample price tag prints right after it.
 */
import type { LabelSize } from '../labelSize';
import { fitSize, frame, type Measure, type TagBox, type TagDesign, type TagOp } from '../tagCanvas';

export interface TestLabelData {
  size: LabelSize;
}

/** Tick positions (dots) every quarter inch up to `length`, with how long each is (whole inches longest). */
export function rulerTicks(length: number, dpi: number): Array<{ at: number; quarter: number }> {
  const ticks: Array<{ at: number; quarter: number }> = [];
  for (let q = 1; (q * dpi) / 4 < length - 1; q += 1) ticks.push({ at: Math.round((q * dpi) / 4), quarter: q % 4 });
  return ticks;
}

export function layoutTestLabel(data: TestLabelData, box: TagBox, measure: Measure): TagOp[] {
  const { w, h, dpi } = box;
  const line = Math.max(2, Math.round(dpi / 100));
  const ops: TagOp[] = [{ kind: 'rect', x: 0, y: 0, w, h, fill: 'paper' }, ...frame(box, line)];
  const long = Math.round(dpi * 0.14);
  const short = Math.round(dpi * 0.07);
  const half = Math.round(dpi * 0.1);
  const len = (quarter: number) => (quarter === 0 ? long : quarter === 2 ? half : short);
  for (const t of rulerTicks(w, dpi)) {
    ops.push({ kind: 'rect', x: t.at - line / 2, y: 0, w: line, h: len(t.quarter), fill: 'ink' });
  }
  for (const t of rulerTicks(h, dpi)) {
    ops.push({ kind: 'rect', x: 0, y: t.at - line / 2, w: len(t.quarter), h: line, fill: 'ink' });
  }
  const inner = long + Math.round(dpi * 0.05);
  const maxW = w - inner - Math.round(dpi * 0.08);
  const head = `${data.size.w_in} x ${data.size.h_in} in`;
  const headSize = fitSize(measure, head, maxW, h * 0.28, 8, 'black');
  const cx = inner + maxW / 2;
  ops.push({ kind: 'text', text: head, x: cx, y: inner + (h - inner) * 0.35, size: headSize, font: 'black', fill: 'ink',
    align: 'center' });
  const sub = `${data.size.dpi} dpi · ticks every 1/4 in`;
  ops.push({ kind: 'text', text: sub, x: cx, y: inner + (h - inner) * 0.72, font: 'regular', fill: 'ink',
    align: 'center', size: fitSize(measure, sub, maxW, h * 0.11, 6, 'regular') });
  return ops;
}

export const testLabel: TagDesign<TestLabelData> = { name: 'Test label', layout: layoutTestLabel };
