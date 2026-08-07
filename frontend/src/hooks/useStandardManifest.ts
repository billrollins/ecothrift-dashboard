import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  FormulaMapping,
  ManifestColumnMapping,
  StandardColumnDefinition,
  StandardManifestMapping,
} from '../api/inventory.api';
import { prepS1 } from '../utils/preprocessingStep1Diag';

export type StandardFunctionId =
  | 'trim'
  | 'title_case'
  | 'upper'
  | 'lower'
  | 'remove_special_chars'
  | 'replace';

export interface StandardFunctionStep {
  id: StandardFunctionId;
  from?: string;
  to?: string;
}

export interface StandardManifestRule {
  standard_column: string;
  source_header: string;
  functions: StandardFunctionStep[];
}

/** lowercase header token → canonical flat formula target key */
const FLAT_HINT_ALIASES: Record<string, string[]> = {
  quantity: ['quantity', 'qty', 'units', 'count', 'qnty'],
  unit_retail: [
    'unit retail',
    'unit_retail',
    'unit retail price',
    'retail price',
    'msrp',
    'list price',
    'stated retail',
    'vendor retail',
    'original retail',
    'ext retail',
    'ext. retail',
    'extended retail',
    'total retail',
    'retail value',
    'retail_value',
    'price',
    'unit_cost',
    'unit cost',
    'cost',
  ],
  description: ['description', 'item description', 'product', 'item'],
  brand: ['brand', 'manufacturer', 'vendor'],
  model: ['model', 'model_number', 'model number'],
  condition: ['condition', 'item condition', 'current_condition', 'used_fair', 'used_good', 'used_like_new'],
  notes: ['notes', 'comment'],
  search_tags: ['tags', 'search_tags', 'tag'],
  title: ['title', 'product name', 'item name', 'name'],
};

type MappingLike = ManifestColumnMapping & {
  target?: string;
  formula?: string;
  transforms?: Array<{ type: string; from?: string; to?: string }>;
};

function legacyMappingToFormula(source: string, transforms: Array<{ type: string; from?: string; to?: string }>): string {
  if (!source) return '';
  let expr = `[${source}]`;
  for (const t of transforms) {
    switch (t.type) {
      case 'trim':
        expr = `TRIM(${expr})`;
        break;
      case 'title_case':
        expr = `TITLE(${expr})`;
        break;
      case 'upper':
        expr = `UPPER(${expr})`;
        break;
      case 'lower':
        expr = `LOWER(${expr})`;
        break;
      case 'remove_special_chars':
        expr = `REPLACE(${expr}, "[^a-zA-Z0-9 ]", "")`;
        break;
      case 'replace':
        expr = `REPLACE(${expr}, "${(t.from ?? '').replace(/"/g, '\\"')}", "${(t.to ?? '').replace(/"/g, '\\"')}")`;
        break;
    }
  }
  return expr;
}

function extractFormulaFromMapping(m: MappingLike): string {
  if (typeof m.formula === 'string' && m.formula.trim()) return m.formula.trim();
  if (typeof m.source === 'string' && m.source.trim()) {
    const transforms: Array<{ type: string; from?: string; to?: string }> = [];
    if (Array.isArray(m.transforms)) {
      for (const t of m.transforms) {
        if (typeof t === 'object' && t && 'type' in t) {
          transforms.push(t as { type: string; from?: string; to?: string });
        }
      }
    }
    return legacyMappingToFormula(m.source, transforms);
  }
  return '';
}

function autoFormulaForFlatField(headers: string[], fieldKey: string): string {
  const aliases = FLAT_HINT_ALIASES[fieldKey] ?? [];
  const normalizedHeaders = headers.map((h) => ({
    original: h,
    normalized: h.trim().toLowerCase(),
  }));
  for (const alias of aliases) {
    const found = normalizedHeaders.find((h) => h.normalized === alias);
    if (found) return `[${found.original}]`;
  }
  return '';
}

function mappingsByTarget(mappings: ManifestColumnMapping[]): Map<string, MappingLike> {
  const out = new Map<string, MappingLike>();
  for (const raw of mappings) {
    const m = raw as MappingLike;
    const t = (m.target ?? '').trim();
    if (t) out.set(t, m);
  }
  return out;
}

export function buildFormulas(
  headers: string[],
  columns: StandardColumnDefinition[],
  mappings: ManifestColumnMapping[],
): Record<string, string> {
  const formulasByTarget: Record<string, string> = {};
  const byTarget = mappingsByTarget(mappings);

  for (const col of columns) {
    const existing = byTarget.get(col.key);
    if (existing) {
      const f = extractFormulaFromMapping(existing);
      formulasByTarget[col.key] = f || autoFormulaForFlatField(headers, col.key);
    } else {
      formulasByTarget[col.key] = autoFormulaForFlatField(headers, col.key);
    }
  }

  for (const [t, m] of byTarget.entries()) {
    if (!t.includes('.')) continue;
    const f = extractFormulaFromMapping(m);
    if (f) formulasByTarget[t] = f;
  }

  return formulasByTarget;
}

