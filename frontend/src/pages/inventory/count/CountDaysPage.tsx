import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  addSection,
  apiMessage,
  closeDay,
  deleteDay,
  deleteRun,
  getDay,
  getRunScans,
  listDays,
  listSections,
  removeScan,
  reopenDay,
  restoreScan,
  updateRun,
  updateSection,
  type DayDetail,
  type DaySection,
  type DaySummary,
  type Issue,
  type RunSummary,
  type ScanResult,
  type Section,
} from '../../../api/stocktake.api';
import { useAuth } from '../../../contexts/AuthContext';
import { ACTION_WORDS } from './countProblems';
import { clockTime, formatElapsed, ratePerMinute } from './countTimer';
import { CountNav } from './CountNav';
import SectionProgress, { StateChip, sectionCountLine, shortDay } from './SectionProgress';

const pct = (a: number, b: number) => (b ? `${Math.min(100, Math.round((a / b) * 100))}%` : '');
const plain = { textTransform: 'none' as const };

/** Phones and small tablets get cards; wide screens get tables. */
function useNarrow(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}

function dayName(d: DaySummary): string {
  if (!d.day) return d.name;
  const date = new Date(`${d.day}T12:00:00`);
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function runSeconds(r: RunSummary, serverNow?: string): number {
  const end = r.stopped_at ? Date.parse(r.stopped_at) : serverNow ? Date.parse(serverNow) : Date.now();
  return Math.max(0, (end - Date.parse(r.started_at)) / 1000);
}

function scanWords(s: ScanResult): string {
  if (s.removed) return 'Removed';
  const base =
    s.result === 'ok' ? 'Counted' : s.result === 'already' ? 'Already scanned' : s.result === 'odd' ? `System: ${s.item_status}` : s.result === 'unknown' ? 'Not recognized' : 'Not our tag';
  return s.issue_action && s.issue_action !== 'cleared' ? `${base} · ${ACTION_WORDS[s.issue_action]}` : base;
}

function whereItWent(i: Issue): string {
  return `${i.cart || ACTION_WORDS[i.action]}${i.target_section ? `, belongs in ${i.target_section}` : ''}`;
}

/** A day is open for scanning only on the day itself. */
function isLive(d: DaySummary): boolean {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return d.status === 'open' && d.day === today;
}

function DayChip({ day }: { day: DaySummary }) {
  if (isLive(day)) return <Chip size="small" color="info" label="Open" />;
  return <Chip size="small" label={day.status === 'closed' ? 'Closed' : 'Ended'} />;
}

function RunChip({ run }: { run: RunSummary }) {
  if (run.status === 'bad') return <Chip size="small" color="error" label="Bad run" />;
  if (run.status === 'open') return <Chip size="small" color="info" label="Scanning now" />;
  if (run.section_complete) return <Chip size="small" color="success" label="Complete" />;
  return <Chip size="small" label="Not finished" />;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{label}</Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{sub}</Typography>}
    </Box>
  );
}

