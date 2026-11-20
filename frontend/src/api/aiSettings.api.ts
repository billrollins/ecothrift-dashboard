import api from './client';

export type AiProvider = 'anthropic' | 'openai' | 'xai' | 'google' | 'meta';
export type AiModality = 'text' | 'image';
export type AiEffort = 'off' | 'low' | 'medium' | 'high' | 'max';
export type AiTierKey = 'fast' | 'standard' | 'best' | 'image';

export const AI_EFFORTS: AiEffort[] = ['off', 'low', 'medium', 'high', 'max'];
export const EFFORT_LABEL: Record<AiEffort, string> = {
  off: 'Off (model default)',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max',
};
export const PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  xai: 'xAI',
  google: 'Google',
  meta: 'Meta (Spark)',
};
export const TIER_LABEL: Record<AiTierKey, string> = { fast: 'Fast', standard: 'Standard', best: 'Best', image: 'Image' };
export const TEXT_TIERS: AiTierKey[] = ['fast', 'standard', 'best'];

export interface AiCatalogModel {
  id: number;
  slug: string;
  label: string;
  provider: AiProvider;
  modality: AiModality;
  status: 'active' | 'archived';
  source: 'manual' | 'discovered';
  /** USD per 1M tokens; null = unknown. */
  input_price: string | null;
  output_price: string | null;
  /** Image models: USD per picture; null = unknown. */
  image_price: string | null;
  /** aa | triage | typed | '' (older prices). */
  price_source: string;
  price_checked_at: string | null;
  /** A Refresh found other prices: why, and the prices offered. Empty = nothing waiting. */
  price_flag: string;
  flag_input: string | null;
  flag_output: string | null;
  /** Artificial Analysis: the matched model, Intelligence Index, AA's cost per test task (USD, thinking included;
   *  what AA spent, not ours), tokens per second. */
  aa_slug: string;
  aa_name: string;
  aa_intelligence: string | null;
  aa_task_cost: string | null;
  aa_speed: string | null;
  aa_checked_at: string | null;
  /** When the model came out (YYYY-MM-DD): AA's release date, else the provider's list date; null = unknown. */
  release_date: string | null;
  /** The tiers this model is. */
  tier_keys: AiTierKey[];
  created_at: string;
  updated_at: string;
}

export interface AiTestResult {
  text: string;
  model_used: string;
  seconds: number;
  input_tokens: number;
  output_tokens: number;
  /** USD, null when the model's price isn't set. */
  input_cost: string | null;
  output_cost: string | null;
}

export async function testAiModel(id: number, message: string): Promise<AiTestResult> {
  const { data } = await api.post<AiTestResult>(`/core/ai/models/${id}/test/`, { message });
  return data;
}

export interface AiImageTestResult {
  /** A data: URI. */
  image: string;
  model_used: string;
  seconds: number;
  /** USD per picture, null when the model's per-image price isn't set. */
  cost: string | null;
}

/** Try an image model: one picture from the prompt. */
export async function testAiImage(id: number, message: string): Promise<AiImageTestResult> {
  const { data } = await api.post<AiImageTestResult>(`/core/ai/models/${id}/test-image/`, { message }, { timeout: 60000 });
  return data;
}

/** Save a model's prices (USD per 1M tokens; blank = unknown). */
export async function saveAiModelPrices(id: number, input_price: string | null, output_price: string | null): Promise<AiCatalogModel> {
  const { data } = await api.patch<AiCatalogModel>(`/core/ai/models/${id}/`, { input_price, output_price });
  return data;
}

export interface AiCatalogModelWrite {
  slug: string;
  label?: string;
  provider: AiProvider;
  modality?: AiModality;
  aa_slug?: string;
  image_price?: string | null;
}

export interface AiTier {
  key: AiTierKey;
  label: string;
  modality: AiModality;
  model: number | null;
  model_slug: string | null;
  effort: AiEffort;
  /** What a tier with no model runs (.env AI_MODEL). */
  env_model: string;
  updated_at: string;
}

/** One AI job in Dash: Workspace > Page > Function (label), its tier, what it runs, and what it costs. */
export interface AiActionRow {
  purpose: string;
  label: string;
  workspace: string;
  page: string;
  description: string;
  modality: AiModality;
  tier: AiTierKey;
  /** The action's own model (overrides the tier), or null. */
  model: number | null;
  model_slug: string | null;
  /** The action's own effort, or '' for the tier's. */
  effort: AiEffort | '';
  run_model: string;
  run_effort: AiEffort;
  model_from: 'action' | 'tier' | 'env';
  effort_from: 'action' | 'tier' | 'none';
  runs_30d: number;
  tokens_in: number | null;
  tokens_out: number | null;
  /** USD for one run at today's model and price; null = no runs or no price. */
  cost_per_run: string | null;
  cost_month: string | null;
  spent_30d: string | null;
  tier_costs: Partial<Record<AiTierKey, string | null>>;
  suggested_tier: AiTierKey | '';
  suggested_reason: string;
  updated_by_name: string | null;
  updated_at: string;
}

