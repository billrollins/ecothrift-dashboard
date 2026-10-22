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
/** Facebook feed sizes now; '9:16' (stories) joins with more channels. Each photo goes out at this size. */
export type SocialSize = '1:1' | '4:5';
/** Every photo size a channel takes: the feed sizes, 9:16 (Stories, TikTok) and 4:3 (Google Business Profile). */
export type PhotoSize = SocialSize | '9:16' | '4:3';

/** The channels a post can go out on (Phase 6, owner call F4). */
export type SocialChannel = 'facebook' | 'instagram' | 'google' | 'nextdoor' | 'tiktok';

/** One channel in Post it: its own words, photo sizes and posted link. */
export interface PostChannel {
  key: SocialChannel;
  label: string;
  /** The first is the default; Instagram also offers 9:16 for a Story. */
  sizes: PhotoSize[];
  text: string;
  max_chars: number;
  /** How to post it there, in one line. */
  how: string;
  posted_url: string;
  posted_at: string | null;
  posted_by_name: string;
}

/** A channel's numbers still owed: after 1 day or after 7 days. */
export interface NumbersDue {
  channel: SocialChannel;
  label: string;
  mark: 1 | 7;
}
export type SocialCta = '' | 'come_in' | 'message_us' | 'ask_hold';

export interface SocialCheck {
  key: 'photos' | 'hook' | 'where_when' | 'thrift_plus' | 'cta' | 'tags';
  label: string;
  ok: boolean;
  missing: string;
}

/**
 * The facts the tag overlay draws for one item (`/api/marketing/tag/<sku>/`): the member scanner's card, with the
 * tag's own retail (only when it passed the retail check). Money is a string of dollars; ThriftBucks never get "$".
 */
export interface SocialTag {
  sku: string;
  title: string;
  price: string;
  retail: string | null;
  /** Today's ThriftBucks for a member; null when none. */
  thriftbucks: string | null;
  /** false = AS IS. */
  returnable: boolean;
  return_note: string;
  age_restricted: boolean;
  /** false = sold or off the floor. */
  available: boolean;
}

export type SocialTagLookup =
  | { status: 'found'; item: SocialTag }
  | { status: 'not_found'; sku: string };

export type TagCorner = 'bl' | 'br' | 'tl' | 'tr';

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
  /** Draw the item's tag on the photo (only when it has an item). */
  tag_overlay: boolean;
  tag_corner: TagCorner;
  /** Set when the photo was cropped or adjusted: fetch the image with it so a cached copy is not used. */
  edited_at: string | null;
  used_in: Array<{ post_id: number; slot_date: string }>;
  /** The item's live tag facts: in a post's photos, one photo's answers and uploads. */
  tag?: SocialTag | null;
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
  /** The AI's post ideas (Phase 4); null before the first ask. */
  ideas: SocialIdeas | null;
  /** Numbers due on a posted post: 1 (after a day) and / or 7 (after a week). */
  numbers_due: NumbersDue[];
  photos?: SocialPhoto[];
}

export interface SocialShot {
  shot: string;
  /** Set when the shot is one item (title, tag and location come from Dash, not the AI). */
  sku: string;
  title: string;
  tag_price: string;
  location: string;
}

export interface SocialIdea {
  title: string;
  hook: string;
  body: string;
  call_to_action: Exclude<SocialCta, ''>;
  /** This week's library photos the idea uses, best first. */
  photo_ids: number[];
  /** Photos still worth taking. */
  shots: SocialShot[];
  /** Never-say words still in the words: change them before posting. */
  flags: string[];
}

export interface SocialIdeas {
  state: 'drafting' | 'done' | 'failed';
  error: string;
  ideas: SocialIdea[];
  by: string;
  finished_at: string | null;
}

export type RewritePart = 'hook' | 'body';
export type RewriteMode = 'new' | 'shorter';

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
  numbers: PostNumbers;
  /** The channels on (plus any it already went out on), Facebook first. */
  channels: PostChannel[];
  /** Thumbnails of the photos the ideas pick, by photo id. */
  idea_photos: Record<string, string | null>;
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
  data: Partial<Pick<SocialPost, 'hook' | 'body' | 'category' | 'call_to_action' | 'size'>>,
) => api.patch<SocialPost>(`/marketing/posts/${id}/`, data).then((r) => r.data);

export const setSocialPostPhotos = (id: number, photoIds: number[]) =>
  api.put<SocialPost>(`/marketing/posts/${id}/photos/`, { photo_ids: photoIds }).then((r) => r.data);

export const swapSocialPosts = (id: number, withId: number) =>
  api.post<SocialPost>(`/marketing/posts/${id}/swap/`, { with: withId }).then((r) => r.data);

export const markSocialPostReady = (id: number) =>
  api.post<SocialPost>(`/marketing/posts/${id}/ready/`).then((r) => r.data);

export const markSocialPostPosted = (id: number, url: string) =>
  api.post<SocialPost>(`/marketing/posts/${id}/posted/`, { url }).then((r) => r.data);

/** Posted on a channel: its link (Facebook is the post's own Posted). The post detail comes back. */
export const markChannelPosted = (id: number, channel: SocialChannel, url: string) =>
  api.post<SocialPostDetail>(`/marketing/posts/${id}/channels/${channel}/posted/`, { url }).then((r) => r.data);

/** Get ideas: the AI writes 3 to 5 post ideas in the background; poll the post until they are done. */
export const requestSocialIdeas = (id: number) =>
  api.post<SocialPost>(`/marketing/posts/${id}/ideas/`).then((r) => r.data);

/** Use this idea: its words replace the post's, its photos are added. */
export const applySocialIdea = (id: number, index: number) =>
  api.post<SocialPost>(`/marketing/posts/${id}/ideas/${index}/use/`).then((r) => r.data);

