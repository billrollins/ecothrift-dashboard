import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useRef, useState } from 'react';
import {
  deleteI9File,
  finishI9Section2,
  getCareers,
  getHandbookPdf,
  getI9,
  getI9FileBlob,
  getOnboardingPeople,
  previewStartOnboarding,
  setOnboardingTask,
  startOnboarding,
  uploadI9File,
  type OnboardingDetail,
  type OnboardingTask,
} from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { useEmailReview } from './EmailReview';
import { errorText, shortDate } from './peopleUi';

/** The handbook's light markup: "## " headings, "- " bullet lines, blank lines between paragraphs. */
export function HandbookText({ title, text }: { title?: string; text: string }) {
  return (
    <Box sx={{ fontSize: 15, lineHeight: 1.6 }}>
      {title && (
        <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
          {title}
        </Typography>
      )}
      {text.split('\n\n').map((block, i) => {
        const lines = block.split('\n').filter((l) => l.trim());
        const heads: string[] = [];
        while (lines.length && lines[0].startsWith('## ')) heads.push(lines.shift()!.slice(3));
        const bullets = lines.length > 0 && lines.every((l) => l.trimStart().startsWith('- '));
        return (
          <Box key={i}>
            {heads.map((h) => (
              <Typography key={h} fontWeight={700} sx={{ mt: 2, mb: 0.5 }}>
                {h}
              </Typography>
            ))}
            {bullets ? (
              <Box component="ul" sx={{ my: 0.5, pl: 2.5 }}>
                {lines.map((l) => (
                  <li key={l}>
                    <Mark text={l.trimStart().slice(2)} />
                  </li>
                ))}
              </Box>
            ) : (
              lines.length > 0 && (
                <Typography sx={{ mb: 1, whiteSpace: 'pre-line' }}>
                  <Mark text={lines.join('\n')} />
                </Typography>
              )
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/** Highlights "[confirm: …]" marks: facts the owner still has to settle before the handbook is published. */
function Mark({ text }: { text: string }) {
  const parts = text.split(/(\[confirm[^\]]*\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('[confirm') ? (
          <Box key={i} component="span" sx={{ bgcolor: '#fff1d6', color: '#7a4b00', borderRadius: '4px', px: 0.5 }}>
            {p}
          </Box>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const OWNER_COLOR: Record<string, string> = { new_hire: '#e7f0ff', manager: '#eef6ea', owner: '#f6efe2' };

function TaskState({ task }: { task: OnboardingTask }) {
  if (task.status === 'done') {
    const extra = task.kind === 'count' && task.data.count ? ` (${task.data.count}${task.data.size ? `, ${task.data.size}` : ''})` : '';
    return (
      <Typography variant="caption" sx={{ color: ccTokens.goodText }}>
        Done{extra} · {task.done_by || '—'}
        {task.done_at ? `, ${shortDate(task.done_at)}` : ''}
      </Typography>
    );
  }
  if (task.status === 'skipped')
    return (
      <Typography variant="caption" color="text.secondary">
        Not needed · {task.done_by}
      </Typography>
    );
  return (
    <Typography variant="caption" sx={{ color: task.overdue ? '#a33027' : ccTokens.ink2, fontWeight: task.overdue ? 700 : 400 }}>
      {task.overdue ? 'Overdue: ' : 'Due '}
      {new Date(`${task.due_date}T12:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
      {task.kind === 'auto' || task.kind === 'handbook' || task.kind === 'i9' ? ' · Dash ticks this when it sees it' : ''}
    </Typography>
  );
}

/** The checklist, grouped by when it is due. ``canTick`` decides which items this person may tick. */
export function Checklist({
  tasks,
  canTick,
  busyId,
  onTick,
  onSkip,
  extra,
}: {
  tasks: OnboardingTask[];
  canTick: (task: OnboardingTask) => boolean;
  busyId: number | null;
  onTick: (task: OnboardingTask, done: boolean) => void;
  onSkip?: (task: OnboardingTask, skipped: boolean) => void;
  extra?: (task: OnboardingTask) => React.ReactNode;
}) {
  const groups: { label: string; tasks: OnboardingTask[] }[] = [];
  for (const task of tasks) {
    const group = groups.find((g) => g.label === task.due_label);
    if (group) group.tasks.push(task);
    else groups.push({ label: task.due_label, tasks: [task] });
  }
  return (
    <Box>
      {groups.map((group) => (
        <Box key={group.label} sx={{ mb: 2 }}>
          <Typography variant="overline" sx={{ color: ccTokens.ink2, fontWeight: 700 }}>
            {group.label}
          </Typography>
          {group.tasks.map((task) => {
            const tickable = canTick(task);
            return (
              <Box
                key={task.id}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  py: 0.75,
                  borderBottom: `1px solid ${ccTokens.line}`,
                  opacity: task.status === 'skipped' ? 0.6 : 1,
                }}
              >
                <Checkbox
                  checked={task.status !== 'open'}
                  disabled={!tickable || busyId === task.id || task.status === 'skipped'}
                  onChange={(e) => onTick(task, e.target.checked)}
                  sx={{ p: 0.5 }}
                  inputProps={{ 'aria-label': task.label }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>{task.label}</Typography>
                    <Chip size="small" label={task.owner_label} sx={{ height: 20, fontSize: 11, bgcolor: OWNER_COLOR[task.owner] }} />
                  </Box>
                  {task.help && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {task.help}
                    </Typography>
                  )}
                  <TaskState task={task} />
                  {extra?.(task)}
                </Box>
                {onSkip && task.status !== 'done' && (
                  <Button size="small" color="inherit" disabled={busyId === task.id} onClick={() => onSkip(task, task.status !== 'skipped')}>
                    {task.status === 'skipped' ? 'Undo' : 'Not needed'}
                  </Button>
                )}
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

export function CountDialog({
  task,
  onboardingId,
  onClose,
  onDone,
}: {
  task: OnboardingTask | null;
  onboardingId: number;
  onClose: () => void;
  onDone: (detail: OnboardingDetail) => void;
}) {
  const [count, setCount] = useState('2');
  const [size, setSize] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (task) {
      setCount(String(task.data.count ?? 2));
      setSize(task.data.size ?? '');
      setError('');
    }
  }, [task]);
  if (!task) return null;
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{task.label}</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
          <TextField label="How many" value={count} onChange={(e) => setCount(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
          <TextField select label="Size" value={size} onChange={(e) => setSize(e.target.value)} fullWidth>
            {['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={async () => {
            try {
              const { data } = await setOnboardingTask(onboardingId, task.id, {
                status: 'done',
                data: { count: Number(count), size },
              });
              onDone(data);
            } catch (err) {
              setError(errorText(err, 'Could not save.'));
            }
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

async function openBlob(load: () => Promise<{ data: Blob }>, onError: (msg: string) => void) {
  const popup = window.open('', '_blank');
  try {
    const { data } = await load();
    const url = URL.createObjectURL(data);
    if (popup) popup.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    popup?.close();
    onError(errorText(err, 'Could not open the file.'));
  }
}

export function openHandbookPdf(signatureId: number, onError: (msg: string) => void) {
  return openBlob(() => getHandbookPdf(signatureId), onError);
}

/** Form I-9: Admin only, kept apart from the employee record. Upload the form and document copies, then Section 2. */
export function I9Dialog({
  onboarding,
  onClose,
  onChanged,
}: {
  onboarding: OnboardingDetail | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const id = onboarding?.id ?? 0;
  const i9 = useQuery({ queryKey: ['hiring', 'i9', id], queryFn: async () => (await getI9(id)).data, enabled: !!onboarding });
  const [kind, setKind] = useState<'form' | 'document'>('form');
  const [label, setLabel] = useState('');
  const [seen, setSeen] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setSeen(i9.data?.documents_seen ?? ''), [i9.data]);
  if (!onboarding) return null;
  const done = !!i9.data?.section2_done_at;

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await action();
      await i9.refetch();
      onChanged();
      enqueueSnackbar(ok, { variant: 'success' });
    } catch (err) {
      const data = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
      enqueueSnackbar(data ? Object.values(data).flat().join(' ') : errorText(err, 'Could not save.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Form I-9: {onboarding.user.name}
        <Typography variant="body2" color="text.secondary">
          Admin only, and kept apart from the employee record. Section 2 within 3 business days of the start, after you
          see the original documents in person. Kept until{' '}
          {i9.data
            ? new Date(`${i9.data.keep_until}T12:00`).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
            : '…'}
          .
        </Typography>
      </DialogTitle>
      <DialogContent>
        {i9.isError && <Alert severity="error">{errorText(i9.error, 'Could not load the I-9.')}</Alert>}
        <Stack spacing={1}>
          {(i9.data?.files ?? []).map((f) => (
            <Box key={f.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, border: `1px solid ${ccTokens.line}`, borderRadius: '8px' }}>
              <Chip size="small" label={f.kind_label} />
              <Typography sx={{ flex: 1, fontSize: 14 }} noWrap>
                {f.label || f.filename}
              </Typography>
              <Button size="small" onClick={() => openBlob(() => getI9FileBlob(id, f.id), (m) => enqueueSnackbar(m, { variant: 'error' }))}>
                Open
              </Button>
              {!done && (
                <Button size="small" color="inherit" disabled={busy} onClick={() => run(() => deleteI9File(id, f.id), 'File removed.')}>
                  Remove
                </Button>
              )}
            </Box>
          ))}
          {(i9.data?.files ?? []).length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No files yet. Scan the completed form (both sections) and, if you keep them, the document copies.
            </Typography>
          )}
        </Stack>
        {!done && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
            <TextField select size="small" label="What it is" value={kind} onChange={(e) => setKind(e.target.value as 'form' | 'document')} sx={{ minWidth: 170 }}>
              <MenuItem value="form">Form I-9</MenuItem>
              <MenuItem value="document">Document copy</MenuItem>
            </TextField>
            <TextField size="small" label="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth />
            <Button variant="outlined" disabled={busy} onClick={() => input.current?.click()} sx={{ whiteSpace: 'nowrap' }}>
              Add a scan
            </Button>
            <input
              ref={input}
              type="file"
              hidden
              accept=".pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void run(() => uploadI9File(id, file, kind, label), 'Scan added.').then(() => setLabel(''));
              }}
            />
          </Stack>
        )}
        <TextField
          label="Documents you saw (which list, which document)"
          placeholder="e.g. List B driver's license + List C Social Security card"
          helperText="Names only. Document numbers stay on the paper form; Dash removes any it is given."
          value={seen}
          onChange={(e) => setSeen(e.target.value)}
          fullWidth
          disabled={done}
          sx={{ mt: 2 }}
        />
        {done && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Section 2 done {shortDate(i9.data!.section2_done_at)} by {i9.data!.section2_by}.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Close
        </Button>
        {!done && (
          <Button variant="contained" disabled={busy || !seen.trim()} onClick={() => run(() => finishI9Section2(id, seen), 'I-9 Section 2 done.')}>
            Section 2 done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function nextMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Start onboarding for an applicant who is now an employee, or for any employee (hired outside Applicants). */
export function StartOnboardingDialog({
  open,
  applicationId,
  defaults,
  onClose,
  onDone,
}: {
  open: boolean;
  applicationId?: number;
  defaults?: { start_date?: string; start_time?: string | null; position?: string; name?: string; email?: string };
  onClose: () => void;
  onDone: (detail: OnboardingDetail, sent: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const careers = useQuery({ queryKey: ['hiring', 'careers'], queryFn: async () => (await getCareers()).data, enabled: open });
  const people = useQuery({ queryKey: ['hiring', 'onboarding-people'], queryFn: async () => (await getOnboardingPeople()).data, enabled: open && !applicationId });
  const [user, setUser] = useState<number | ''>('');
  const [startDate, setStartDate] = useState(nextMonday());
  const [startTime, setStartTime] = useState('09:00');
  const [manager, setManager] = useState<number | ''>('');
  const [position, setPosition] = useState('');
  const [send, setSend] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { review, dialog: reviewDialog } = useEmailReview();

  useEffect(() => {
    if (!open) return;
    setUser('');
    setStartDate(defaults?.start_date || nextMonday());
    setStartTime((defaults?.start_time || '09:00').slice(0, 5));
    setManager('');
    setPosition(defaults?.position || '');
    setSend(true);
    setError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    setError('');
    try {
      const request = {
        ...(applicationId ? { application: applicationId } : { user: user === '' ? undefined : user }),
        start_date: startDate,
        start_time: startTime,
        manager: manager === '' ? null : manager,
        position,
        send_email: send,
      };
      // With the first-day note: read it first (the review), then start.
      const data = send
        ? await review({
            title: 'Start onboarding',
            preview: () => previewStartOnboarding(request),
            commit: async (email) => (await startOnboarding({ ...request, email })).data,
            sendLabel: 'Start and send',
            skipLabel: 'Start without emailing',
          })
        : (await startOnboarding(request)).data;
      if (!data) return; // Cancel: nothing started
      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
      onDone(data.onboarding, data.sent);
    } catch (err) {
      const data = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
      setError(data ? Object.values(data).flat().join(' ') : errorText(err, 'Could not start onboarding.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Start onboarding{defaults?.name ? `: ${defaults.name}` : ''}
        <Typography variant="body2" color="text.secondary">
          Makes their checklist and, if you like, emails the first-day note (when, where, what to wear, what to bring
          for the I-9).
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!applicationId && (
            <TextField select label="Employee" value={user} onChange={(e) => setUser(Number(e.target.value))} fullWidth>
              {(people.data ?? []).map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name} ({p.role})
                </MenuItem>
              ))}
            </TextField>
          )}
          <Stack direction="row" spacing={2}>
            <TextField label="First day" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          </Stack>
          <TextField label="Position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="From the offer or the employee record" fullWidth />
          <TextField
            select
            label="Their manager"
            value={manager}
            onChange={(e) => setManager(e.target.value === '' ? '' : Number(e.target.value))}
            SelectProps={{ displayEmpty: true }}
            InputLabelProps={{ shrink: true }}
            fullWidth
          >
            <MenuItem value="">{applicationId ? 'From the offer (or the role)' : 'Nobody yet'}</MenuItem>
            {(careers.data?.indexes.staff ?? []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={<Checkbox checked={send} onChange={(e) => setSend(e.target.checked)} />}
            label={`Email the first-day note${defaults?.email ? ` to ${defaults.email}` : ''}`}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={busy || (!applicationId && user === '')}>
          {send ? 'Next: read the email' : 'Start onboarding'}
        </Button>
      </DialogActions>
      {reviewDialog}
    </Dialog>
  );
}
