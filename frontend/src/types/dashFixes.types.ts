export type DashFixKind = 'problem' | 'change' | 'idea';
export type DashFixStatus = 'new' | 'accepted' | 'working' | 'almost' | 'hold' | 'done' | 'declined';

export interface DashFixNoteDTO {
  id: number;
  body: string;
  author: number | null;
  author_name: string | null;
  created_at: string;
}

export interface DashFixDTO {
  id: number;
  title: string;
  details: string;
  page_path: string;
  kind: DashFixKind;
  status: DashFixStatus;
  /** Place in the line among accepted + working items (1 = next); 0 when not in the line. */
  rank: number;
  private: boolean;
  decline_reason: string;
  done_version: string;
  done_at: string | null;
  accepted_at: string | null;
  status_changed_at: string;
  created_at: string;
  submitted_by: number | null;
  submitted_by_name: string | null;
  /** Ids of up to three screenshots. */
  photos: number[];
  size: '' | 'S' | 'M' | 'L';
  /** Ids of items this waits on (hidden ones left out for staff). */
  depends_on: number[];
  project: string;
  step: number | null;
  /** Owner only. */
  coder_notes?: string;
  /** Almost done: what it waits on ("your review"). Public. */
  waiting_on: string;
  /** Owner only. */
  question_for_owner?: string;
  owner_answer?: string;
  answered_at?: string | null;
  parent?: number | null;
  is_mine: boolean;
  /** Mine and its status changed since I last opened Dash Fixes. */
  unseen: boolean;
  notes: DashFixNoteDTO[];
}

export interface DashFixReport {
  details: string;
  page_path: string;
  private?: boolean;
  photos?: File[];
}