/** A fast rewrite: 3 options for the hook or the words (nothing is saved). */
export const rewriteSocialPost = (id: number, part: RewritePart, mode: RewriteMode, current: string) =>
  api.post<{ options: string[] }>(`/marketing/posts/${id}/rewrite/`, { part, mode, current }).then((r) => r.data.options);

/** A post's numbers from the channel's insights (Phase 5). */
export const NUMBER_FIELDS = ['reach', 'reactions', 'comments', 'shares', 'messages', 'link_clicks'] as const;
export type NumberField = typeof NUMBER_FIELDS[number];
export const NUMBER_LABELS: Record<NumberField, string> = {
  reach: 'Reach',
  reactions: 'Reactions',
  comments: 'Comments',
  shares: 'Shares',
  messages: 'Messages',
  link_clicks: 'Link clicks',
};

export type PostNumbersRow = Record<NumberField, number> & {
  /** Reactions, comments, shares, messages and link clicks added up. */
  engagement: number;
  entered_by_name: string;
  entered_at: string | null;
};

export interface ChannelNumbers {
  key: SocialChannel;
  label: string;
  day1: PostNumbersRow | null;
  day7: PostNumbersRow | null;
  due: Array<1 | 7>;
}

/** Per channel the post went out on (Facebook first), and every mark still due. */
export interface PostNumbers {
  channels: ChannelNumbers[];
  due: NumbersDue[];
}

export const getPostNumbers = (id: number) =>
  api.get<PostNumbers>(`/marketing/posts/${id}/numbers/`).then((r) => r.data);

export const savePostNumbers = (
  id: number,
  channel: SocialChannel,
  mark: 1 | 7,
  values: Partial<Record<NumberField, number | string>>,
) => api.put<PostNumbers>(`/marketing/posts/${id}/numbers/`, { channel, mark, ...values }).then((r) => r.data);

export interface PostHit {
  id: number;
  slot_date: string;
  post_type: SocialPostType;
  post_type_label: string;
  category: string;
  hook: string;
  posted_url: string;
  rating: number | null;
  /** The channels it went out on. */
  channels: SocialChannel[];
  /** 1 while any channel has only its 1-day numbers, 7 when all are 7-day; null when none yet. */
  mark: 1 | 7 | null;
  /** Its channels added up. */
  reach: number | null;
  engagement: number | null;
  by_channel: Partial<Record<SocialChannel, { reach: number; engagement: number; mark: 1 | 7 }>>;
}

export interface HitGroup {
  key: string;
  label: string;
  posts: number;
  with_numbers: number;
  avg_reach: number | null;
  avg_engagement: number | null;
}

export interface SalesRead {
  /** Post days that had a baseline. Percents like "12.5" or null. */
  post_days: number;
  ticket_lift: string | null;
  sales_lift: string | null;
  baseline_weeks: number;
  by_type: Array<{ key: SocialPostType; label: string; days: number; ticket_lift: string | null; sales_lift: string | null }>;
  spotlights: Array<{
    post_id: number;
    slot_date: string;
    category: string;
    sold_after: number;
    dollars_after: string;
    sold_before_avg: number | null;
    change: string | null;
    weeks_before: number;
  }>;
}

export type SpendKind = 'boost' | 'print' | 'event' | 'other';
export const SPEND_KIND_LABELS: Record<SpendKind, string> = {
  boost: 'Boost (paid post)',
  print: 'Print',
  event: 'Event',
  other: 'Other',
};

export interface SpendRow {
  id: number;
  day: string;
  kind: SpendKind;
  kind_label: string;
  amount: string;
  note: string;
  post_id: number | null;
  post_day: string | null;
  entered_by_name: string;
}

export interface NumbersPage {
  today: string;
  weeks: number;
  due: Array<{ id: number; slot_date: string; hook: string; post_type_label: string; due: NumbersDue[] }>;
  hits: PostHit[];
  by_type: HitGroup[];
  by_category: HitGroup[];
  by_channel: HitGroup[];
  read: SalesRead;
  spend: { week: string; month: string; rows: SpendRow[] };
  /** The owner adds and removes spend. */
  can_spend: boolean;
}

export const getNumbersPage = (weeks = 8) =>
  api.get<NumbersPage>('/marketing/numbers/', { params: { weeks } }).then((r) => r.data);

export const addSpend = (data: { day: string; kind: SpendKind; amount: string; note?: string; post?: number | null }) =>
  api.post<SpendRow>('/marketing/spend/', data).then((r) => r.data);

export const deleteSpend = (id: number) => api.delete(`/marketing/spend/${id}/`);

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
  data: Partial<{ category: string; note: string; sku: string; is_archived: boolean; tag_overlay: boolean; tag_corner: TagCorner }>,
) => api.patch<SocialPhoto>(`/marketing/photos/${id}/`, data).then((r) => r.data);

/** The full photo as a blob from our own address, so the canvas can export it. `v`: the photo's `edited_at`. */
export const fetchSocialPhotoBlob = (id: number, v?: string | null) =>
  api.get<Blob>(`/marketing/photos/${id}/image/`, { responseType: 'blob', params: v ? { v } : {} }).then((r) => r.data);

/** The photo editor's result (crop, rotate, light) takes the photo's place. */
export const replaceSocialPhotoImage = (id: number, file: Blob) => {
  const form = new FormData();
  form.append('file', file, `photo-${id}.jpg`);
  return api.post<SocialPhoto>(`/marketing/photos/${id}/image/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

/** Scan a tag: the item's overlay facts. */
export const lookupSocialTag = (sku: string) =>
  api.get<SocialTagLookup>(`/marketing/tag/${encodeURIComponent(sku.trim().toUpperCase())}/`).then((r) => r.data);
