import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveBlogPost,
  createBlogPost,
  createBlogSeries,
  updateBlogSeries,
  deleteBlogPost,
  duplicateBlogPost,
  getBlogPosts,
  getBlogSeries,
  publishBlogPostNow,
  scheduleBlogPost,
  updateBlogPost,
  uploadBlogImage,
  type BlogPost,
  type BlogPostParams,
  type BlogSeries,
} from '../api/blog.api';

const POSTS_KEY = 'blogPosts';
const SERIES_KEY = 'blogSeries';

export function useBlogPosts(params?: BlogPostParams) {
  return useQuery<BlogPost[]>({
    queryKey: [POSTS_KEY, params ?? {}],
    queryFn: async () => {
      const { data } = await getBlogPosts(params);
      return data.results;
    },
    staleTime: 15_000,
  });
}

export function useBlogSeriesList() {
  return useQuery<BlogSeries[]>({
    queryKey: [SERIES_KEY],
    queryFn: async () => {
      const { data } = await getBlogSeries();
      return data.results;
    },
    staleTime: 60_000,
  });
}

/** Invalidate every post/series query (post lists carry series post-counts). */
function invalidateBlog(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [POSTS_KEY] });
  queryClient.invalidateQueries({ queryKey: [SERIES_KEY] });
}

export function useCreateBlogPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => (await createBlogPost(data)).data,
    onSuccess: () => invalidateBlog(queryClient),
  });
}

export function useUpdateBlogPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      (await updateBlogPost(id, data)).data,
    onSuccess: () => invalidateBlog(queryClient),
  });
}

export function useDeleteBlogPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await deleteBlogPost(id);
    },
    onSuccess: () => invalidateBlog(queryClient),
  });
}

export function usePublishBlogPostNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await publishBlogPostNow(id)).data,
    onSuccess: () => invalidateBlog(queryClient),
  });
}

export function useScheduleBlogPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, scheduledFor }: { id: number; scheduledFor: string }) =>
      (await scheduleBlogPost(id, scheduledFor)).data,
    onSuccess: () => invalidateBlog(queryClient),
  });
}

export function useArchiveBlogPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await archiveBlogPost(id)).data,
    onSuccess: () => invalidateBlog(queryClient),
  });
}

export function useDuplicateBlogPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await duplicateBlogPost(id)).data,
    onSuccess: () => invalidateBlog(queryClient),
  });
}

export function useCreateBlogSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) =>
      (await createBlogSeries(data)).data,
    onSuccess: () => invalidateBlog(queryClient),
  });
}

export function useUpdateBlogSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string } }) =>
      (await updateBlogSeries(id, data)).data,
    onSuccess: () => invalidateBlog(queryClient),
  });
}

export function useUploadBlogImage() {
  return useMutation({
    mutationFn: async ({ file, alt }: { file: File; alt?: string }) =>
      (await uploadBlogImage(file, alt)).data,
  });
}
