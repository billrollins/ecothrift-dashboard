import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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

export function useAddPhotoDrop() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (photo: Blob) => (await addPhotoDrop(photo)).data,
    onSuccess: (drop) => {
      client.setQueryData<PhotoDropDTO[]>(photoDropsKey, (rows) => [drop, ...(rows ?? []).filter((row) => row.id !== drop.id)]);
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

/** The small picture of one drop as an object URL (the file is behind the sign-in, so an img src cannot load it). */
export function usePhotoDropThumb(id: number): string | null {
  const { data } = useQuery({
    queryKey: ['photoDrops', 'thumb', id],
    queryFn: async () => (await getPhotoDropThumb(id)).data,
    staleTime: Infinity,
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
