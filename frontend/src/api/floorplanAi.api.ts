import api from './client';
import type { AiEffort } from './aiSettings.api';
import type { PlanDocument, PlanLayers, PlanSettings } from '../types/floorplan.types';

export type AiSettingsPatch = Partial<Pick<PlanSettings, 'planWidth' | 'planHeight' | 'snap'>>;
export type AiAdjustDocument = Pick<PlanDocument, 'schema_version' | 'settings'> & PlanLayers;

export interface GenerateSvgInput {
  label: string;
  width: number;
  depth: number;
  category: string;
  fill_color: string;
  notes: string;
  model: string;
  effort: AiEffort;
}

export interface GenerateSvgResult {
  svg_data_uri: string;
  model_used: string;
  width: number;
  depth: number;
}

export interface AdjustPlanInput {
  instruction: string;
  document: AiAdjustDocument;
  model: string;
  effort: AiEffort;
}

export interface AdjustCounts {
  added: number;
  changed: number;
  removed: number;
}

export interface AdjustPlanResult {
  layers: PlanLayers;
  settings_patch: AiSettingsPatch;
  summary: { counts: Record<keyof PlanLayers, AdjustCounts>; lines: string[]; more: number };
  notes: string;
  model_used: string;
}

export function generateKindSvg(input: GenerateSvgInput): Promise<{ data: GenerateSvgResult }> {
  return api.post<GenerateSvgResult>('/floorplan/element-kinds/generate-svg/', input);
}

export function adjustPlan(planId: number, input: AdjustPlanInput): Promise<{ data: AdjustPlanResult }> {
  return api.post<AdjustPlanResult>(`/floorplan/plans/${planId}/ai-adjust/`, input);
}