export function nonemptyFormulaMappings(
  columns: StandardColumnDefinition[],
  formulas: Record<string, string>,
): FormulaMapping[] {
  const out: FormulaMapping[] = [];
  for (const col of columns) {
    const f = (formulas[col.key] ?? '').trim();
    if (f) out.push({ target: col.key, formula: formulas[col.key] ?? '' });
  }
  const dotted = Object.keys(formulas)
    .filter((k) => k.includes('.'))
    .sort((a, b) => a.localeCompare(b));
  for (const k of dotted) {
    const f = (formulas[k] ?? '').trim();
    if (f) out.push({ target: k, formula: formulas[k] ?? '' });
  }
  return out;
}

interface UseStandardManifestArgs {
  manifestSessionKey: number;
  signature: string;
  headers: string[];
  /** From GET /inventory/manifest-fields/ ``flat``; required - parent gates loading */
  flatColumns: StandardColumnDefinition[];
  initialMappings?: ManifestColumnMapping[];
}

export function useStandardManifest({
  manifestSessionKey,
  signature,
  headers,
  flatColumns,
  initialMappings,
}: UseStandardManifestArgs) {
  const columns = useMemo(() => flatColumns ?? [], [flatColumns]);

  const headersSignature = headers.join('\x00');
  const mappingsSignature = JSON.stringify(initialMappings ?? []);

  const builtFormulas = useMemo(
    () => buildFormulas(headers, columns, initialMappings ?? []),
    [signature, headersSignature, mappingsSignature, columns, headers],
  );

  const sessionAnchorRef = useRef(manifestSessionKey);
  const sessionMismatchRender = sessionAnchorRef.current !== manifestSessionKey;

  const [formulaDelta, setFormulaDelta] = useState<Record<string, string>>({});

  const formulas = useMemo(() => {
    if (sessionMismatchRender) return builtFormulas;
    return { ...builtFormulas, ...formulaDelta };
  }, [builtFormulas, formulaDelta, sessionMismatchRender]);

  useLayoutEffect(() => {
    sessionAnchorRef.current = manifestSessionKey;
  }, [manifestSessionKey]);

  useLayoutEffect(() => {
    setFormulaDelta({});
  }, [manifestSessionKey, signature, headersSignature, mappingsSignature]);

  useLayoutEffect(() => {
    if (!import.meta.env.DEV) return;
    prepS1('useStandardManifest: builtFormulas (sync) + merge state', {
      manifestSessionKey,
      sessionMismatchRender,
      signatureLen: signature.length,
      headersCount: headers.length,
      builtNonEmptyFields: Object.entries(builtFormulas)
        .filter(([, v]) => (v ?? '').trim())
        .map(([k]) => k),
      deltaKeys: Object.keys(formulaDelta),
      mergedNonEmptyFields: Object.entries(formulas)
        .filter(([, v]) => (v ?? '').trim())
        .map(([k]) => k),
    });
  }, [
    manifestSessionKey,
    sessionMismatchRender,
    signature,
    headers.length,
    builtFormulas,
    formulaDelta,
    formulas,
  ]);

  const setFormula = (target: string, expression: string) => {
    setFormulaDelta((prev) => ({ ...prev, [target]: expression }));
  };

  const setAllFormulas = (newFormulas: Record<string, string>) => {
    setFormulaDelta((prev) => ({ ...prev, ...newFormulas }));
  };

  const setFormulas = (next: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
    setFormulaDelta((delta) => {
      const current = { ...builtFormulas, ...delta };
      const resolved = typeof next === 'function' ? next(current) : next;
      const keySet = new Set<string>([
        ...columns.map((c) => c.key),
        ...Object.keys(resolved),
        ...Object.keys(builtFormulas),
      ]);
      const out: Record<string, string> = {};
      for (const k of keySet) {
        const nv = resolved[k] ?? '';
        const bv = builtFormulas[k] ?? '';
        if ((nv.trim() !== bv.trim())) {
          out[k] = nv;
        }
      }
      return out;
    });
  };

  const replaceBucketFormulas = useCallback(
    (bucketPrefix: string, pairs: Array<{ target: string; formula: string }>) => {
      setFormulaDelta((delta) => {
        const merged = { ...builtFormulas, ...delta };
        const nextMerged = { ...merged };
        for (const key of Object.keys(nextMerged)) {
          if (key.startsWith(`${bucketPrefix}.`)) delete nextMerged[key];
        }
        for (const { target, formula } of pairs) {
          if (!target.startsWith(`${bucketPrefix}.`)) continue;
          if (formula.trim()) nextMerged[target] = formula.trim();
        }
        const out: Record<string, string> = {};
        const ks = new Set<string>([...Object.keys(nextMerged), ...Object.keys(builtFormulas)]);
        for (const k of ks) {
          const a = (nextMerged[k] ?? '').trim();
          const b = (builtFormulas[k] ?? '').trim();
          if (a !== b) out[k] = nextMerged[k] ?? '';
        }
        return out;
      });
    },
    [builtFormulas],
  );

  const formulaMappings = useMemo<FormulaMapping[]>(
    () => nonemptyFormulaMappings(columns, formulas),
    [columns, formulas],
  );

  const standardMappings = useMemo<StandardManifestMapping[]>(
    () =>
      columns.map((col) => ({
        standard_column: col.key,
        source_header: '',
        functions: [],
      })),
    [columns],
  );

  const hasMapping = (field: string): boolean => !!(formulas[field]?.trim());

  return {
    columns,
    formulas,
    setFormula,
    setAllFormulas,
    setFormulas,
    replaceBucketFormulas,
    formulaMappings,
    standardMappings,
    hasMapping,
  };
}
