/**
 * Resolve label variable values for designer preview and per-copy print.
 */
import type {
  LabelDefinition,
  LabelIncrementFormat,
  LabelIncrementVariable,
  LabelVariable,
} from '../../../api/labels.api';

/** Print-form state: text values by key; increment start/step by key. */
export interface PrintFormState {
  text: Record<string, string>;
  increment: Record<string, { start: string; step: string }>;
}

export const INCREMENT_FORMATS: { value: LabelIncrementFormat; label: string }[] = [
  { value: 'plain', label: 'Plain' },
  { value: 'integer', label: 'Integer' },
  { value: 'fixed_2', label: '2 decimals' },
  { value: 'currency', label: 'Currency ($)' },
  { value: 'pad_4', label: 'Pad 4' },
  { value: 'pad_6', label: 'Pad 6' },
];

export function formatIncrement(value: number, format: LabelIncrementFormat): string {
  if (!Number.isFinite(value)) return '';
  switch (format) {
    case 'integer':
      return String(Math.trunc(value));
    case 'fixed_2':
      return value.toFixed(2);
    case 'currency':
      return `$${value.toFixed(2)}`;
    case 'pad_4':
      return String(Math.trunc(value)).padStart(4, '0');
    case 'pad_6':
      return String(Math.trunc(value)).padStart(6, '0');
    case 'plain':
    default: {
      if (Number.isInteger(value)) return String(value);
      return String(parseFloat(value.toFixed(10)));
    }
  }
}

export function parseNumeric(raw: string): number | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Designer canvas preview values. */
export function previewValues(definition: LabelDefinition): Record<string, string> {
  const values: Record<string, string> = {};
  definition.variables.forEach((v) => {
    if (v.kind === 'increment') {
      const start = parseNumeric(v.default_start);
      values[v.key] =
        start != null ? formatIncrement(start, v.format) : v.name || v.key;
    } else {
      values[v.key] = v.default?.trim() ? v.default : v.name || v.key;
    }
  });
  return values;
}

/** Hint shown in properties when an element is bound to a variable. */
export function variableDefaultHint(v: LabelVariable): string {
  if (v.kind === 'increment') {
    const start = parseNumeric(v.default_start);
    const shown = start != null ? formatIncrement(start, v.format) : v.name;
    return `Default: ${shown} (step ${v.default_step})`;
  }
  return v.default?.trim() ? `Default: ${v.default}` : `Preview shows: ${v.name}`;
}

export function emptyPrintForm(definition: LabelDefinition): PrintFormState {
  const text: Record<string, string> = {};
  const increment: Record<string, { start: string; step: string }> = {};
  definition.variables.forEach((v) => {
    if (v.kind === 'increment') {
      increment[v.key] = { start: v.default_start, step: v.default_step };
    } else {
      text[v.key] = v.default ?? '';
    }
  });
  return { text, increment };
}

export function hasIncrementVariables(definition: LabelDefinition): boolean {
  return definition.variables.some((v) => v.kind === 'increment');
}

/** Values for copy index i (0-based): text from form; increment = start + i * step. */
export function valuesForCopy(
  definition: LabelDefinition,
  form: PrintFormState,
  copyIndex: number,
): Record<string, string> {
  const values: Record<string, string> = {};
  definition.variables.forEach((v) => {
    if (v.kind === 'increment') {
      const cfg = form.increment[v.key] ?? {
        start: v.default_start,
        step: v.default_step,
      };
      const start = parseNumeric(cfg.start) ?? 0;
      const step = parseNumeric(cfg.step) ?? 0;
      values[v.key] = formatIncrement(start + copyIndex * step, v.format);
    } else {
      const override = form.text[v.key]?.trim();
      values[v.key] = override || v.default?.trim() || v.name || v.key;
    }
  });
  return values;
}

export function incrementExamples(
  variable: LabelIncrementVariable,
  state: { start: string; step: string } | undefined,
  count = 3,
): string[] {
  const start = parseNumeric(state?.start ?? variable.default_start);
  const step = parseNumeric(state?.step ?? variable.default_step);
  if (start == null || step == null) return [];
  return Array.from({ length: count }, (_, index) =>
    formatIncrement(start + index * step, variable.format),
  );
}

export function validatePrintForm(
  definition: LabelDefinition,
  form: PrintFormState,
): string | null {
  for (const v of definition.variables) {
    if (v.kind !== 'increment') continue;
    const cfg = form.increment[v.key];
    if (!cfg || parseNumeric(cfg.start) == null) {
      return `${v.name}: start must be a number.`;
    }
    if (parseNumeric(cfg.step) == null) {
      return `${v.name}: step must be a number.`;
    }
  }
  return null;
}

export function isIncrementVariable(v: LabelVariable): v is LabelIncrementVariable {
  return v.kind === 'increment';
}
