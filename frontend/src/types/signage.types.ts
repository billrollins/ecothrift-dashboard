/** Store signs (#106). Where each copy hangs is a store-map pin on the Signage layer. */
export type SignStatus = 'to_make' | 'printed' | 'up';

/** #122: a sign starts as a draft (staff vote); a manager approves it into production. */
export type SignStage = 'draft' | 'production';

export const SIGN_STATUSES: { value: SignStatus; label: string }[] = [
  { value: 'to_make', label: 'To make' },
  { value: 'printed', label: 'Printed' },
  { value: 'up', label: 'Up' },
];

/** `MapPin.ref_type` of a pin that stands for a sign. */
export const SIGN_REF_TYPE = 'signage.sign';

export interface SignVersion {
  id: number;
  label: string;
  position: number;
  has_pdf: boolean;
  has_preview: boolean;
  pdf_name: string | null;
  /** The rank this person gave it (1 = their best), or null. */
  my_rank: number | null;
  /** Everyone's numbers; null until this person has voted. */
  avg_rank: number | null;
  rankers: number | null;
  firsts: number | null;
}

export interface SignVoteResults {
  needed_yes: number;
  needed_no: number;
  needed_pct: number | null;
  voters: number;
  top_version_id: number | null;
  top_version_label: string | null;
}

export interface SignVotes {
  my_needed: boolean | null;
  /** A yes/no in and the best picked. Results show only after that. */
  has_voted: boolean;
  results: SignVoteResults | null;
}

export interface SignNote {
  id: number;
  author: number | null;
  author_name: string;
  text: string;
  created_at: string;
}

export interface Sign {
  id: number;
  name: string;
  stage: SignStage;
  /** A sign, or a theme (a look the signs share); themes are voted on the same way. */
  kind: 'sign' | 'theme';
  /** The draft package name (load_sign_drafts). */
  slug: string | null;
  dash_update: number | null;
  location: string;
  quantity: number;
  status: SignStatus;
  status_label: string;
  copies_up: number;
  note: string;
  pdf_name: string | null;
  pdf_size: number | null;
  /** Spots on the Current store map. */
  pins: number;
  versions: SignVersion[];
  chosen_version: number | null;
  /** The version whose PNG stands for the sign. */
  preview_version: number | null;
  /** Drafts only. */
  votes: SignVotes | null;
  notes: SignNote[];
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SignPayload = Partial<Pick<Sign, 'name' | 'stage' | 'location' | 'quantity' | 'status' | 'copies_up' | 'note'>>;
