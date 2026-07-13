import Build from '@mui/icons-material/Build';
import Edit from '@mui/icons-material/Edit';
import FactCheck from '@mui/icons-material/FactCheck';
import History from '@mui/icons-material/History';
import MoreTime from '@mui/icons-material/MoreTime';
import RemoveCircleOutline from '@mui/icons-material/RemoveCircleOutline';
import Science from '@mui/icons-material/Science';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  useRestorationJobTimeline,
  useReviseRestorationTimelineEvent,
  useVoidRestorationTimelineEvent,
} from '../../../../hooks/useRestorationBench';
import type {
  RestorationTimelineEventDTO,
  RestorationTimelineEventType,
} from '../../../../types/inventory.types';

type TimelineFilter = 'all' | 'performed' | 'decisions' | 'estimates' | 'system';

const FILTERS: Array<{ id: TimelineFilter; label: string }> = [
  { id: 'all', label: 'All activity' },
  { id: 'performed', label: 'Performed work' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'estimates', label: 'Estimates' },
  { id: 'system', label: 'System' },
];

const DIRECTLY_EDITABLE = new Set<RestorationTimelineEventType>([
  'condition.current_grade.set',
  'test.added',
  'test.result_set',
  'plan.estimated',
  'plan.committed',
  'work.performed',
]);

function eventGroup(type: RestorationTimelineEventType): TimelineFilter {
  if (type === 'work.performed' || type.startsWith('test.')) return 'performed';
  if (type.startsWith('plan.committed') || type === 'plan.cleared') return 'decisions';
  if (type === 'plan.estimated') return 'estimates';
  return 'system';
}

function eventTone(type: RestorationTimelineEventType): { color: string; bg: string; icon: ReactNode } {
  if (type.startsWith('valuation.')) return { color: '#a55308', bg: '#fff7e8', icon: <FactCheck /> };
  if (type.startsWith('test.')) return { color: '#086c93', bg: '#edf9ff', icon: <Science /> };
  if (type === 'work.performed') return { color: '#0b665e', bg: '#edfaf7', icon: <Build /> };
  if (type === 'plan.estimated') return { color: '#6650a5', bg: '#f5f1ff', icon: <MoreTime /> };
  if (type.startsWith('plan.')) return { color: '#26703a', bg: '#eff9f1', icon: <FactCheck /> };
  return { color: '#526177', bg: '#f4f6f8', icon: <History /> };
}

function text(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return value == null ? '' : String(value);
}

function eventTitle(event: RestorationTimelineEventDTO): string {
  const payload = event.payload;
  switch (event.event_type) {
    case 'condition.current_grade.set':
      return `Current grade set to ${text(payload, 'grade') || 'Unspecified'}`;
    case 'test.added':
      return `Test added: ${text(payload, 'name') || 'Untitled test'}`;
    case 'test.result_set':
      return `${text(payload, 'name') || 'Test'}: ${text(payload, 'result').replace(/_/g, ' ') || 'updated'}`;
    case 'test.removed':
      return 'Test removed';
    case 'plan.estimated':
      return `Estimate: ${text(payload, 'action').toUpperCase() || 'PLAN'} → ${text(payload, 'grade') || 'grade pending'}`;
    case 'plan.committed':
      return `Decision committed: ${text(payload, 'action').toUpperCase()} → ${text(payload, 'grade')}`;
    case 'plan.cleared':
      return 'Committed plan cleared';
    case 'work.performed':
      return `${text(payload, 'category').toUpperCase() || 'WORK'} · ${text(payload, 'name') || 'Work recorded'}`;
    case 'valuation.requested':
      return `Valuation requested: ${Array.isArray(payload.grades) ? payload.grades.join(', ') : ''}`;
    case 'valuation.fulfilled':
      return 'Processing completed the requested valuations';
    case 'valuation.values_changed':
      return 'Grade values updated';
    case 'parts.request_submitted':
      return 'Parts request submitted';
    case 'parts.ordered':
      return `Parts ordered${text(payload, 'po_number') ? ` · ${text(payload, 'po_number')}` : ''}`;
    case 'parts.received':
      return 'Parts received';
    case 'timer.started':
      return 'Labor timer started';
    case 'timer.paused':
      return `Labor timer paused${text(payload, 'reason') ? ` · ${text(payload, 'reason').replace(/_/g, ' ')}` : ''}`;
    case 'timer.adjusted':
      return 'Labor time adjusted';
    case 'hold.placed':
      return `Moved to Pending · ${text(payload, 'reason').replace(/_/g, ' ')}`;
    case 'hold.resumed':
      return 'Resumed on Bench';
    case 'job.checked_in':
      return 'Checked in to Bench';
    case 'job.moved_to_queue':
      return 'Moved back to Inbox';
    case 'disposition.completed':
      return `Final disposition · ${text(payload, 'final_grade')}`;
    case 'return.to_processing':
      return 'Returned to Processing';
    case 'job.sent':
      return 'Sent to TARS';
    case 'legacy.snapshot':
      return 'Legacy state imported';
    default:
      return event.event_type.replace(/\./g, ' ');
  }
}

