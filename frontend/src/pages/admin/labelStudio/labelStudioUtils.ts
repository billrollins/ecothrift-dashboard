import type { LabelDefinition } from '../../../api/labels.api';

export interface DesignerSnapshot {
  name: string;
  widthIn: string;
  heightIn: string;
  definition: LabelDefinition;
  backgroundFileId: number | null;
}

export function designerSnapshotKey(snapshot: DesignerSnapshot): string {
  return JSON.stringify({
    name: snapshot.name.trim(),
    widthIn: String(Number(snapshot.widthIn) || 0),
    heightIn: String(Number(snapshot.heightIn) || 0),
    definition: snapshot.definition,
    backgroundFileId: snapshot.backgroundFileId,
  });
}

export function formatApiError(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (!data || typeof data !== 'object') {
    return error instanceof Error && error.message ? error.message : fallback;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.detail === 'string') return record.detail;
  if (typeof record.error === 'string') return record.error;

  const lines: string[] = [];
  Object.entries(record).forEach(([field, value]) => {
    const label = field === 'non_field_errors' ? '' : `${field.replace(/_/g, ' ')}: `;
    if (Array.isArray(value)) lines.push(`${label}${value.join(' ')}`);
    else if (typeof value === 'string') lines.push(`${label}${value}`);
    else if (value && typeof value === 'object') {
      lines.push(`${label}${Object.values(value as Record<string, unknown>).flat().join(' ')}`);
    }
  });
  return lines.filter(Boolean).join(' · ') || fallback;
}

export function elementDisplayName(
  definition: LabelDefinition,
  index: number,
): string {
  const element = definition.elements[index];
  if (!element) return `Element ${index + 1}`;
  const source =
    element.variable != null
      ? definition.variables.find((v) => v.key === element.variable)?.name || 'Field'
      : element.literal || 'Fixed value';
  const kind = element.type === 'qr' ? 'QR' : element.type === 'barcode' ? 'Barcode' : 'Text';
  return `${kind} · ${source}`;
}
