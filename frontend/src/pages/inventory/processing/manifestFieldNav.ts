import { createContext, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { createElement } from 'react';

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

export const MANIFEST_FIELD_TAB_ORDER: ManifestFieldId[] = [
  'title',
  'brand',
  'model',
  'category',
  'unitRetail',
  'price',
  'identifiers',
  'tags',
  'notes',
];

export interface ManifestFieldNavContextValue {
  registerOpener: (id: ManifestFieldId, open: () => void) => () => void;
  focusAdjacent: (current: ManifestFieldId, direction: 1 | -1) => void;
}

export const ManifestFieldNavContext = createContext<ManifestFieldNavContextValue | null>(null);

export function ManifestFieldNavProvider({ children }: { children: ReactNode }) {
  const openersRef = useRef(new Map<ManifestFieldId, () => void>());

  const registerOpener = useCallback((id: ManifestFieldId, open: () => void) => {
    openersRef.current.set(id, open);
    return () => {
      openersRef.current.delete(id);
    };
  }, []);

  const focusAdjacent = useCallback((current: ManifestFieldId, direction: 1 | -1) => {
    const idx = MANIFEST_FIELD_TAB_ORDER.indexOf(current);
    if (idx < 0) return;
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= MANIFEST_FIELD_TAB_ORDER.length) return;
    const nextId = MANIFEST_FIELD_TAB_ORDER[nextIdx];
    window.setTimeout(() => {
      openersRef.current.get(nextId)?.();
    }, 0);
  }, []);

  const value = useMemo(
    () => ({ registerOpener, focusAdjacent }),
    [registerOpener, focusAdjacent],
  );

  return createElement(ManifestFieldNavContext.Provider, { value }, children);
}
