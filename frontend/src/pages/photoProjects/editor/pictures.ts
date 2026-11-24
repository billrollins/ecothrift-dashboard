/** Photo project pictures as blobs (Raw or a version, full size or thumbnail). A file never changes, so it is kept. */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPictureBlob } from '../../../api/photoProjects.api';

export function usePictureBlob(photoId: number, version: number | null, size: 'file' | 'thumb', enabled = true) {
  return useQuery({
    // Its own root key: invalidating ['photoProjects'] after an edit must not download every picture again.
    queryKey: ['photoPictures', photoId, version, size],
    queryFn: () => getPictureBlob(photoId, version, size),
    enabled,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
  });
}

export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return undefined;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** The picture decoded, ready to draw; null while it loads. */
export function useLoadedImage(blob: Blob | null | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImg(null);
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    const el = new Image();
    let alive = true;
    el.onload = () => {
      if (alive) setImg(el);
    };
    el.src = url;
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return img;
}
