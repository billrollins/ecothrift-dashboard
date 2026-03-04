import { useCallback, useMemo, useState } from 'react';
import type { GridColDef } from '@mui/x-data-grid';

const STORAGE_PREFIX = 'grid_columns_';

export interface UseGridColumnStateOptions {
  /** localStorage key (will be prefixed). Same key = shared across sessions on this machine. */
  storageKey: string;
  /** Base column definitions. Widths from storage will override. */
  columns: GridColDef[];
}

function loadWidths(key: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
      }
      return out;
    }
  } catch {
    // ignore
  }
  return {};
}

function saveWidths(key: string, widths: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(widths));
  } catch {
    // ignore
  }
}

/**
 * Persists column widths to localStorage so they survive table reloads and sessions.
 * Returns columns with stored widths applied and a handler for DataGrid onColumnWidthChange.
 */
export function useGridColumnState({ storageKey, columns: baseColumns }: UseGridColumnStateOptions): {
  columns: GridColDef[];
  onColumnWidthChange: (params: { colDef: { field: string }; width: number }) => void;
} {
  const [widths, setWidths] = useState<Record<string, number>>(() => loadWidths(storageKey));

  const columns = useMemo(() => {
    return baseColumns.map((col) => {
      const stored = widths[col.field];
      if (stored != null && stored > 0) {
        const { flex, minWidth, ...rest } = col;
        return { ...rest, width: stored } as GridColDef;
      }
      return col;
    });
  }, [baseColumns, widths]);

  const onColumnWidthChange = useCallback(
    (params: { colDef: { field: string }; width: number }) => {
      const { field } = params.colDef;
      const width = params.width;
      if (!field || width <= 0) return;
      setWidths((prev) => {
        const next = { ...prev, [field]: width };
        saveWidths(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return { columns, onColumnWidthChange };
}
