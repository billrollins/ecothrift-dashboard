import api from './client';

export interface AIModel {
  id: string;
  name: string;
  default: boolean;
}

export interface AIModelsResponse {
  models: AIModel[];
  default: string;
}

export interface AIChatPayload {
  model?: string;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
}

export interface AIChatResponse {
  id: string;
  model: string;
  content: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export function getAIModels(): Promise<{ data: AIModelsResponse }> {
  return api.get<AIModelsResponse>('/ai/models/');
}

export function sendAIChat(payload: AIChatPayload): Promise<{ data: AIChatResponse }> {
  return api.post<AIChatResponse>('/ai/chat/', payload);
}
