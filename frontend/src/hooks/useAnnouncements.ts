import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResponse } from '../types';
import {
  createAnnouncement,
  deleteAnnouncement,
  deleteAnnouncementImage,
  duplicateAnnouncement,
  getAnnouncement,
  getAnnouncements,
  reorderAnnouncementImages,
  toggleAnnouncement,
  updateAnnouncement,
  updateAnnouncementImageAlt,
  uploadAnnouncementImage,
  type Announcement,
  type AnnouncementWrite,
} from '../api/webstore.api';

const LIST_KEY = ['announcements'];

function unwrapList(data: PaginatedResponse<Announcement> | Announcement[]): Announcement[] {
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export function useAnnouncements(params?: { status?: string; q?: string }) {
  return useQuery({
    queryKey: [...LIST_KEY, params?.status ?? '', params?.q ?? ''],
    queryFn: async () => unwrapList((await getAnnouncements(params)).data),
  });
}

export function useAnnouncement(id: number | undefined) {
  return useQuery({
    queryKey: [...LIST_KEY, 'detail', id],
    queryFn: async () => (await getAnnouncement(id as number)).data,
    enabled: typeof id === 'number' && id > 0,
  });
}

function invalidateAnnouncements(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: LIST_KEY });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AnnouncementWrite) => createAnnouncement(data).then((r) => r.data),
    onSuccess: () => invalidateAnnouncements(queryClient),
  });
}

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: AnnouncementWrite }) =>
      updateAnnouncement(id, data).then((r) => r.data),
    onSuccess: () => invalidateAnnouncements(queryClient),
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAnnouncement(id),
    onSuccess: () => invalidateAnnouncements(queryClient),
  });
}

export function useToggleAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive?: boolean }) =>
      toggleAnnouncement(id, isActive).then((r) => r.data),
    onSuccess: () => invalidateAnnouncements(queryClient),
  });
}

export function useDuplicateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => duplicateAnnouncement(id).then((r) => r.data),
    onSuccess: () => invalidateAnnouncements(queryClient),
  });
}

export function useUploadAnnouncementImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file, alt }: { id: number; file: File; alt?: string }) =>
      uploadAnnouncementImage(id, file, alt).then((r) => r.data),
    onSuccess: () => invalidateAnnouncements(queryClient),
  });
}

export function useDeleteAnnouncementImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ announcementId, imageId }: { announcementId: number; imageId: number }) =>
      deleteAnnouncementImage(announcementId, imageId),
    onSuccess: () => invalidateAnnouncements(queryClient),
  });
}

export function useUpdateAnnouncementImageAlt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      announcementId,
      imageId,
      alt,
    }: {
      announcementId: number;
      imageId: number;
      alt: string;
    }) => updateAnnouncementImageAlt(announcementId, imageId, alt).then((r) => r.data),
    onSuccess: () => invalidateAnnouncements(queryClient),
  });
}

export function useReorderAnnouncementImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ announcementId, order }: { announcementId: number; order: number[] }) =>
      reorderAnnouncementImages(announcementId, order).then((r) => r.data),
    onSuccess: () => invalidateAnnouncements(queryClient),
  });
}
