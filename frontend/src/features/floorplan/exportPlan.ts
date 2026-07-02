import type { PlanDocument } from '../../types/floorplan.types';
import { serializePlanExport } from './planFile';

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function safeFilename(name: string): string {
  return name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'floorplan';
}

export function exportPlanJson(doc: PlanDocument, planName: string): void {
  // Wrapped export (kind + name + document) so imports can prefill the plan
  // name; parsePlanFile also still accepts bare documents from old backups.
  const blob = new Blob([serializePlanExport(doc, planName)], { type: 'application/json' });
  downloadBlob(blob, `${safeFilename(planName)}.json`);
}

/** Screen pixels per inch used for PNG rasterization, before the 2x multiplier. */
const PNG_BASE_SCALE = 2;
const PNG_MULTIPLIER = 2;
const PNG_MAX_DIM = 8192;

/**
 * Export the plan as a PNG covering the full plan bounds (not the viewport).
 * `svgNode` must be the plan-content SVG (the editor renders one with a
 * data-floorplan-svg attribute); it is cloned and re-framed to plan bounds.
 */
export async function exportPlanPng(
  svgNode: SVGSVGElement,
  doc: PlanDocument,
  planName: string,
): Promise<void> {
  const { planWidth, planHeight } = doc.settings;
  let pxPerInch = PNG_BASE_SCALE * PNG_MULTIPLIER;
  if (planWidth * pxPerInch > PNG_MAX_DIM || planHeight * pxPerInch > PNG_MAX_DIM) {
    pxPerInch = Math.min(PNG_MAX_DIM / planWidth, PNG_MAX_DIM / planHeight);
  }
  const outW = Math.max(1, Math.round(planWidth * pxPerInch));
  const outH = Math.max(1, Math.round(planHeight * pxPerInch));

  const clone = svgNode.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('viewBox', `0 0 ${planWidth} ${planHeight}`);
  clone.setAttribute('width', String(outW));
  clone.setAttribute('height', String(outH));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // Remove editor-only overlays (selection handles, marquee, etc.)
  clone.querySelectorAll('[data-editor-overlay]').forEach((n) => n.remove());

  const svgText = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to render plan SVG.'));
      image.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png');
    });
    downloadBlob(pngBlob, `${safeFilename(planName)}.png`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
