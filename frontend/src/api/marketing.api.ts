import api from './client';

/** Social Studio (`apps/marketing`, Lane F Phase 2). */
export type SocialPostType =
  | 'new_this_week'
  | 'category_spotlight'
  | 'coming_soon'
  | 'weekend_pick'
  | 'live_from_floor'
  | 'scheduled';
export type SocialPostStatus = 'draft' | 'ready' | 'posted';
export type SocialLayout = 'hero' | 'hero3' | 'grid4';
/** Facebook feed sizes now; '9:16' (stories) joins with more channels. */
export type SocialSize = '1:1' | '4:5';
export type SocialCta = '' | 'come_in' | 'message_us' | 'ask_hold';

export interface SocialCheck {
  key: 'photos' | 'hook' | 'where_when' | 'thrift_plus' | 'cta' | 'frame';
  label: string;
  ok: boolean;
  missing: string;
}

export interface SocialPhoto {
  id: number;
  image_url: string | null;
  thumb_url: string | null;
  width: number;
  height: number;
  category: string;
  sku: string;
  note: string;
  uploaded_by_name: string;
  uploaded_at: string | null;
  taken_at: string | null;
  is_archived: boolean;
  used_in: Array<{ post_id: number; slot_date: string }>;
}

export interface SocialPost {
  id: number;
  slot_date: string;
  post_type: SocialPostType;
  post_type_label: string;
  category: string;
  hook: string;
  body: string;
  call_to_action: SocialCta;
  layout: SocialLayout;
  zones: number;
  size: SocialSize;
  status: SocialPostStatus;
  source: 'manual' | 'ai';
  posted_url: string;
  posted_at: string | null;
  posted_by_name: string;
  rating: number | null;
  checks: SocialCheck[];
  passes: boolean;
  photo_ids: number[];
  text: string;
  photos?: SocialPhoto[];
}

export interface SocialBrand {
  address: string;
  hours: string;
  thrift_plus_line: string;
}

export interface SocialRules {
  min_photos: number;
  hook_max_chars: number;
}

export interface SocialWeek {
  start: string;
  prev: string;
  next: string;
  today: string;
  days: Array<{ date: string; open: boolean; post: SocialPost | null }>;
  brand: SocialBrand;
  rules: SocialRules;
  can_rate: boolean;
}

export interface SocialPostDetail extends SocialPost {
  photos: SocialPhoto[];
  brand: SocialBrand;
  rules: SocialRules;
  can_rate: boolean;
}

export const POST_TYPE_LABELS: Record<SocialPostType, string> = {
  new_this_week: 'New this week',
  category_spotlight: 'Category spotlight',
  coming_soon: 'Coming soon',
  weekend_pick: 'Weekend pick + Thrift+',
  live_from_floor: 'Live from the floor',
  scheduled: 'Scheduled',
};

/** What each slot is for (plan, Cadence). */
export const POST_TYPE_IDEAS: Record<SocialPostType, string> = {
  new_this_week: '4 to 8 real photos of the best new stock.',
  category_spotlight: 'One category, its best pieces.',
  coming_soon: 'A truck being unloaded, what is being processed.',
  weekend_pick: 'One standout item, and how members earn ThriftBucks.',
  live_from_floor: 'A quick look at the floor right now.',
  scheduled: "The week's best, set to go out while we are closed.",
};

export const CTA_LABELS: Record<Exclude<SocialCta, ''>, string> = {
  come_in: 'Come in',
  message_us: 'Message us',
  ask_hold: 'Ask for a hold',
};

export const getSocialWeek = (start?: string) =>
  api.get<SocialWeek>('/marketing/week/', { params: start ? { start } : {} }).then((r) => r.data);

export const getTodaysPost = () =>
  api.get<{ date: string; post: SocialPost | null }>('/marketing/today/').then((r) => r.data);

export const getSocialPost = (id: number) =>
  api.get<SocialPostDetail>(`/marketing/posts/${id}/`).then((r) => r.data);

export const patchSocialPost = (
  id: number,
  data: Partial<Pick<SocialPost, 'hook' | 'body' | 'category' | 'call_to_action' | 'layout' | 'size'>>,
) => api.patch<SocialPost>(`/marketing/posts/${id}/`, data).then((r) => r.data);

export const setSocialPostPhotos = (id: number, photoIds: number[]) =>
  api.put<SocialPost>(`/marketing/posts/${id}/photos/`, { photo_ids: photoIds }).then((r) => r.data);

export const swapSocialPosts = (id: number, withId: number) =>
  api.post<SocialPost>(`/marketing/posts/${id}/swap/`, { with: withId }).then((r) => r.data);

export const markSocialPostReady = (id: number) =>
  api.post<SocialPost>(`/marketing/posts/${id}/ready/`).then((r) => r.data);

export const markSocialPostPosted = (id: number, url: string) =>
  api.post<SocialPost>(`/marketing/posts/${id}/posted/`, { url }).then((r) => r.data);

export const rateSocialPost = (id: number, rating: number | null) =>
  api.post<SocialPost>(`/marketing/posts/${id}/rating/`, { rating: rating ?? '' }).then((r) => r.data);

export interface PhotoFilters {
  unused?: boolean;
  category?: string;
  week?: boolean;
}

export const listSocialPhotos = (filters: PhotoFilters = {}) =>
  api.get<{ photos: SocialPhoto[] }>('/marketing/photos/', {
    params: {
      ...(filters.unused ? { unused: 1 } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.week ? { week: 1 } : {}),
    },
  }).then((r) => r.data.photos);

export const uploadSocialPhotos = (files: File[], extra: { category?: string; sku?: string; note?: string } = {}) => {
  const form = new FormData();
  files.forEach((file) => {
    form.append('files', file);
    form.append('taken_ms', String(file.lastModified || ''));
  });
  if (extra.category) form.append('category', extra.category);
  if (extra.sku) form.append('sku', extra.sku);
  if (extra.note) form.append('note', extra.note);
  return api.post<{ photos: SocialPhoto[]; failed: Array<{ name: string; detail: string }> }>(
    '/marketing/photos/', form, { headers: { 'Content-Type': 'multipart/form-data' } },
  ).then((r) => r.data);
};

export const patchSocialPhoto = (
  id: number,
  data: Partial<{ category: string; note: string; sku: string; is_archived: boolean }>,
) => api.patch<SocialPhoto>(`/marketing/photos/${id}/`, data).then((r) => r.data);

/** The full photo as a blob from our own address, so the frame's canvas can export it. */
export const fetchSocialPhotoBlob = (id: number) =>
  api.get<Blob>(`/marketing/photos/${id}/image/`, { responseType: 'blob' }).then((r) => r.data);
