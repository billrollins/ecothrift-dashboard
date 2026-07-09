/**
 * Pure helpers for the Label Studio designer (snap + element factories).
 */
import type {
  LabelBarcodeElement,
  LabelDefinition,
  LabelElement,
  LabelIncrementVariable,
  LabelQrElement,
  LabelTextElement,
  LabelTextVariable,
  LabelVariable,
} from '../../../api/labels.api';

export { previewValues } from './variableResolve';

export const EMPTY_DEFINITION: LabelDefinition = { variables: [], elements: [] };

export function starterDefinition(): LabelDefinition {
  const variable: LabelTextVariable = {
    key: 'text',
    name: 'Text',
    kind: 'text',
    default: '',
  };
  return {
    variables: [variable],
    elements: [
      {
        ...defaultTextElement(0),
        literal: undefined,
        variable: variable.key,
      },
    ],
  };
}

export function snapPct(value: number, grid = 5): number {
  return Math.max(0, Math.min(100, Math.round(value / grid) * grid));
}

export function defaultTextElement(index: number): LabelTextElement {
  return {
    type: 'text',
    literal: 'Text',
    x_pct: 10,
    y_pct: Math.min(80, 10 + index * 15),
    font: 'arial',
    size_pt: 14,
    align: 'left',
    bold: false,
  };
}

export function defaultQrElement(): LabelQrElement {
  return {
    type: 'qr',
    literal: 'SKU',
    x_pct: 70,
    y_pct: 10,
    w_pct: 20,
    h_pct: 20,
    ecc: 'M',
  };
}

export function defaultBarcodeElement(): LabelBarcodeElement {
  return {
    type: 'barcode',
    literal: '123456',
    x_pct: 10,
    y_pct: 70,
    w_pct: 60,
    h_pct: 15,
    show_text: true,
  };
}

function uniqueKey(existing: LabelVariable[], prefix: string): string {
  let n = existing.length + 1;
  let key = `${prefix}_${n}`;
  const keys = new Set(existing.map((v) => v.key));
  while (keys.has(key)) {
    n += 1;
    key = `${prefix}_${n}`;
  }
  return key;
}

/** Slugify a display name into a stable key (create only). */
export function keyFromName(name: string, existing: LabelVariable[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^[^a-z]+/, '')
      .replace(/_+/g, '_')
      .replace(/_$/, '')
      .slice(0, 40) || 'field';
  const keys = new Set(existing.map((v) => v.key));
  if (!keys.has(base)) return base;
  let n = 2;
  while (keys.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`.slice(0, 40);
}

export function newTextVariable(existing: LabelVariable[]): LabelTextVariable {
  const key = uniqueKey(existing, 'field');
  return { key, name: 'New field', kind: 'text', default: '' };
}

export function newIncrementVariable(existing: LabelVariable[]): LabelIncrementVariable {
  const key = uniqueKey(existing, 'seq');
  return {
    key,
    name: 'Sequence',
    kind: 'increment',
    default_start: '1',
    default_step: '1',
    format: 'plain',
  };
}

/** @deprecated use newTextVariable */
export function newVariable(existing: LabelVariable[]): LabelTextVariable {
  return newTextVariable(existing);
}

export function patchElement(
  definition: LabelDefinition,
  index: number,
  patch: Partial<LabelElement>,
): LabelDefinition {
  return {
    ...definition,
    elements: definition.elements.map((el, i) => {
      if (i !== index) return el;
      return { ...el, ...patch } as LabelElement;
    }),
  };
}

export function moveElement(
  definition: LabelDefinition,
  index: number,
  direction: -1 | 1,
): { definition: LabelDefinition; selectedIndex: number } {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= definition.elements.length) {
    return { definition, selectedIndex: index };
  }
  const elements = [...definition.elements];
  [elements[index], elements[target]] = [elements[target], elements[index]];
  return { definition: { ...definition, elements }, selectedIndex: target };
}

/** Normalize API/legacy variable shapes for the designer. */
export function normalizeDefinition(raw: LabelDefinition | Record<string, never> | undefined): LabelDefinition {
  if (!raw || !('variables' in raw) || !Array.isArray(raw.variables)) {
    return EMPTY_DEFINITION;
  }
  const variables: LabelVariable[] = raw.variables.map((v: LabelVariable & {
    label?: string;
    required?: boolean;
    kind?: string;
  }) => {
    const name = (v as { name?: string }).name || (v as { label?: string }).label || v.key;
    if ((v as LabelVariable).kind === 'increment') {
      const inc = v as LabelIncrementVariable;
      return {
        key: v.key,
        name,
        kind: 'increment' as const,
        default_start: inc.default_start ?? '1',
        default_step: inc.default_step ?? '1',
        format: inc.format ?? 'plain',
      };
    }
    return {
      key: v.key,
      name,
      kind: 'text' as const,
      default: (v as LabelTextVariable).default ?? '',
    };
  });
  return {
    variables,
    elements: Array.isArray(raw.elements) ? raw.elements : [],
  };
}
