import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  addPhotoDrop,
  deletePhotoDrop,
  getPhotoDropThumb,
  getPhotoDrops,
  type PhotoDropDTO,
} from '../api/photoDrops.api';

export const photoDropsKey = ['photoDrops'] as const;

/** A photo taken on the phone shows on the computer within this long. */
export const PHOTO_DRAWER_REFRESH_MS = 4_000;

/** My photo drawer, newest first. `live` keeps it fresh while a drawer is on screen. */
export function usePhotoDrops(options: { enabled?: boolean; live?: boolean } = {}) {
  const { enabled = true, live = false } = options;
  return useQuery({
    queryKey: photoDropsKey,
    queryFn: async () => (await getPhotoDrops()).data,
    enabled,
    refetchInterval: live ? PHOTO_DRAWER_REFRESH_MS : false,
  });
}

/** Photos saved from this window. They are the person's own doing, so a held drawer never keeps them back. */
const SAVED_HERE = new Set<number>();

export function useAddPhotoDrop() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ photo, replaces }: { photo: Blob; replaces?: number }) => (await addPhotoDrop(photo, replaces)).data,
    onSuccess: (drop, { replaces }) => {
      SAVED_HERE.add(drop.id);
      client.setQueryData<PhotoDropDTO[]>(photoDropsKey, (rows) => {
        const rest = (rows ?? []).filter((row) => row.id !== drop.id);
        // A turned or cropped copy stays where the photo was.
        if (replaces != null && rest.some((row) => row.id === replaces)) {
          return rest.map((row) => (row.id === replaces ? drop : row));
        }
        return [drop, ...rest];
      });
    },
  });
}

export function useDeletePhotoDrop() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await deletePhotoDrop(id);
      return id;
    },
    onSuccess: (id) => {
      client.setQueryData<PhotoDropDTO[]>(photoDropsKey, (rows) => (rows ?? []).filter((row) => row.id !== id));
    },
  });
}

/**
 * The drawer refreshes by itself, but a photo that arrives must not slide the tiles under a hand that is about to
 * pick one. While `hold` is on (the pointer is over the grid, or a finger is down), new photos wait; they show the
 * moment it lets go. Deleted photos still go at once, and photos saved from this window show at once.
 */
export function useSteadyDrops(drops: PhotoDropDTO[]) {
  const [hold, setHold] = useState(false);
  const [shown, setShown] = useState<PhotoDropDTO[]>(drops);
  useEffect(() => {
    // While held: keep what is on screen in place (with fresh Used marks); drop what was deleted; hold back what is
    // new. A photo saved from this window (a new one, a retry, a turned copy) shows where it belongs at once.
    setShown((current) => {
      const onScreen = new Set(current.map((row) => row.id));
      const next = hold ? drops.filter((row) => onScreen.has(row.id) || SAVED_HERE.has(row.id)) : drops;
      // Same rows as before: keep the old list, so a caller's fresh empty list on each render cannot loop.
      return next.length === current.length && next.every((row, index) => row === current[index]) ? current : next;
    });
  }, [drops, hold]);
  const waiting = hold ? drops.filter((row) => !shown.some((seen) => seen.id === row.id)).length : 0;
  const holdProps = {
    onPointerEnter: (event: ReactPointerEvent) => {
      if (event.pointerType === 'mouse') setHold(true);
    },
    onPointerLeave: () => setHold(false),
    onPointerDown: () => setHold(true),
    onPointerUp: (event: ReactPointerEvent) => {
      if (event.pointerType !== 'mouse') window.setTimeout(() => setHold(false), 400);
    },
  };
  return { drops: shown, waiting, holdProps };
}

/** The small picture of one drop as an object URL (the file is behind the sign-in, so an img src cannot load it). */
export const photoDropThumbKey = (id: number | null) => ['photoDrops', 'thumb', id] as const;

export function usePhotoDropThumb(id: number | null): string | null {
  const { data } = useQuery({
    queryKey: photoDropThumbKey(id),
    queryFn: async () => (await getPhotoDropThumb(id as number)).data,
    enabled: id !== null,
    staleTime: Infinity,
    // A drawer photo never changes, so its small picture is kept for the whole visit, not fetched again each time
    // a drawer opens.
    gcTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data) {
      setUrl(null);
      return undefined;
    }
    const next = URL.createObjectURL(data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [data]);
  return url;
}
