import api from './client';

export type AiProvider = 'anthropic' | 'xai' | 'google';
export type AiModality = 'text' | 'image';
export type AiEffort = 'off' | 'low' | 'medium' | 'high' | 'max';

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
  xai: 'xAI',
  google: 'Google',
};

export interface AiCatalogModel {
  id: number;
  slug: string;
  label: string;
  provider: AiProvider;
  modality: AiModality;
  status: 'active' | 'archived';
  source: 'manual' | 'discovered';
  created_at: string;
  updated_at: string;
}

export interface AiCatalogModelWrite {
  slug: string;
  label?: string;
  provider: AiProvider;
  modality?: AiModality;
}

export interface AiActionSetting {
  purpose: string;
  label: string;
  modality: AiModality;
  model: number | null;
  model_slug: string | null;
  effort: AiEffort;
  env_model: string;
  updated_by_name: string | null;
  updated_at: string;
}

export interface AiDiscoverProviderResult {
  provider: AiProvider;
  ok: boolean;
  found: number;
  added: string[];
  error: string;
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

export function archiveAiModel(id: number): Promise<{ data: AiCatalogModel & { cleared_actions: number } }> {
  return api.post<AiCatalogModel & { cleared_actions: number }>(`/core/ai/models/${id}/archive/`);
}

export function unarchiveAiModel(id: number): Promise<{ data: AiCatalogModel }> {
  return api.post<AiCatalogModel>(`/core/ai/models/${id}/unarchive/`);
}

export function discoverAiModels(): Promise<{ data: { providers: AiDiscoverProviderResult[] } }> {
  return api.post<{ providers: AiDiscoverProviderResult[] }>('/core/ai/models/discover/');
}

export function getAiActions(): Promise<{ data: AiActionSetting[] }> {
  return api.get<AiActionSetting[]>('/core/ai/actions/');
}

export function updateAiAction(
  purpose: string,
  data: { model?: number | null; effort?: AiEffort },
): Promise<{ data: AiActionSetting }> {
  return api.patch<AiActionSetting>(`/core/ai/actions/${encodeURIComponent(purpose)}/`, data);
}

export function getAiActionChoices(purpose: string): Promise<{ data: AiActionChoices }> {
  return api.get<AiActionChoices>(`/core/ai/actions/${encodeURIComponent(purpose)}/choices/`);
}
