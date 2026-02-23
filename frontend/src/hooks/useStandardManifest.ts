import { useEffect, useMemo, useState } from 'react';
import type {
  FormulaMapping,
  ManifestColumnMapping,
  StandardColumnDefinition,
  StandardManifestMapping,
} from '../api/inventory.api';

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

const FALLBACK_STANDARD_COLUMNS: StandardColumnDefinition[] = [
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'description', label: 'Description', required: true },
  { key: 'title', label: 'Title', required: false },
  { key: 'brand', label: 'Brand', required: false },
  { key: 'model', label: 'Model', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'condition', label: 'Condition', required: false },
  { key: 'retail_value', label: 'Retail Cost', required: false },
  { key: 'upc', label: 'UPC', required: false },
  { key: 'vendor_item_number', label: 'Vendor Item #', required: false },
  { key: 'notes', label: 'Notes', required: false },
];

const SOURCE_ALIASES: Record<string, string[]> = {
  quantity: ['quantity', 'qty', 'units', 'count', 'qnty'],
  description: ['description', 'item description', 'product', 'item'],
  title: ['title', 'product name', 'item name', 'name'],
  brand: ['brand', 'manufacturer'],
  model: ['model', 'model_number', 'model number'],
  category: ['category', 'department'],
  condition: ['condition', 'item condition'],
  retail_value: ['retail_value', 'retail value', 'unit_cost', 'unit cost', 'cost', 'price'],
  upc: ['upc', 'upc/ean', 'barcode'],
  vendor_item_number: ['vendor_item_number', 'vendor item number', 'item #', 'item number', 'tcin', 'sku'],
  notes: ['notes', 'comment'],
};

/**
 * Convert a legacy mapping (source + transforms[]) to an expression formula string.
 * E.g. source="Description", transforms=[{type:"trim"},{type:"title_case"}]
 *   => TITLE(TRIM([Description]))
 */
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

function autoFormulaForField(headers: string[], fieldKey: string): string {
  const aliases = SOURCE_ALIASES[fieldKey] ?? [];
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

function buildFormulas(
  headers: string[],
  columns: StandardColumnDefinition[],
  mappings: ManifestColumnMapping[],
): Record<string, string> {
  const formulasByTarget: Record<string, string> = {};
  const mappingByTarget = new Map(mappings.map((m) => [m.target, m]));

  for (const col of columns) {
    const existing = mappingByTarget.get(col.key);
    if (existing) {
      const formula = (existing as unknown as Record<string, unknown>).formula;
      if (typeof formula === 'string' && formula.trim()) {
        formulasByTarget[col.key] = formula;
      } else if (existing.source) {
        const transforms: Array<{ type: string; from?: string; to?: string }> = [];
        if (Array.isArray(existing.transforms)) {
          for (const t of existing.transforms) {
            if (typeof t === 'object' && t && 'type' in t) {
              transforms.push(t as { type: string; from?: string; to?: string });
            }
          }
        }
        formulasByTarget[col.key] = legacyMappingToFormula(existing.source, transforms);
      } else {
        formulasByTarget[col.key] = autoFormulaForField(headers, col.key);
      }
    } else {
      formulasByTarget[col.key] = autoFormulaForField(headers, col.key);
    }
  }
  return formulasByTarget;
}

interface UseStandardManifestArgs {
  signature: string;
  headers: string[];
  standardColumns?: StandardColumnDefinition[];
  initialMappings?: ManifestColumnMapping[];
}

export function useStandardManifest({
  signature,
  headers,
  standardColumns,
  initialMappings,
}: UseStandardManifestArgs) {
  const columns = useMemo(
    () => (standardColumns?.length ? standardColumns : FALLBACK_STANDARD_COLUMNS),
    [standardColumns],
  );

  const [formulas, setFormulas] = useState<Record<string, string>>({});

  useEffect(() => {
    setFormulas(buildFormulas(headers, columns, initialMappings ?? []));
  }, [signature, headers, columns, initialMappings]);

  const setFormula = (target: string, expression: string) => {
    setFormulas((prev) => ({ ...prev, [target]: expression }));
  };

  const setAllFormulas = (newFormulas: Record<string, string>) => {
    setFormulas((prev) => ({ ...prev, ...newFormulas }));
  };

  const formulaMappings = useMemo<FormulaMapping[]>(
    () =>
      columns.map((col) => ({
        target: col.key,
        formula: formulas[col.key] ?? '',
      })),
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

  const hasMapping = (field: string): boolean => {
    const f = formulas[field]?.trim();
    return !!f;
  };

  return {
    columns,
    formulas,
    setFormula,
    setAllFormulas,
    setFormulas,
    formulaMappings,
    standardMappings,
    hasMapping,
  };
}
