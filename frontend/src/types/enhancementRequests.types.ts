export type EnhancementArea = 'restoration' | 'processing';
export type EnhancementStatus = 'open' | 'planned' | 'done' | 'declined';
export type EnhancementPriority = 'unset' | 'low' | 'medium' | 'high';

export interface EnhancementRequestNoteDTO {
  id: number;
  body: string;
  author: number | null;
  author_name: string | null;
  created_at: string;
}

export interface EnhancementRequestDTO {
  id: number;
  area: EnhancementArea;
  body: string;
  submitted_by: number | null;
  submitted_by_name: string | null;
  status: EnhancementStatus;
  priority: EnhancementPriority;
  target_date: string | null;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  notes: EnhancementRequestNoteDTO[];
  can_edit: boolean;
  can_note: boolean;
  created_at: string;
  updated_at: string;
}

export interface EnhancementRequestWritePayload {
  area: EnhancementArea;
  body: string;
}

export interface EnhancementRequestTriagePayload {
  priority?: EnhancementPriority;
  status?: EnhancementStatus;
  target_date?: string | null;
}
