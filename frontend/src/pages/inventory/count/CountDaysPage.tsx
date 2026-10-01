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
} from '@mui/material';
import {
  addSection,
  apiMessage,
  closeDay,
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
  type DaySummary,
  type RunSummary,
  type ScanResult,
  type Section,
} from '../../../api/stocktake.api';
import { useAuth } from '../../../contexts/AuthContext';
import { ACTION_WORDS } from './countProblems';
import { clockTime, formatElapsed, ratePerMinute } from './countTimer';

const pct = (a: number, b: number) => (b ? `${Math.min(100, Math.round((a / b) * 100))}%` : '');

function dayName(d: DaySummary): string {
  if (!d.day) return d.name;
  const date = new Date(`${d.day}T12:00:00`);
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function runSeconds(r: RunSummary, serverNow?: string): number {
  const end = r.stopped_at ? Date.parse(r.stopped_at) : serverNow ? Date.parse(serverNow) : Date.now();
  return Math.max(0, (end - Date.parse(r.started_at)) / 1000);
}

function RunChip({ run }: { run: RunSummary }) {
  if (run.status === 'bad') return <Chip size="small" color="error" label="Bad run" />;
  if (run.status === 'open') return <Chip size="small" color="info" label="Scanning now" />;
  if (run.section_complete) return <Chip size="small" color="success" label="Complete" />;
  return <Chip size="small" label="Not finished" />;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, minWidth: 130 }}>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{label}</Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 900 }}>{value}</Typography>
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

  return (
    <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, mb: 3 }}>
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
        <Stack key={s.id} direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
          <TextField
            defaultValue={s.name}
            size="small"
            sx={{ flex: 1, maxWidth: 320 }}
            inputProps={{ maxLength: 60, 'aria-label': `Name of section ${s.name}` }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== s.name) void act(() => updateSection(s.id, { name: v }));
            }}
          />
          <Button size="small" disabled={i === 0} onClick={() => move(i, -1)}>
            Up
          </Button>
          <Button size="small" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
            Down
          </Button>
          <Switch checked={s.is_active} onChange={(e) => void act(() => updateSection(s.id, { is_active: e.target.checked }))} inputProps={{ 'aria-label': `${s.name} in use` }} />
          <Typography sx={{ fontSize: 13, color: 'text.secondary', width: 40 }}>{s.is_active ? 'On' : 'Off'}</Typography>
        </Stack>
      ))}
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <TextField
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && void act(() => addSection(name.trim()).then(() => setName('')))}
          placeholder="New section name"
          size="small"
          sx={{ flex: 1, maxWidth: 320 }}
          inputProps={{ maxLength: 60, 'aria-label': 'New section name' }}
        />
        <Button variant="outlined" disabled={!name.trim()} onClick={() => void act(() => addSection(name.trim()).then(() => setName('')))} sx={{ textTransform: 'none' }}>
          Add section
        </Button>
      </Stack>
    </Box>
  );
}

