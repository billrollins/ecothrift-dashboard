/**
 * The managers' Requests inbox data (Dash Update #140, Bill 2026-11-13, .ai/extended/home-and-hr-structure.md
 * decisions 6 and 9): every HR request waiting on a manager or the owner, from the APIs that already answer them.
 * Nothing new on the server, and nobody answers anything they could not answer before:
 *   days off and new times   the schedule's managers (hr.schedule:write)
 *   shift fixes              the owner (hr.mod_requests:triage, the API's IsSuperAdmin): a punch's times, asked
 *                            from Hours & pay
 *   incidents                managers and the owner (the incidents API's can_manage): open reports to follow up
 *   questions                People at Manage (hr.questions:answer)
 * A person's own requests are never in their inbox (someone else answers them), as on HR > Requests before.
 * The sidebar badge (hooks/useNavBadgeCounts.ts) counts the same waiting rows, from the same queries.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { canAccess } from '../../../auth/access';
import { useAuth } from '../../../hooks/useAuth';
import { getScheduleRequests, type ScheduleRequest } from '../../../api/schedule.api';
import { getHrQuestions, getModificationRequests, type HrQuestion, type ModificationRequest } from '../../../api/hr.api';
import { getIncidents, type IncidentSummary } from '../../../api/incidents.api';

export type InboxKind = 'off' | 'times' | 'fix' | 'incident' | 'question';

export type InboxRow =
  | { key: string; kind: 'off' | 'times'; asked: string; answered: string | null; schedule: ScheduleRequest }
  | { key: string; kind: 'fix'; asked: string; answered: string | null; fix: ModificationRequest }
  | { key: string; kind: 'incident'; asked: string; answered: string | null; incident: IncidentSummary }
  | { key: string; kind: 'question'; asked: string; answered: string | null; question: HrQuestion };

type InboxUser = Parameters<typeof canAccess>[0];

/** Which kinds this person answers. Incidents follow the API's own answer once it has loaded. */
export function inboxRights(user: InboxUser) {
  const manager = Boolean(user && (user.is_superuser || user.role === 'Manager' || user.role === 'Admin'));
  return {
    schedule: canAccess(user, ['hr.schedule:write', 'people:manage']),
    fixes: canAccess(user, ['hr.mod_requests:triage', 'admin:full']),
    questions: canAccess(user, ['hr.questions:answer', 'people:manage']),
    // The incidents API decides (IsManagerOrAdmin); this only keeps staff from asking for a list they cannot manage.
    incidents: manager || canAccess(user, ['people:manage', 'admin:manage']),
  };
}

export const INBOX_KEYS = {
  schedule: ['scheduleRequests', 'inbox'] as const,
  fixes: ['modRequests', { inbox: true }] as const,
  questions: ['hrQuestions'] as const,
  incidents: ['incidents', 'list'] as const,
};

const DAY = 86_400_000;
/** How far back the Answered view looks. */
export const ANSWERED_DAYS = 30;

/** Waiting rows (oldest first) and recently answered ones (newest first) from the four lists. */
export function buildInbox(
  data: {
    schedule?: ScheduleRequest[];
    fixes?: ModificationRequest[];
    questions?: HrQuestion[];
    incidents?: IncidentSummary[];
  },
  me: number | undefined,
  now = Date.now(),
): { waiting: InboxRow[]; answered: InboxRow[] } {
  const rows: InboxRow[] = [
    ...(data.schedule ?? [])
      .filter((r) => r.employee !== me && r.status !== 'withdrawn')
      .map((r): InboxRow => ({
        key: `s${r.id}`, kind: r.kind, asked: r.created_at, answered: r.status === 'pending' ? null : r.decided_at ?? r.created_at, schedule: r,
      })),
    ...(data.fixes ?? [])
      .filter((r) => r.employee !== me)
      .map((r): InboxRow => ({
        key: `t${r.id}`, kind: 'fix', asked: r.created_at, answered: r.status === 'pending' ? null : r.reviewed_at ?? r.created_at, fix: r,
      })),
    ...(data.questions ?? [])
      .filter((q) => q.employee !== me)
      .map((q): InboxRow => ({
        key: `q${q.id}`, kind: 'question', asked: q.created_at, answered: q.status === 'open' ? null : q.answered_at ?? q.created_at, question: q,
      })),
    // An open report waits for a manager's follow-up whoever filed it.
    ...(data.incidents ?? []).map((r): InboxRow => ({
      key: `i${r.id}`, kind: 'incident', asked: r.created_at, answered: r.status === 'open' ? null : r.closed_at ?? r.created_at, incident: r,
    })),
  ];
  const since = now - ANSWERED_DAYS * DAY;
  return {
    waiting: rows.filter((r) => r.answered == null).sort((a, b) => a.asked.localeCompare(b.asked)),
    answered: rows
      .filter((r) => r.answered != null && Date.parse(r.answered) >= since)
      .sort((a, b) => (b.answered ?? '').localeCompare(a.answered ?? '')),
  };
}

/** The inbox for the signed-in person, refetched every minute (the page and the sidebar badge share the queries). */
export function useHrInbox({ enabled = true }: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const rights = inboxRights(user);
  const minute = 60_000;
  const schedule = useQuery({
    queryKey: INBOX_KEYS.schedule,
    queryFn: async () => (await getScheduleRequests()).data,
    enabled: enabled && rights.schedule,
    refetchInterval: minute,
  });
  const fixes = useQuery({
    queryKey: INBOX_KEYS.fixes,
    queryFn: async () => (await getModificationRequests({ page_size: 200 })).data.results,
    enabled: enabled && rights.fixes,
    refetchInterval: minute,
  });
  const questions = useQuery({
    queryKey: INBOX_KEYS.questions,
    queryFn: async () => (await getHrQuestions()).data,
    enabled: enabled && rights.questions,
    refetchInterval: minute,
  });
  const incidents = useQuery({
    queryKey: INBOX_KEYS.incidents,
    queryFn: async () => (await getIncidents()).data,
    enabled: enabled && rights.incidents,
    refetchInterval: minute,
  });
  const canIncidents = rights.incidents && Boolean(incidents.data?.can_manage);
  const { waiting, answered } = buildInbox(
    {
      schedule: rights.schedule ? schedule.data : undefined,
      fixes: rights.fixes ? fixes.data : undefined,
      questions: rights.questions ? questions.data : undefined,
      incidents: canIncidents ? incidents.data?.reports : undefined,
    },
    user?.id,
  );
  const queries = [
    rights.schedule ? schedule : null,
    rights.fixes ? fixes : null,
    rights.questions ? questions : null,
    rights.incidents ? incidents : null,
  ].filter((q) => q != null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['scheduleRequests'] });
    void queryClient.invalidateQueries({ queryKey: ['scheduleWeek'] });
    void queryClient.invalidateQueries({ queryKey: ['modRequests'] });
    void queryClient.invalidateQueries({ queryKey: ['hrQuestions'] });
    void queryClient.invalidateQueries({ queryKey: ['incidents'] });
  };
  return {
    rights: { ...rights, incidents: canIncidents },
    answersAnything: rights.schedule || rights.fixes || rights.questions || canIncidents,
    waiting,
    answered,
    loading: queries.some((q) => q.isLoading),
    failed: queries.some((q) => q.isError),
    refresh,
  };
}