function eventDetails(event: RestorationTimelineEventDTO): string {
  const payload = event.payload;
  return (
    text(payload, 'notes')
    || text(payload, 'evidence')
    || text(payload, 'reason')
    || text(payload, 'result')
    || ''
  );
}

export function TarsRestorationTimeline({
  jobId,
  editable,
}: {
  jobId: number;
  editable: boolean;
}) {
  const timeline = useRestorationJobTimeline(jobId);
  const revise = useReviseRestorationTimelineEvent();
  const voidEvent = useVoidRestorationTimelineEvent();
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [showHistory, setShowHistory] = useState(false);
  const [editEvent, setEditEvent] = useState<RestorationTimelineEventDTO | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editResult, setEditResult] = useState('');
  const [voidTarget, setVoidTarget] = useState<RestorationTimelineEventDTO | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const visible = useMemo(
    () => (timeline.data ?? []).filter((event) => {
      if (!showHistory && event.status !== 'active') return false;
      return filter === 'all' || eventGroup(event.event_type) === filter;
    }),
    [filter, showHistory, timeline.data],
  );

  const openEdit = (event: RestorationTimelineEventDTO) => {
    setEditEvent(event);
    setEditName(text(event.payload, 'name'));
    setEditNotes(text(event.payload, 'notes') || text(event.payload, 'evidence'));
    setEditResult(text(event.payload, 'result'));
  };

  const saveEdit = async () => {
    if (!editEvent) return;
    const payload: Record<string, unknown> = {};
    if ('name' in editEvent.payload || editName) payload.name = editName;
    if ('evidence' in editEvent.payload) payload.evidence = editNotes;
    else payload.notes = editNotes;
    if ('result' in editEvent.payload || editResult) payload.result = editResult;
    await revise.mutateAsync({ jobId, eventId: editEvent.id, payload });
    setEditEvent(null);
  };

  const confirmVoid = async () => {
    if (!voidTarget || !voidReason.trim()) return;
    await voidEvent.mutateAsync({
      jobId,
      eventId: voidTarget.id,
      reason: voidReason.trim(),
    });
    setVoidTarget(null);
    setVoidReason('');
  };

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#fff',
        border: '1px solid #cbd5df',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid #dce3ea', bgcolor: '#fbfcfd' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
          <Box>
            <Typography variant="subtitle1" sx={{ color: '#172033', fontWeight: 950, lineHeight: 1.15 }}>
              Restoration log
            </Typography>
            <Typography variant="caption" sx={{ color: '#65748a' }}>
              Valuations, estimates, decisions, actions, and results—in order.
            </Typography>
          </Box>
          <Button
            size="small"
            onClick={() => setShowHistory((value) => !value)}
            startIcon={<History />}
            sx={{ textTransform: 'none', fontWeight: 800 }}
          >
            {showHistory ? 'Hide revisions' : 'Show revisions'}
          </Button>
        </Stack>
        <Stack direction="row" gap={0.5} mt={1} flexWrap="wrap">
          {FILTERS.map((entry) => (
            <Chip
              key={entry.id}
              size="small"
              clickable
              label={entry.label}
              onClick={() => setFilter(entry.id)}
              variant={filter === entry.id ? 'filled' : 'outlined'}
              sx={{
                height: 25,
                fontWeight: 800,
                bgcolor: filter === entry.id ? '#d8f3ee' : undefined,
                color: filter === entry.id ? '#0b665e' : '#526177',
              }}
            />
          ))}
        </Stack>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1.5, py: 1 }}>
        {timeline.isLoading ? (
          <Box sx={{ py: 5, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>
        ) : visible.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center', color: '#65748a' }}>
            <History sx={{ fontSize: 36, mb: 0.5 }} />
            <Typography variant="body2" fontWeight={800}>No activity in this view yet.</Typography>
          </Box>
        ) : (
          <Stack divider={<Divider flexItem />} spacing={0}>
            {visible.map((event) => {
              const tone = eventTone(event.event_type);
              const details = eventDetails(event);
              const inactive = event.status !== 'active';
              return (
                <Box key={event.id} sx={{ py: 1.2, opacity: inactive ? 0.62 : 1 }}>
                  <Stack direction="row" gap={1.1} alignItems="flex-start">
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        flexShrink: 0,
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: 1.5,
                        bgcolor: tone.bg,
                        color: tone.color,
                        '& svg': { fontSize: 19 },
                      }}
                    >
                      {tone.icon}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
                        <Typography
                          variant="body2"
                          sx={{
                            color: '#172033',
                            fontWeight: 900,
                            textDecoration: event.status === 'voided' ? 'line-through' : 'none',
                          }}
                        >
                          {eventTitle(event)}
                        </Typography>
                        {inactive ? (
                          <Chip
                            size="small"
                            label={event.status}
                            sx={{ height: 19, fontSize: 10, fontWeight: 900 }}
                          />
                        ) : null}
                      </Stack>
                      {details ? (
                        <Typography variant="body2" sx={{ mt: 0.25, color: '#526177', whiteSpace: 'pre-wrap' }}>
                          {details}
                        </Typography>
                      ) : null}
                      {event.status === 'voided' && event.void_reason ? (
                        <Typography variant="caption" sx={{ display: 'block', mt: 0.25, color: '#a23b3b' }}>
                          Voided: {event.void_reason}
                        </Typography>
                      ) : null}
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.35, color: '#7a8798' }}>
                        {new Date(event.occurred_at).toLocaleString()} · {event.actor_name || 'System'}
                      </Typography>
                    </Box>
                    {editable && event.status === 'active' && DIRECTLY_EDITABLE.has(event.event_type) ? (
                      <Stack direction="row" gap={0.25}>
                        <Button
                          size="small"
                          onClick={() => openEdit(event)}
                          startIcon={<Edit />}
                          sx={{ minWidth: 0, px: 0.75, textTransform: 'none' }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => setVoidTarget(event)}
                          startIcon={<RemoveCircleOutline />}
                          sx={{ minWidth: 0, px: 0.75, textTransform: 'none' }}
                        >
                          Void
                        </Button>
                      </Stack>
                    ) : null}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>

      <Dialog open={editEvent != null} onClose={() => setEditEvent(null)} fullWidth maxWidth="sm">
        <DialogTitle>Revise log entry</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} mt={0.5}>
            {editName || editEvent?.event_type === 'work.performed' || editEvent?.event_type.startsWith('test.') ? (
              <TextField label="Name" value={editName} onChange={(event) => setEditName(event.target.value)} />
            ) : null}
            {editResult || editEvent?.event_type === 'work.performed' || editEvent?.event_type.startsWith('test.') ? (
              <TextField label="Result" value={editResult} onChange={(event) => setEditResult(event.target.value)} />
            ) : null}
            <TextField
              label="Notes / evidence"
              value={editNotes}
              onChange={(event) => setEditNotes(event.target.value)}
              multiline
              minRows={3}
            />
            <Typography variant="caption" color="text.secondary">
              Saving creates a new revision. The original remains in history.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditEvent(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveEdit()} disabled={revise.isPending}>Save revision</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={voidTarget != null} onClose={() => setVoidTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Void this log entry?</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Reason"
            value={voidReason}
            onChange={(event) => setVoidReason(event.target.value)}
            multiline
            minRows={2}
            sx={{ mt: 0.5 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVoidTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={!voidReason.trim() || voidEvent.isPending}
            onClick={() => void confirmVoid()}
          >
            Void entry
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