/** The Super User's list of sections: add, rename, reorder, turn off. */
function SectionsPanel() {
  const [rows, setRows] = useState<Section[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const reload = useCallback(() => listSections().then(setRows).catch(() => setError('Could not load sections.')), []);
  useEffect(() => void reload(), [reload]);

  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(apiMessage(e, 'Could not save.'));
    }
  };
  const move = (i: number, by: number) => {
    const a = rows[i];
    const b = rows[i + by];
    if (!a || !b) return;
    void act(async () => {
      await updateSection(a.id, { order: b.order === a.order ? a.order + by : b.order });
      await updateSection(b.id, { order: a.order });
    });
  };
  const add = () => name.trim() && void act(() => addSection(name.trim()).then(() => setName('')));

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 }, border: 1, borderColor: 'divider', borderRadius: 2, mb: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>
        Sections
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 1 }}>The parts of the floor a person scans in one go. Turned-off sections keep their history.</Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {rows.map((s, i) => (
        <Stack key={s.id} direction="row" alignItems="center" flexWrap="wrap" useFlexGap sx={{ py: 0.5, columnGap: 1 }}>
          <TextField
            defaultValue={s.name}
            size="small"
            sx={{ flex: '1 1 180px', maxWidth: 320 }}
            inputProps={{ maxLength: 60, 'aria-label': `Name of section ${s.name}` }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== s.name) void act(() => updateSection(s.id, { name: v }));
            }}
          />
          <Stack direction="row" alignItems="center">
            <Button size="small" disabled={i === 0} onClick={() => move(i, -1)} sx={{ minWidth: 44 }}>
              Up
            </Button>
            <Button size="small" disabled={i === rows.length - 1} onClick={() => move(i, 1)} sx={{ minWidth: 52 }}>
              Down
            </Button>
            <Switch checked={s.is_active} onChange={(e) => void act(() => updateSection(s.id, { is_active: e.target.checked }))} inputProps={{ 'aria-label': `${s.name} in use` }} />
            <Typography sx={{ fontSize: 13, color: 'text.secondary', width: 28 }}>{s.is_active ? 'On' : 'Off'}</Typography>
          </Stack>
        </Stack>
      ))}
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <TextField
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="New section name"
          size="small"
          sx={{ flex: 1, maxWidth: 320 }}
          inputProps={{ maxLength: 60, 'aria-label': 'New section name' }}
        />
        <Button variant="outlined" disabled={!name.trim()} onClick={add} sx={{ ...plain, whiteSpace: 'nowrap' }}>
          Add section
        </Button>
      </Stack>
    </Box>
  );
}

