import api from './client';
import type { PaginatedResponse } from '../types';

// ── Types (mirror apps/blog/serializers.py · BlogPostStaffSerializer) ──────────

export type BlogStatus = 'draft' | 'scheduled' | 'published' | 'archived';

/** TipTap document JSON; opaque to the API layer. */
export type BlogDoc = Record<string, unknown>;

export interface BlogHero {
  id: number;
  url: string;
  alt: string;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  series: number | null;
  series_name: string | null;
  series_slug: string | null;
  author_name: string;
  author_role: string;
  excerpt: string;
  body_json: BlogDoc;
  body_html: string;
  body_text: string;
  tags: string;
  hero_image: number | null;
  hero: BlogHero | null;
  hero_alt: string;
  status: BlogStatus;
  status_display: string;
  published_at: string | null;
  scheduled_for: string | null;
  meta_title: string;
  meta_description: string;
  is_live: boolean;
  word_count: number;
  reading_minutes: number;
  revision_count: number;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface BlogSeries {
  id: number;
  name: string;
  slug: string;
  description: string;
  position: number;
  is_active: boolean;
  post_count: number;
  created_at: string;
  updated_at: string;
}

export interface BlogImage {
  id: number;
  alt: string;
  url: string;
  created_at: string;
}

export interface BlogPostParams {
  search?: string;
  status?: BlogStatus;
  series?: number;
  ordering?: string;
  page_size?: number;
  [key: string]: unknown;
}

const stripMultipartContentType = [
  (body: unknown, headers: Record<string, unknown>) => {
    if (body instanceof FormData) delete headers['Content-Type'];
    return body;
  },
];

// ── Posts ──────────────────────────────────────────────────────────────────

export function getBlogPosts(
  params?: BlogPostParams,
): Promise<{ data: PaginatedResponse<BlogPost> }> {
  return api.get('/blog/posts/', { params: { page_size: 200, ordering: '-updated_at', ...params } });
}

export function getBlogPost(id: number): Promise<{ data: BlogPost }> {
  return api.get(`/blog/posts/${id}/`);
}

export function createBlogPost(data: Record<string, unknown>): Promise<{ data: BlogPost }> {
  return api.post('/blog/posts/', data);
}

export function updateBlogPost(
  id: number,
  data: Record<string, unknown>,
): Promise<{ data: BlogPost }> {
  return api.patch(`/blog/posts/${id}/`, data);
}

export function deleteBlogPost(id: number): Promise<unknown> {
  return api.delete(`/blog/posts/${id}/`);
}

export function publishBlogPostNow(id: number): Promise<{ data: BlogPost }> {
  return api.post(`/blog/posts/${id}/publish-now/`);
}

export function scheduleBlogPost(id: number, scheduledFor: string): Promise<{ data: BlogPost }> {
  return api.post(`/blog/posts/${id}/schedule/`, { scheduled_for: scheduledFor });
}

export function archiveBlogPost(id: number): Promise<{ data: BlogPost }> {
  return api.post(`/blog/posts/${id}/archive/`);
}

export function duplicateBlogPost(id: number): Promise<{ data: BlogPost }> {
  return api.post(`/blog/posts/${id}/duplicate/`);
}

// ── Series ─────────────────────────────────────────────────────────────────

export function getBlogSeries(): Promise<{ data: PaginatedResponse<BlogSeries> }> {
  return api.get('/blog/series/', { params: { page_size: 200, ordering: 'position' } });
}

export function createBlogSeries(data: { name: string; description?: string }): Promise<{ data: BlogSeries }> {
  return api.post('/blog/series/', data);
}

export function updateBlogSeries(
  id: number,
  data: { name?: string; description?: string; position?: number; is_active?: boolean },
): Promise<{ data: BlogSeries }> {
  return api.patch(`/blog/series/${id}/`, data);
}

// ── Images ─────────────────────────────────────────────────────────────────

export function uploadBlogImage(file: File, alt?: string): Promise<{ data: BlogImage }> {
  const form = new FormData();
  form.append('file', file);
  if (alt) form.append('alt', alt);
  return api.post('/blog/images/', form, { transformRequest: stripMultipartContentType });
}