/** One run's scans, newest first, with remove and put back. */
function RunScansDialog({ run, onClose }: { run: RunSummary | null; onClose: (changed: boolean) => void }) {
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

  return (
    <Dialog open={!!run} onClose={() => onClose(changed)} fullWidth maxWidth="md">
      <DialogTitle>
        {run?.section.name}: {run?.user}, {clockTime(run?.started_at)}
      </DialogTitle>
      <DialogContent>
        {!scans && <CircularProgress />}
        {scans && scans.length === 0 && <Typography>No scans in this run.</Typography>}
        {scans && scans.length > 0 && (
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
                  <TableCell>
                    {s.removed ? 'Removed' : s.result === 'ok' ? 'Counted' : s.result === 'already' ? 'Already scanned' : s.result === 'odd' ? `System: ${s.item_status}` : s.result === 'unknown' ? 'Not recognized' : 'Not our tag'}
                    {s.issue_action && s.issue_action !== 'cleared' ? ` · ${ACTION_WORDS[s.issue_action]}` : ''}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" color={s.removed ? 'primary' : 'error'} onClick={() => void toggle(s)} sx={{ textTransform: 'none' }}>
                      {s.removed ? 'Put back' : 'Remove'}
                    </Button>
                  </TableCell>
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

function DayView({ id }: { id: number }) {
  const [day, setDay] = useState<DayDetail | null>(null);
  const [error, setError] = useState('');
  const [scansOf, setScansOf] = useState<RunSummary | null>(null);
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

  if (error && !day) return <Alert severity="error">{error}</Alert>;
  if (!day) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {dayName(day)}
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>{day.status === 'open' ? 'Open: numbers change as scans come in.' : 'Closed.'}</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button component={RouterLink} to="/inventory/count/days" sx={{ textTransform: 'none' }}>
            All days
          </Button>
          <Button onClick={() => void reload()} sx={{ textTransform: 'none' }}>
            Refresh
          </Button>
          <Button component={RouterLink} to={`/inventory/count/${day.id}/report`} variant="outlined" sx={{ textTransform: 'none' }}>
            What was not found
          </Button>
          <Button variant="contained" onClick={() => void act(() => (day.status === 'open' ? closeDay(day.id) : reopenDay(day.id)))} sx={{ textTransform: 'none' }}>
            {day.status === 'open' ? 'Close the day' : 'Reopen the day'}
          </Button>
        </Stack>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{ mb: 3 }}>
        <Stat label="Counted" value={day.counted.toLocaleString()} sub={`of ${day.expected.toLocaleString()} expected (${pct(day.counted, day.expected)})`} />
        <Stat label="Sections done" value={`${day.sections_done} of ${day.sections_total}`} />
        <Stat label="Runs" value={String(day.runs)} sub={`${day.scans.toLocaleString()} scans`} />
        <Stat label="Need an answer" value={String(day.issues_pending)} sub="problems the scanner has not answered" />
        <Stat label="Waiting in carts" value={String(day.to_fix)} sub="for PR Fix-it or relocating" />
      </Stack>

      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
        Sections and runs
      </Typography>
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
                    items counted
                  </TableCell>
                  <TableCell colSpan={3}>
                    {s.complete ? <Chip size="small" color="success" label="Complete" /> : s.runs.length ? <Chip size="small" color="warning" label="Not finished" /> : <Chip size="small" label="Not started" />}
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
                        <Button size="small" onClick={() => setScansOf(r)} sx={{ textTransform: 'none' }}>
                          Scans
                        </Button>
                        {r.status !== 'open' && (
                          <Button size="small" color={r.status === 'bad' ? 'primary' : 'error'} onClick={() => void act(() => updateRun(r.id, { bad: r.status !== 'bad' }))} sx={{ textTransform: 'none' }}>
                            {r.status === 'bad' ? 'Count it again' : 'Mark bad'}
                          </Button>
                        )}
                        {r.status === 'stopped' && (
                          <Button size="small" onClick={() => void act(() => updateRun(r.id, { section_complete: !r.section_complete }))} sx={{ textTransform: 'none' }}>
                            {r.section_complete ? 'Not complete' : 'Mark complete'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
        Problems ({day.issues.length})
      </Typography>
      <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1 }}>
        {day.tally.map((t) => (
          <Chip key={t.kind} label={`${t.label}: ${t.n}`} />
        ))}
        {day.tally.length === 0 && <Typography sx={{ color: 'text.secondary' }}>None yet.</Typography>}
      </Stack>
      {day.issues.length > 0 && (
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
              {day.issues.map((i) => (
                <TableRow key={i.id} sx={{ opacity: i.run_bad ? 0.5 : 1 }}>
                  <TableCell>{i.kind_label}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{i.code}</TableCell>
                  <TableCell>{i.item?.title}</TableCell>
                  <TableCell align="right">{i.item ? `$${Number(i.item.price).toFixed(2)}` : ''}</TableCell>
                  <TableCell>{i.section}</TableCell>
                  <TableCell>{i.by}</TableCell>
                  <TableCell>
                    {i.cart || ACTION_WORDS[i.action]}
                    {i.target_section ? ` → ${i.target_section}` : ''}
                  </TableCell>
                  <TableCell>{i.detail}</TableCell>
                  <TableCell>{i.fixed_at ? `${i.fixed_by} ${clockTime(i.fixed_at)}` : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <RunScansDialog
        run={scansOf}
        onClose={(changed) => {
          setScansOf(null);
          if (changed) void reload();
        }}
      />
    </Box>
  );
}

function DaysList() {
  const navigate = useNavigate();
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    listDays()
      .then(setDays)
      .catch(() => setError('Could not load the counts. This page is for managers.'));
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!days) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  return (
    <Box sx={{ overflowX: 'auto', mb: 3 }}>
      {days.length === 0 && <Typography sx={{ color: 'text.secondary' }}>No counts yet. The first scan of a day starts that day&apos;s count.</Typography>}
      {days.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Day</TableCell>
              <TableCell align="right">Counted</TableCell>
              <TableCell align="right">Expected</TableCell>
              <TableCell align="right">Found</TableCell>
              <TableCell align="right">Sections done</TableCell>
              <TableCell align="right">Runs</TableCell>
              <TableCell align="right">Need an answer</TableCell>
              <TableCell align="right">In carts</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {days.map((d) => (
              <TableRow
                key={d.id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => navigate(d.trial ? `/inventory/count/${d.id}/report` : `/inventory/count/days/${d.id}`)}
              >
                <TableCell sx={{ fontWeight: 700 }}>
                  {dayName(d)}
                  {d.trial && ' (trial)'}
                </TableCell>
                <TableCell align="right">{d.counted.toLocaleString()}</TableCell>
                <TableCell align="right">{d.expected.toLocaleString()}</TableCell>
                <TableCell align="right">{pct(d.counted, d.expected)}</TableCell>
                <TableCell align="right">{d.trial ? '' : `${d.sections_done} of ${d.sections_total}`}</TableCell>
                <TableCell align="right">{d.trial ? '' : d.runs}</TableCell>
                <TableCell align="right">{d.issues_pending || ''}</TableCell>
                <TableCell align="right">{d.to_fix || ''}</TableCell>
                <TableCell>{d.status === 'open' ? <Chip size="small" color="info" label="Open" /> : <Chip size="small" label="Closed" />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

/** Count sessions: every day's count, its sections and runs. Managers and up; wide screens first. */
export default function CountDaysPage() {
  const { id } = useParams();
  const { user } = useAuth();
  return (
    <Box sx={{ p: 2, width: '100%', minWidth: 0, maxWidth: 1300, mx: 'auto' }}>
      {id ? (
        <DayView id={Number(id)} />
      ) : (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Count sessions
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button component={RouterLink} to="/inventory/count" variant="contained" sx={{ textTransform: 'none' }}>
                Scan
              </Button>
              <Button component={RouterLink} to="/inventory/pr-fixit" variant="outlined" sx={{ textTransform: 'none' }}>
                PR Fix-it
              </Button>
            </Stack>
          </Stack>
          <DaysList />
          {user?.is_superuser && <SectionsPanel />}
        </>
      )}
    </Box>
  );
}