export interface AiActionWrite {
  tier?: AiTierKey;
  model?: number | null;
  effort?: AiEffort | '';
}

export interface AiRefreshSummary {
  finished_at?: string;
  seconds?: number;
  by?: string;
  providers?: { provider: AiProvider; ok: boolean; found: number; added: string[]; error: string }[];
  gone?: string[];
  aa?: { ok: boolean; models: number; matched: number; error: string };
  triage?: { model: string; ok: boolean; priced: number; error: string }[];
  prices?: { filled: number; confirmed: number; flagged: number; none: number };
}

export interface AiTierReview {
  status?: 'running' | 'done' | 'failed';
  started_at?: string;
  finished_at?: string;
  by?: string;
  model?: string;
  proposed?: number;
  reviewed?: number;
  error?: string;
}

export interface AiActionChoices {
  purpose: string;
  modality: AiModality;
  default_model: string;
  default_effort: AiEffort;
  models: { slug: string; label: string; provider: AiProvider }[];
}

export function getAiModels(): Promise<{ data: AiCatalogModel[] }> {
  return api.get<AiCatalogModel[]>('/core/ai/models/');
}

export function createAiModel(data: AiCatalogModelWrite): Promise<{ data: AiCatalogModel }> {
  return api.post<AiCatalogModel>('/core/ai/models/', data);
}

export function updateAiModel(id: number, data: Partial<AiCatalogModelWrite>): Promise<{ data: AiCatalogModel }> {
  return api.patch<AiCatalogModel>(`/core/ai/models/${id}/`, data);
}

export type AiArchiveResult = AiCatalogModel & { cleared_actions: number; cleared_tiers: string[] };

export function archiveAiModel(id: number): Promise<{ data: AiArchiveResult }> {
  return api.post<AiArchiveResult>(`/core/ai/models/${id}/archive/`);
}

export function unarchiveAiModel(id: number): Promise<{ data: AiCatalogModel }> {
  return api.post<AiCatalogModel>(`/core/ai/models/${id}/unarchive/`);
}

export function acceptAiModelPrice(id: number): Promise<{ data: AiCatalogModel }> {
  return api.post<AiCatalogModel>(`/core/ai/models/${id}/accept-price/`);
}

export function dismissAiModelPrice(id: number): Promise<{ data: AiCatalogModel }> {
  return api.post<AiCatalogModel>(`/core/ai/models/${id}/dismiss-price/`);
}

export function getAiRefresh(): Promise<{ data: AiRefreshSummary }> {
  return api.get<AiRefreshSummary>('/core/ai/models/refresh/');
}

/** Provider lists, Artificial Analysis and the three-model price triage, all at once (seconds). */
export function runAiRefresh(): Promise<{ data: AiRefreshSummary }> {
  return api.post<AiRefreshSummary>('/core/ai/models/refresh/', {}, { timeout: 60000 });
}

export function getAiTiers(): Promise<{ data: AiTier[] }> {
  return api.get<AiTier[]>('/core/ai/tiers/');
}

export function updateAiTier(key: AiTierKey, data: { model?: number | null; effort?: AiEffort }): Promise<{ data: AiTier }> {
  return api.patch<AiTier>(`/core/ai/tiers/${key}/`, data);
}

export function getAiActions(): Promise<{ data: AiActionRow[] }> {
  return api.get<AiActionRow[]>('/core/ai/actions/');
}

export function updateAiAction(purpose: string, data: AiActionWrite): Promise<{ data: AiActionRow }> {
  return api.patch<AiActionRow>(`/core/ai/actions/${encodeURIComponent(purpose)}/`, data);
}

export function dismissAiSuggestion(purpose: string): Promise<{ data: AiActionRow }> {
  return api.post<AiActionRow>(`/core/ai/actions/${encodeURIComponent(purpose)}/dismiss-suggestion/`);
}

export function getAiTierReview(): Promise<{ data: AiTierReview }> {
  return api.get<AiTierReview>('/core/ai/actions/review/');
}

export function startAiTierReview(): Promise<{ data: AiTierReview }> {
  return api.post<AiTierReview>('/core/ai/actions/review/');
}

export function getAiActionChoices(purpose: string): Promise<{ data: AiActionChoices }> {
  return api.get<AiActionChoices>(`/core/ai/actions/${encodeURIComponent(purpose)}/choices/`);
}