/** One session's scans, newest first, with remove and put back. */
function RunScansDialog({ run, onClose }: { run: RunSummary | null; onClose: (changed: boolean) => void }) {
  const narrow = useNarrow();
  const [scans, setScans] = useState<ScanResult[] | null>(null);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    setScans(null);
    setChanged(false);
    if (run) void getRunScans(run.id).then((r) => setScans(r.scans));
  }, [run]);

  const toggle = async (s: ScanResult) => {
    const res = s.removed ? await restoreScan(s.id) : await removeScan(s.id);
    setChanged(true);
    setScans((list) => (list ? list.map((x) => (x.id === s.id ? { ...x, removed: res.removed } : x)) : list));
  };
  const toggleButton = (s: ScanResult) => (
    <Button size="small" color={s.removed ? 'primary' : 'error'} onClick={() => void toggle(s)} sx={{ ...plain, flexShrink: 0 }}>
      {s.removed ? 'Put back' : 'Remove'}
    </Button>
  );

  return (
    <Dialog open={!!run} onClose={() => onClose(changed)} fullWidth maxWidth="md" fullScreen={narrow}>
      <DialogTitle sx={{ pb: 1 }}>
        {run?.section.name}: {run?.user}, {clockTime(run?.started_at)}
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 1.5, md: 3 } }}>
        {!scans && <CircularProgress />}
        {scans && scans.length === 0 && <Typography>No scans in this session.</Typography>}
        {scans && scans.length > 0 && narrow && (
          <Box>
            {scans.map((s) => (
              <Stack key={s.id} direction="row" alignItems="center" spacing={1} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider', opacity: s.removed ? 0.5 : 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 14 }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{s.code}</span> {s.title}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
                    #{s.seq} · {clockTime(s.scanned_at)} · {scanWords(s)}
                  </Typography>
                </Box>
                {toggleButton(s)}
              </Stack>
            ))}
          </Box>
        )}
        {scans && scans.length > 0 && !narrow && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Time</TableCell>
                <TableCell>Code</TableCell>
                <TableCell>Item</TableCell>
                <TableCell>Result</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {scans.map((s) => (
                <TableRow key={s.id} sx={{ opacity: s.removed ? 0.5 : 1 }}>
                  <TableCell>{s.seq}</TableCell>
                  <TableCell>{clockTime(s.scanned_at)}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{s.code}</TableCell>
                  <TableCell>{s.title}</TableCell>
                  <TableCell>{scanWords(s)}</TableCell>
                  <TableCell align="right">{toggleButton(s)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(changed)}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/** "Are you sure" for a delete that can't be undone. */
function ConfirmDelete({ what, detail, onCancel, onDelete }: { what: string | null; detail: string; onCancel: () => void; onDelete: () => void }) {
  return (
    <Dialog open={!!what} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle>Delete {what}?</DialogTitle>
      <DialogContent>
        <Typography>{detail} This can&apos;t be undone.</Typography>
        <Typography sx={{ mt: 1, color: 'text.secondary' }}>To keep the record but leave it out of the count, use Mark bad instead.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} sx={plain}>
          Keep it
        </Button>
        <Button variant="contained" color="error" onClick={onDelete} sx={plain}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface RunActions {
  isSuper: boolean;
  onScans: (r: RunSummary) => void;
  onBad: (r: RunSummary) => void;
  onComplete: (r: RunSummary) => void;
  onDelete: (r: RunSummary) => void;
}

function RunButtons({ run, actions }: { run: RunSummary; actions: RunActions }) {
  return (
    <>
      <Button size="small" onClick={() => actions.onScans(run)} sx={plain}>
        Scans
      </Button>
      {run.status !== 'open' && (
        <Button size="small" color={run.status === 'bad' ? 'primary' : 'error'} onClick={() => actions.onBad(run)} sx={plain}>
          {run.status === 'bad' ? 'Count it again' : 'Mark bad'}
        </Button>
      )}
      {run.status === 'stopped' && (
        <Button size="small" onClick={() => actions.onComplete(run)} sx={plain}>
          {run.section_complete ? 'Not complete' : 'Mark complete'}
        </Button>
      )}
      {actions.isSuper && (
        <Button size="small" color="error" onClick={() => actions.onDelete(run)} sx={plain}>
          Delete
        </Button>
      )}
    </>
  );
}

/** Phone layout: one card per section, its sessions inside. */
function SectionCards({ day, actions }: { day: DayDetail; actions: RunActions }) {
  return (
    <Stack spacing={1.5} sx={{ mb: 3 }}>
      {day.sections.map((s: DaySection) => (
        <Box key={s.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, bgcolor: 'action.hover' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 800, fontSize: 16 }}>
                {s.name}
                {!s.is_active && ' (off)'}
              </Typography>
              <Typography noWrap sx={{ fontSize: 13, color: 'text.secondary' }}>
                {sectionCountLine(s) || 'Nothing counted yet'}
              </Typography>
            </Box>
            <StateChip state={s.state} />
          </Stack>
          {s.runs.length === 0 && <Typography sx={{ px: 1.5, py: 1, fontSize: 13, color: 'text.secondary' }}>No sessions.</Typography>}
          {s.runs.map((r) => {
            const secs = runSeconds(r, day.server_now);
            const rate = ratePerMinute(r.scans, secs);
            return (
              <Box key={r.id} sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: 'divider', opacity: r.status === 'bad' ? 0.6 : 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
                    {r.user || 'Unknown'}
                  </Typography>
                  <RunChip run={r} />
                </Stack>
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                  {clockTime(r.started_at)}
                  {r.stopped_at ? ` to ${clockTime(r.stopped_at)}` : ''} · {formatElapsed(secs)}
                </Typography>
                <Typography sx={{ fontSize: 14 }}>
                  <b>{r.scans}</b> scans{rate ? ` · ${rate}/min` : ''}
                  {r.removed ? ` · ${r.removed} removed` : ''}
                  {r.issues_total ? ` · ${r.issues_total} ${r.issues_total === 1 ? 'problem' : 'problems'}` : ''}
                  {r.issues_pending ? ` (${r.issues_pending} open)` : ''}
                </Typography>
                {r.note && <Typography sx={{ fontSize: 13, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>&quot;{r.note}&quot;</Typography>}
                <Stack direction="row" flexWrap="wrap" sx={{ ml: -0.75, mt: 0.25 }}>
                  <RunButtons run={r} actions={actions} />
                </Stack>
              </Box>
            );
          })}
        </Box>
      ))}
    </Stack>
  );
}

/** Wide layout: one table, a row per session under its section. */
function SectionTable({ day, actions }: { day: DayDetail; actions: RunActions }) {
  return (
    <Box sx={{ overflowX: 'auto', mb: 3 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Section / who</TableCell>
            <TableCell>Start</TableCell>
            <TableCell>Stop</TableCell>
            <TableCell align="right">Time</TableCell>
            <TableCell align="right">Scans</TableCell>
            <TableCell align="right">Per min</TableCell>
            <TableCell align="right">Problems</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Note</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {day.sections.map((s) => (
            <Fragment key={s.id}>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell colSpan={4} sx={{ fontWeight: 800 }}>
                  {s.name}
                  {!s.is_active && ' (off)'}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800 }}>
                  {s.counted.toLocaleString()}
                </TableCell>
                <TableCell colSpan={2} sx={{ color: 'text.secondary' }}>
                  items counted{s.expected != null ? ` · ${s.expected.toLocaleString()} last time (${shortDay(s.expected_day)})` : ''}
                </TableCell>
                <TableCell colSpan={3}>
                  <StateChip state={s.state} />
                </TableCell>
              </TableRow>
              {s.runs.map((r) => {
                const secs = runSeconds(r, day.server_now);
                return (
                  <TableRow key={r.id} sx={{ opacity: r.status === 'bad' ? 0.6 : 1 }}>
                    <TableCell sx={{ pl: 4 }}>{r.user || 'Unknown'}</TableCell>
                    <TableCell>{clockTime(r.started_at)}</TableCell>
                    <TableCell>{clockTime(r.stopped_at)}</TableCell>
                    <TableCell align="right">{formatElapsed(secs)}</TableCell>
                    <TableCell align="right">
                      {r.scans}
                      {r.removed ? ` (+${r.removed} removed)` : ''}
                    </TableCell>
                    <TableCell align="right">{ratePerMinute(r.scans, secs) || ''}</TableCell>
                    <TableCell align="right">
                      {r.issues_total}
                      {r.issues_pending ? ` (${r.issues_pending} open)` : ''}
                    </TableCell>
                    <TableCell>
                      <RunChip run={r} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 260, whiteSpace: 'pre-wrap' }}>{r.note}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <RunButtons run={r} actions={actions} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function ProblemsList({ issues, narrow }: { issues: Issue[]; narrow: boolean }) {
  if (issues.length === 0) return null;
  if (narrow) {
    return (
      <Box>
        {issues.map((i) => (
          <Box key={i.id} sx={{ py: 1, borderBottom: 1, borderColor: 'divider', opacity: i.run_bad ? 0.5 : 1 }}>
            <Stack direction="row" alignItems="baseline" spacing={1}>
              <Typography sx={{ fontWeight: 800, fontSize: 14, flex: 1, minWidth: 0 }} noWrap>
                {i.kind_label}
              </Typography>
              {i.fixed_at ? <Chip size="small" color="success" label="Fixed" /> : i.action === 'pending' ? <Chip size="small" color="warning" label="Needs an answer" /> : null}
            </Stack>
            <Typography noWrap sx={{ fontSize: 14 }}>
              <span style={{ fontFamily: 'monospace' }}>{i.code || 'No tag'}</span> {i.item?.title}
              {i.item ? ` · $${Number(i.item.price).toFixed(2)}` : ''}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              {i.section} · {i.by} · {whereItWent(i)}
            </Typography>
            {i.detail && <Typography sx={{ fontSize: 13, fontStyle: 'italic' }}>&quot;{i.detail}&quot;</Typography>}
          </Box>
        ))}
      </Box>
    );
  }
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Problem</TableCell>
            <TableCell>Code</TableCell>
            <TableCell>Item</TableCell>
            <TableCell align="right">Price</TableCell>
            <TableCell>Section</TableCell>
            <TableCell>By</TableCell>
            <TableCell>Where it went</TableCell>
            <TableCell>Note</TableCell>
            <TableCell>Fixed</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {issues.map((i) => (
            <TableRow key={i.id} sx={{ opacity: i.run_bad ? 0.5 : 1 }}>
              <TableCell>{i.kind_label}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace' }}>{i.code}</TableCell>
              <TableCell>{i.item?.title}</TableCell>
              <TableCell align="right">{i.item ? `$${Number(i.item.price).toFixed(2)}` : ''}</TableCell>
              <TableCell>{i.section}</TableCell>
              <TableCell>{i.by}</TableCell>
              <TableCell>{whereItWent(i)}</TableCell>
              <TableCell>{i.detail}</TableCell>
              <TableCell>{i.fixed_at ? `${i.fixed_by} ${clockTime(i.fixed_at)}` : ''}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function DayView({ id }: { id: number }) {
  const narrow = useNarrow();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuper = !!user?.is_superuser;
  const [day, setDay] = useState<DayDetail | null>(null);
  const [error, setError] = useState('');
  const [scansOf, setScansOf] = useState<RunSummary | null>(null);
  const [deleting, setDeleting] = useState<RunSummary | 'day' | null>(null);
  const reload = useCallback(
    () =>
      getDay(id)
        .then(setDay)
        .catch(() => setError('Could not load this day.')),
    [id],
  );
  useEffect(() => void reload(), [reload]);

  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(apiMessage(e, 'Could not save.'));
    }
  };

  const confirmDelete = async () => {
    const target = deleting;
    setDeleting(null);
    if (!target || !day) return;
    if (target === 'day') {
      try {
        await deleteDay(day.id);
        navigate('/inventory/count/days');
      } catch (e) {
        setError(apiMessage(e, 'Could not delete the day.'));
      }
    } else {
      await act(() => deleteRun(target.id));
    }
  };

  if (error && !day) return <Alert severity="error">{error}</Alert>;
  if (!day) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const actions: RunActions = {
    isSuper,
    onScans: setScansOf,
    onBad: (r) => void act(() => updateRun(r.id, { bad: r.status !== 'bad' })),
    onComplete: (r) => void act(() => updateRun(r.id, { section_complete: !r.section_complete })),
    onDelete: setDeleting,
  };

  return (
    <Box>
      <Button component={RouterLink} to="/inventory/count/days" size="small" sx={{ ...plain, ml: -0.5 }}>
        ‹ All days
      </Button>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {dayName(day)}
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>{isLive(day) ? 'Open: numbers change as scans come in.' : day.status === 'closed' ? 'Closed.' : 'Ended.'}</Typography>
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button onClick={() => void reload()} variant="outlined" sx={{ ...plain, flex: { xs: 1, md: 'none' } }}>
            Refresh
          </Button>
          <Button component={RouterLink} to={`/inventory/count/${day.id}/report`} variant="outlined" sx={{ ...plain, flex: { xs: 1, md: 'none' }, whiteSpace: 'nowrap' }}>
            Not found
          </Button>
          <Button
            variant="contained"
            onClick={() => void act(() => (day.status === 'open' ? closeDay(day.id) : reopenDay(day.id)))}
            sx={{ ...plain, flex: { xs: 1, md: 'none' }, whiteSpace: 'nowrap' }}
          >
            {day.status === 'open' ? 'Close the day' : 'Reopen'}
          </Button>
        </Stack>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Box sx={{ maxWidth: 520, mb: 2 }}>
        <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Sections</Typography>
        <SectionProgress done={day.sections_done} inProgress={day.sections_in_progress} total={day.sections_total} />
      </Box>

      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 220px))' }, mb: 3 }}>
        <Stat label="Counted" value={day.counted.toLocaleString()} sub={`of ${day.expected.toLocaleString()} (${pct(day.counted, day.expected)})`} />
        <Stat label="Sessions" value={String(day.runs)} sub={`${day.scans.toLocaleString()} scans`} />
        <Stat label="Need an answer" value={String(day.issues_pending)} sub="problems not answered" />
        <Stat label="Waiting in carts" value={String(day.to_fix)} sub="to fix or relocate" />
      </Box>

      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
        Sections and sessions
      </Typography>
      {narrow ? <SectionCards day={day} actions={actions} /> : <SectionTable day={day} actions={actions} />}

      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
        Problems ({day.issues.length})
      </Typography>
      <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1 }}>
        {day.tally.map((t) => (
          <Chip key={t.kind} label={`${t.label}: ${t.n}`} />
        ))}
        {day.tally.length === 0 && <Typography sx={{ color: 'text.secondary' }}>None yet.</Typography>}
      </Stack>
      <ProblemsList issues={day.issues} narrow={narrow} />

      {isSuper && (
        <Box sx={{ mt: 4 }}>
          <Button color="error" onClick={() => setDeleting('day')} sx={plain}>
            Delete this whole day
          </Button>
        </Box>
      )}

      <RunScansDialog
        run={scansOf}
        onClose={(changed) => {
          setScansOf(null);
          if (changed) void reload();
        }}
      />
      <ConfirmDelete
        what={deleting === 'day' ? `all of ${dayName(day)}` : deleting ? `${deleting.user || 'this'}'s session in ${deleting.section.name}` : null}
        detail={
          deleting === 'day'
            ? `Its ${day.runs} sessions, ${day.scans.toLocaleString()} scans and all its problems are deleted for good.`
            : deleting
              ? `Its ${deleting.scans + deleting.removed} scans and ${deleting.issues_total} problems are deleted for good.`
              : ''
        }
        onCancel={() => setDeleting(null)}
        onDelete={() => void confirmDelete()}
      />
    </Box>
  );
}

function DaysList({ isSuper }: { isSuper: boolean }) {
  const narrow = useNarrow();
  const navigate = useNavigate();
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<DaySummary | null>(null);
  const load = useCallback(() => {
    listDays()
      .then(setDays)
      .catch(() => setError('Could not load the counts. This page is for managers.'));
  }, []);
  useEffect(load, [load]);
  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteDay(deleting.id);
      setDeleting(null);
      load();
    } catch (e) {
      setDeleting(null);
      setError(apiMessage(e, 'Could not delete the count.'));
    }
  };
  const confirm = (
    <ConfirmDelete
      what={deleting ? `the count of ${dayName(deleting)}` : null}
      detail={deleting ? `Its ${deleting.runs} sessions, ${deleting.scans.toLocaleString()} scans and all its problems are deleted for good.` : ''}
      onCancel={() => setDeleting(null)}
      onDelete={() => void confirmDelete()}
    />
  );

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!days) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  const open = (d: DaySummary) => navigate(d.trial ? `/inventory/count/${d.id}/report` : `/inventory/count/days/${d.id}`);
  const status = (d: DaySummary) => <DayChip day={d} />;

  if (days.length === 0) {
    return (
      <Box sx={{ p: { xs: 2.5, md: 4 }, mb: 3, textAlign: 'center', border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
        <Typography sx={{ fontWeight: 800, fontSize: 20 }}>No counts yet</Typography>
        <Typography sx={{ color: 'text.secondary', maxWidth: 480, mx: 'auto', mt: 0.5 }}>
          The first scan of a day starts that day&apos;s count. Each day shows here with what was counted, the sessions, and the problems.
        </Typography>
        <Button component={RouterLink} to="/inventory/count" variant="contained" sx={{ ...plain, mt: 2 }}>
          Start counting
        </Button>
      </Box>
    );
  }
  if (narrow) {
    return (
      <Stack spacing={1.5} sx={{ mb: 3 }}>
        {days.map((d) => (
          <Box key={d.id} onClick={() => open(d)} role="button" sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, cursor: 'pointer', '&:active': { bgcolor: 'action.hover' } }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography sx={{ fontWeight: 800, fontSize: 16, flex: 1, minWidth: 0 }} noWrap>
                {dayName(d)}
                {d.trial && ' (trial)'}
              </Typography>
              {status(d)}
            </Stack>
            <Typography sx={{ fontSize: 14, mb: d.trial ? 0 : 1 }}>
              <b>{d.counted.toLocaleString()}</b> of {d.expected.toLocaleString()} counted ({pct(d.counted, d.expected) || '0%'})
            </Typography>
            {!d.trial && (
              <>
                <SectionProgress done={d.sections_done} inProgress={d.sections_in_progress} total={d.sections_total} dense />
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.75 }}>
                  {d.runs} {d.runs === 1 ? 'session' : 'sessions'}
                  {d.issues_pending ? ` · ${d.issues_pending} need an answer` : ''}
                  {d.to_fix ? ` · ${d.to_fix} in carts` : ''}
                </Typography>
              </>
            )}
            {isSuper && (
              <Button
                size="small"
                color="error"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleting(d);
                }}
                sx={{ ...plain, mt: 0.5, ml: -0.5 }}
              >
                Delete this count
              </Button>
            )}
          </Box>
        ))}
        {confirm}
      </Stack>
    );
  }
  return (
    <Box sx={{ overflowX: 'auto', mb: 3, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Day</TableCell>
            <TableCell align="right">Counted</TableCell>
            <TableCell align="right">Expected</TableCell>
            <TableCell align="right">Found</TableCell>
            <TableCell align="right">Sections done</TableCell>
            <TableCell align="right">In progress</TableCell>
            <TableCell align="right">Not started</TableCell>
            <TableCell align="right">Sessions</TableCell>
            <TableCell align="right">Need an answer</TableCell>
            <TableCell align="right">In carts</TableCell>
            <TableCell>Status</TableCell>
            {isSuper && <TableCell />}
          </TableRow>
        </TableHead>
        <TableBody>
          {days.map((d) => (
            <TableRow key={d.id} hover sx={{ cursor: 'pointer' }} onClick={() => open(d)}>
              <TableCell sx={{ fontWeight: 700 }}>
                {dayName(d)}
                {d.trial && ' (trial)'}
              </TableCell>
              <TableCell align="right">{d.counted.toLocaleString()}</TableCell>
              <TableCell align="right">{d.expected.toLocaleString()}</TableCell>
              <TableCell align="right">{pct(d.counted, d.expected)}</TableCell>
              <TableCell align="right">{d.trial ? '' : d.sections_done}</TableCell>
              <TableCell align="right">{d.trial ? '' : d.sections_in_progress}</TableCell>
              <TableCell align="right">{d.trial ? '' : Math.max(0, d.sections_total - d.sections_done - d.sections_in_progress)}</TableCell>
              <TableCell align="right">{d.trial ? '' : d.runs}</TableCell>
              <TableCell align="right">{d.issues_pending || ''}</TableCell>
              <TableCell align="right">{d.to_fix || ''}</TableCell>
              <TableCell>{status(d)}</TableCell>
              {isSuper && (
                <TableCell align="right" sx={{ py: 0 }}>
                  <Button
                    size="small"
                    color="error"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleting(d);
                    }}
                    sx={plain}
                  >
                    Delete
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {confirm}
    </Box>
  );
}

/** Count sessions: every day's count, its sections and sessions. Managers and up. Cards on a phone, tables on a wide screen. */
export default function CountDaysPage() {
  const { id } = useParams();
  const { user } = useAuth();
  return (
    <Box sx={{ p: { xs: 1, md: 2 }, width: '100%', minWidth: 0, maxWidth: 1300, mx: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {id ? (
        <DayView id={Number(id)} />
      ) : (
        <>
          <CountNav current="sessions" />
          <Box sx={{ mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Sessions
            </Typography>
            <Typography sx={{ color: 'text.secondary' }}>Every day&apos;s count: what was counted, by whom, and what still needs an answer.</Typography>
          </Box>
          <DaysList isSuper={!!user?.is_superuser} />
          {user?.is_superuser && <SectionsPanel />}
        </>
      )}
    </Box>
  );
}
