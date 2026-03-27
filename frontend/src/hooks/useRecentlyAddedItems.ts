import { useCallback, useRef, useState } from 'react';
import type { Item } from '../types/inventory.types';

const TEN_MIN_MS = 10 * 60 * 1000;

/** Track item IDs for "NEW" chip on the items grid; clears each id after 10 minutes. */
export function useRecentlyAddedItems() {
  const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<number>>(() => new Set());
  const timeoutsRef = useRef<Map<number, number>>(new Map());

  const onItemCreated = useCallback((item: Item) => {
    setRecentlyAddedIds((prev) => new Set(prev).add(item.id));
    const t = window.setTimeout(() => {
      setRecentlyAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      timeoutsRef.current.delete(item.id);
    }, TEN_MIN_MS);
    const prev = timeoutsRef.current.get(item.id);
    if (prev) window.clearTimeout(prev);
    timeoutsRef.current.set(item.id, t);
  }, []);

  return { recentlyAddedIds, onItemCreated };
}
