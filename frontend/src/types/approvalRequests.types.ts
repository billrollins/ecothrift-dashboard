/** Superuser → Requests: routine data work staged in production for the owner's approval. */
export type ApprovalRequestStatus = 'pending' | 'approved' | 'running' | 'applied' | 'failed' | 'rejected' | 'undone';

export interface ApprovalRequestPreview {
  counts?: Record<string, number | string>;
  changes?: string[];
  sample?: Array<Record<string, unknown>>;
}

export interface ApprovalRequest {
  id: number;
  kind: string;
  kind_label: string;
  title: string;
  summary: string;
  preview: ApprovalRequestPreview;
  status: ApprovalRequestStatus;
  requested_by: string;
  decided_by_name: string;
  decided_at: string | null;
  decision_note: string;
  started_at: string | null;
  heartbeat_at: string | null;
  finished_at: string | null;
  progress: { done?: number; total?: number; cursor?: unknown };
  log: string;
  result: Record<string, unknown>;
  error: string;
  undone_at: string | null;
  can_undo: boolean;
  /** Running, but no heartbeat for 5+ minutes: Resume starts it again from its cursor. */
  stale: boolean;
  created_at: string;
}
