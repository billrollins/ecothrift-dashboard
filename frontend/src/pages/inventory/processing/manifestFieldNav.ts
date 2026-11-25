import { createContext, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { createElement } from 'react';
import { ROW_EDIT_FIELDS, type RowEditField } from './processingRowEdits';

export type ManifestFieldId =
  | 'title'
  | 'brand'
  | 'model'
  | 'category'
  | 'identifiers'
  | 'unitRetail'
  | 'price'
  | 'tags'
  | 'notes';

/**
 * The fields Tab and Enter walk, left to right: the ones typed in place on the row (#230). Identifiers, Tags and
 * Notes hold several values and open in a window on a click, so they are not in the walk.
 */
export const MANIFEST_FIELD_TAB_ORDER: ManifestFieldId[] = [...ROW_EDIT_FIELDS];

export interface ManifestFieldNavContextValue {
  registerOpener: (id: ManifestFieldId, open: () => void) => () => void;
  focusAdjacent: (current: ManifestFieldId, direction: 1 | -1) => void;
  /** Where the cursor goes after the last field (the row's "Apply changes" button). */
  registerEnd: (focus: () => void) => () => void;
}

export const ManifestFieldNavContext = createContext<ManifestFieldNavContextValue | null>(null);

export function ManifestFieldNavProvider({ children }: { children: ReactNode }) {
  const openersRef = useRef(new Map<ManifestFieldId, () => void>());
  const endRef = useRef<(() => void) | null>(null);

  const registerOpener = useCallback((id: ManifestFieldId, open: () => void) => {
    openersRef.current.set(id, open);
    return () => {
      openersRef.current.delete(id);
    };
  }, []);

  const registerEnd = useCallback((focus: () => void) => {
    endRef.current = focus;
    return () => {
      if (endRef.current === focus) endRef.current = null;
    };
  }, []);

  const focusAdjacent = useCallback((current: ManifestFieldId, direction: 1 | -1) => {
    const idx = MANIFEST_FIELD_TAB_ORDER.indexOf(current);
    if (idx < 0) return;
    const nextIdx = idx + direction;
    if (nextIdx < 0) return;
    if (nextIdx >= MANIFEST_FIELD_TAB_ORDER.length) {
      // Past the last field: on to "Apply changes" (after this render, when it is enabled).
      window.setTimeout(() => endRef.current?.(), 0);
      return;
    }
    const nextId = MANIFEST_FIELD_TAB_ORDER[nextIdx];
    window.setTimeout(() => {
      openersRef.current.get(nextId)?.();
    }, 0);
  }, []);

  const value = useMemo(
    () => ({ registerOpener, focusAdjacent, registerEnd }),
    [registerOpener, focusAdjacent, registerEnd],
  );

  return createElement(ManifestFieldNavContext.Provider, { value }, children);
}

export type { RowEditField };
