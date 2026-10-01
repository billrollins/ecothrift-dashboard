import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
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
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import {
  addSection,
  answerIssue,
  apiMessage,
  getToday,
  newCart,
  postScans,
  removeScan,
  reportIssue,
  restoreScan,
  searchItems,
  startRun,
  stopRun,
  updateRun,
  type Carts,
  type CartKind,
  type DaySummary,
  type Issue,
  type IssueAction,
  type IssueKind,
  type ItemBrief,
  type RunSummary,
  type Section,
} from '../../../api/stocktake.api';
import { useAuth } from '../../../contexts/AuthContext';
import { CountQueue, agoText, codeFromScan, looksLikeCode, soundFor, type QueuedScan } from './countQueue';
import { ACTION_WORDS, PROBLEM_RULES } from './countProblems';
import { playCountSound, unlockSound } from './countSound';
import { clockOffset, clockTime, elapsedSeconds, formatElapsed, ratePerMinute } from './countTimer';
import ProblemSheet, { type SheetAnswer } from './ProblemSheet';

const storeKey = (runId: number) => `stocktake.run.${runId}`;

function load(runId: number): QueuedScan[] | undefined {
  try {
    const raw = window.localStorage.getItem(storeKey(runId));
    return raw ? (JSON.parse(raw) as QueuedScan[]) : undefined;
  } catch {
    return undefined;
  }
}

function save(runId: number, queue: CountQueue): void {
  try {
    window.localStorage.setItem(storeKey(runId), JSON.stringify(queue.snapshot()));
  } catch {
    // Storage full or blocked: the scans are still in memory and on the server.
  }
}

const GREEN = '#2e7d32';
const RED = '#c62828';
const ORANGE = '#ed6c02';
const GREY = '#757575';

function colorOf(s: QueuedScan): string {
  if (s.removed) return GREY;
  if (s.state === 'ok') return GREEN;
  if (s.state === 'unknown' || s.state === 'bad_format') return RED;
  if (s.state === 'odd' || s.state === 'already') return ORANGE;
  return GREY;
}

function StateIcon({ scan }: { scan: QueuedScan }) {
  const sx = { color: colorOf(scan), fontSize: 22 };
  if (scan.removed) return <RemoveCircleOutlineIcon sx={sx} />;
  if (scan.state === 'ok') return <CheckCircleIcon sx={sx} />;
  if (scan.state === 'unknown' || scan.state === 'bad_format') return <ErrorIcon sx={sx} />;
  if (scan.state === 'odd' || scan.state === 'already') return <WarningAmberIcon sx={sx} />;
  return <HourglassEmptyIcon sx={sx} />;
}

function describe(s: QueuedScan): string {
  if (s.removed) return `Removed${s.title ? `: ${s.title}` : ''}`;
  switch (s.state) {
    case 'ok':
      return s.title || 'On the shelf';
    case 'unknown':
      return 'Tag not recognized';
    case 'bad_format':
      return 'Not one of our tags';
    case 'already':
      return `Already scanned${s.title ? `: ${s.title}` : ''}`;
    case 'odd':
      return `System says ${s.itemStatus || 'not on shelf'}${s.title ? `: ${s.title}` : ''}`;
    default:
      return 'Looking up…';
  }
}

/** A problem that still needs an answer: from a scan in this run, or left over from an earlier run today. */
interface Pending {
  issueId: number;
  kind: IssueKind;
  code: string;
  title: string;
  price: string | null;
  context: string;
  /** "just now", "3 scans ago". Empty for a problem from an earlier run. */
  ago?: string;
  clientId?: string;
}

function contextFor(kind: IssueKind, s: { itemStatus?: string; firstSeen?: QueuedScan['firstSeen'] }): string {
  if (kind === 'already_scanned' && s.firstSeen) {
    return `Scanned before in ${s.firstSeen.section} by ${s.firstSeen.by || 'someone'} at ${clockTime(s.firstSeen.at)}.`;
  }
  if (kind === 'not_on_shelf' && s.itemStatus) return `The system has this item as "${s.itemStatus}", not on the shelf.`;
  return PROBLEM_RULES[kind].help;
}

function fromIssue(i: Issue): Pending {
  return {
    issueId: i.id,
    kind: i.kind,
    code: i.code,
    title: i.item?.title ?? '',
    price: i.item?.price ?? null,
    context: `${PROBLEM_RULES[i.kind].help} (From ${i.section}.)`,
  };
}

type Sheet = { mode: 'scan'; clientId: string } | { mode: 'notag' } | null;

/** Shelf inventory count. Phone first: pick a section, scan fast, answer problems in a tap. */
export default function CountPage() {
  const { hasRole, user } = useAuth();
  const isManager = hasRole('Manager') || hasRole('Admin') || !!user?.is_superuser;
  const isSuper = !!user?.is_superuser;

  const [booting, setBooting] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [older, setOlder] = useState<Pending[]>([]);
  const [carts, setCarts] = useState<Carts>({ pr: null, relocate: null });
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const [typed, setTyped] = useState('');
  const [keysOn, setKeysOn] = useState(false);
  const [matches, setMatches] = useState<ItemBrief[] | null>(null);
  const [muted, setMuted] = useState(false);
  const [offline, setOffline] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [newSection, setNewSection] = useState('');

  const inputRef = useRef<HTMLInputElement | null>(null);
  const queueRef = useRef<CountQueue>(new CountQueue());
  const inFlight = useRef(false);
  const lastCode = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const offsetRef = useRef(0);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const runRef = useRef<RunSummary | null>(null);
  runRef.current = run;
  const queue = queueRef.current;

  const say = useCallback((text: string) => {
    setFlash(text);
    window.setTimeout(() => setFlash((cur) => (cur === text ? '' : cur)), 4000);
  }, []);

  const refresh = useCallback(async () => {
    const t = await getToday();
    offsetRef.current = clockOffset(t.server_now, Date.now());
    setSections(t.sections);
    setDay(t.day);
    setCarts(t.carts);
    if (t.run && runRef.current?.id !== t.run.id) queueRef.current = new CountQueue(load(t.run.id));
    const mine = new Set(queueRef.current.scans.map((s) => s.issueId));
    setOlder(t.pending.filter((p) => !t.run || !mine.has(p.id)).map(fromIssue));
    setRun(t.run);
    setNote(t.run?.note ?? '');
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => setError('Could not load the count. Check the connection and reload.'))
      .finally(() => setBooting(false));
  }, [refresh]);

  // The timer redraws once a second while a run is open.
  useEffect(() => {
    if (!run) return undefined;
    const id = window.setInterval(rerender, 1000);
    return () => window.clearInterval(id);
  }, [run?.id, rerender]); // eslint-disable-line react-hooks/exhaustive-deps

  // The sender: every 300 ms, send whatever is waiting. A failed send goes back in the queue.
  useEffect(() => {
    if (!run) return undefined;
    const tick = async () => {
      const r = runRef.current;
      const q = queueRef.current;
      if (!r || inFlight.current || q.waiting === 0) return;
      const batch = q.takeBatch(100);
      if (batch.length === 0) return;
      inFlight.current = true;
      try {
        const res = await postScans(r.id, batch);
        const answered = q.apply(res.results);
        setOffline(false);
        setRun(res.run);
        setDay(res.day);
        const kind = soundFor(answered);
        if (kind) playCountSound(kind, mutedRef.current);
      } catch (e) {
        q.requeue(batch.map((b) => b.client_id));
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 409 || status === 403 || status === 404) {
          // The run was stopped somewhere else (another phone, or a manager).
          setError(apiMessage(e, 'This run was stopped. Pick a section to start again.'));
          setRun(null);
          void refresh().catch(() => undefined);
        } else {
          setOffline(true);
        }
      } finally {
        inFlight.current = false;
        save(r.id, q);
        rerender();
      }
    };
    const id = window.setInterval(() => void tick(), 300);
    return () => window.clearInterval(id);
  }, [run?.id, rerender, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScan = useCallback(
    (raw: string) => {
      const r = runRef.current;
      if (!r) return;
      const code = codeFromScan(raw);
      if (!code) return;
      const now = Date.now();
      // A scanner can double-read one tag in a blink. A deliberate second scan (a second later or more)
      // goes through and the server answers "already scanned".
      if (lastCode.current.code === code && now - lastCode.current.at < 400) {
        lastCode.current.at = now;
        return;
      }
      lastCode.current = { code, at: now };
      queueRef.current.add(code);
      if ('vibrate' in navigator) navigator.vibrate?.(8);
      save(r.id, queueRef.current);
      rerender();
    },
    [rerender],
  );

  // A Bluetooth or USB scanner types the code and presses Enter, like a keyboard. Keep the scan box
  // focused while a run is open, and catch keystrokes that land anywhere else on the page.
  const active = !!run && !sheet && !stopOpen && !noteOpen && !menuAt;
  useEffect(() => {
    if (!active) return undefined;
    const focusBox = () => inputRef.current?.focus({ preventScroll: true });
    focusBox();
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el === inputRef.current || e.ctrlKey || e.metaKey || e.altKey) return;
      if (el instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if (e.key.length === 1) focusBox(); // the character is typed into the box by the browser
    };
    window.addEventListener('keydown', onKey, true);
    const keepFocus = window.setInterval(() => {
      if (document.activeElement !== inputRef.current && !document.querySelector('[role="dialog"], [role="menu"]')) focusBox();
    }, 1500);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.clearInterval(keepFocus);
    };
  }, [active]);

  // Typed words (not a scan) look items up. A scanner finishes with Enter long before this fires.
  useEffect(() => {
    const q = typed.trim();
    if (q.length < 3) {
      setMatches(null);
      return undefined;
    }
    const id = window.setTimeout(() => {
      searchItems(q)
        .then(setMatches)
        .catch(() => setMatches([]));
    }, 300);
    return () => window.clearTimeout(id);
  }, [typed]);

  // Search words left in the box are cleared after a pause, so they can't swallow the next scan.
  useEffect(() => {
    if (!typed) return undefined;
    const id = window.setTimeout(() => {
      setTyped('');
      setMatches(null);
    }, 20000);
    return () => window.clearTimeout(id);
  }, [typed]);

  const doneTyping = () => {
    setTyped('');
    setMatches(null);
    setKeysOn(false);
  };

  const submitTyped = () => {
    const value = typed.trim();
    if (!value) return;
    unlockSound(); // a keypress counts as a touch: phones allow sound from now on
    // A scan that lands behind half-typed search words still counts: the tag's code is picked out.
    const tag = value.match(/ITM\d{6,}/i);
    if (tag || looksLikeCode(value)) {
      onScan(tag ? tag[0] : value);
      doneTyping();
    } else if (matches?.length === 1) {
      onScan(matches[0].sku);
      doneTyping();
    }
    // Otherwise it is a search: the matches are listed under the box.
  };

  const begin = async (section: Section) => {
    unlockSound();
    setBusy(true);
    setError('');
    try {
      const res = await startRun(section.id);
      queueRef.current = new CountQueue(load(res.run.id));
      lastCode.current = { code: '', at: 0 };
      setRun(res.run);
      setDay(res.day);
      setNote('');
    } catch (e) {
      setError(apiMessage(e, 'Could not start. Check the connection and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const pendingNow: Pending[] = [
    ...queue.problems().map(({ scan }) => ({
      issueId: scan.issueId as number,
      kind: scan.issueKind as IssueKind,
      code: scan.code,
      title: scan.title,
      price: scan.price,
      context: contextFor(scan.issueKind as IssueKind, scan),
      ago: agoText(queue.ago(scan)),
      clientId: scan.clientId,
    })),
    ...older,
  ];

  const answer = async (p: Pending, action: IssueAction) => {
    setBusy(true);
    try {
      const issue = await answerIssue(p.issueId, { action });
      queueRef.current.answer(p.issueId, action);
      setOlder((list) => list.filter((x) => x.issueId !== p.issueId));
      if (run) save(run.id, queueRef.current);
      setRun((r) => (r ? { ...r, issues_pending: Math.max(0, r.issues_pending - 1) } : r));
      say(issue.cart ? `Put it in ${issue.cart}.` : ACTION_WORDS[action]);
    } catch (e) {
      setError(apiMessage(e, 'Could not save the answer. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const sheetScan = sheet?.mode === 'scan' ? queue.find(sheet.clientId) : undefined;

  const onSheetAnswer = async (a: SheetAnswer) => {
    if (!run) return;
    setBusy(true);
    try {
      let issue: Issue;
      if (sheetScan?.issueId) {
        issue = await answerIssue(sheetScan.issueId, { action: a.action, detail: a.detail || undefined, target_section_id: a.targetSectionId });
        queueRef.current.answer(issue.id, a.action);
      } else {
        issue = await reportIssue({
          run_id: run.id,
          kind: a.kind,
          action: a.action,
          scan_id: sheetScan?.serverId ?? null,
          detail: a.detail,
          target_section_id: a.targetSectionId,
        });
        if (sheetScan) queueRef.current.setIssue(sheetScan.clientId, issue.id, a.kind, a.action);
      }
      save(run.id, queueRef.current);
      say(issue.cart ? `Put it in ${issue.cart}.` : `Noted: ${PROBLEM_RULES[a.kind].title.toLowerCase()}.`);
      setSheet(null);
    } catch (e) {
      setError(apiMessage(e, 'Could not save. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  /** Undo: take a scan out of the count, or put it back. Nothing is deleted on the server. */
  const toggleRemoved = async (scan: QueuedScan) => {
    if (!run) return;
    if (scan.serverId == null) {
      queueRef.current.drop(scan.clientId); // never sent: just forget it
      save(run.id, queueRef.current);
      setSheet(null);
      rerender();
      return;
    }
    setBusy(true);
    try {
      const res = scan.removed ? await restoreScan(scan.serverId) : await removeScan(scan.serverId);
      queueRef.current.setRemoved(scan.clientId, res.removed);
      save(run.id, queueRef.current);
      say(res.removed ? `Removed ${scan.code}.` : `Put ${scan.code} back.`);
      setSheet(null);
    } catch (e) {
      setError(apiMessage(e, 'Could not change that scan. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const stop = async (outcome: 'complete' | 'partial' | 'bad') => {
    if (!run) return;
    setBusy(true);
    // Everything must be answered by the server before the run is stopped.
    const started = Date.now();
    while (queueRef.current.waiting > 0 && Date.now() - started < 20000) {
      await new Promise((r) => setTimeout(r, 300));
    }
    if (queueRef.current.waiting > 0) {
      setBusy(false);
      setStopOpen(false);
      setError(`${queueRef.current.waiting} scans are still waiting to send. Get a connection, then stop.`);
      return;
    }
    try {
      await stopRun(run.id, outcome, note);
      window.localStorage.removeItem(storeKey(run.id));
      queueRef.current = new CountQueue();
      setRun(null);
      setStopOpen(false);
      say(outcome === 'complete' ? `${run.section.name} is complete.` : outcome === 'bad' ? 'Run marked bad. It will not be counted.' : 'Run stopped.');
      await refresh();
    } catch (e) {
      setError(apiMessage(e, 'Could not stop the run. Try again.'));
      setStopOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!run) return;
    setBusy(true);
    try {
      setRun(await updateRun(run.id, { note }));
      setNoteOpen(false);
      say('Note saved.');
    } catch (e) {
      setError(apiMessage(e, 'Could not save the note.'));
    } finally {
      setBusy(false);
    }
  };

  const nextCart = async (kind: CartKind) => {
    setMenuAt(null);
    try {
      const cart = await newCart(kind);
      setCarts((c) => ({ ...c, [kind]: cart }));
      say(`New cart: ${cart.label}.`);
    } catch (e) {
      setError(apiMessage(e, 'Could not start a new cart.'));
    }
  };

  const createSection = async () => {
    const name = newSection.trim();
    if (!name) return;
    try {
      await addSection(name);
      setNewSection('');
      await refresh();
    } catch (e) {
      setError(apiMessage(e, 'Could not add the section.'));
    }
  };

  // The newest problem gets the full card. Older ones wait in a compact row each, still one tap to answer.
  const pendingCards = pendingNow.map((p, index) => {
    const rule = PROBLEM_RULES[p.kind];
    const red = p.kind === 'not_sku' || p.kind === 'not_recognized';
    const full = index === 0;
    return (
      <Box key={p.issueId} role="alert" sx={{ mb: 1, p: full ? 1.5 : 1, borderRadius: 2, color: '#fff', bgcolor: red ? RED : ORANGE }}>
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography noWrap sx={{ fontWeight: 900, fontSize: full ? 18 : 15, lineHeight: 1.2, flex: 1, minWidth: 0 }}>
            {rule.title}
            {!full && <span style={{ fontFamily: 'monospace', fontWeight: 700 }}> {p.code}</span>}
          </Typography>
          {p.ago && <Typography sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{p.ago}</Typography>}
        </Stack>
        {full && (
          <>
            <Typography sx={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.2 }}>{p.code}</Typography>
            <Typography sx={{ fontSize: 14 }}>
              {p.title ? `${p.title}. ` : ''}
              {p.context}
            </Typography>
          </>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: full ? 1 : 0.5 }}>
          {rule.answers.map((a) => (
            <Button
              key={a.action}
              variant="contained"
              disabled={busy}
              onClick={() => void answer(p, a.action)}
              sx={{ flex: 1, py: full ? 1.25 : 0.6, fontSize: full ? 14 : 13, fontWeight: 800, textTransform: 'none', lineHeight: 1.15, bgcolor: '#fff', color: '#111', '&:hover': { bgcolor: '#eee' } }}
            >
              {a.label}
            </Button>
          ))}
        </Stack>
      </Box>
    );
  });

  if (booting) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  // ---- No open run: pick a section -------------------------------------------------------------
  if (!run) {
    return (
      <Box sx={{ p: 2, width: '100%', minWidth: 0, maxWidth: 560, mx: 'auto' }} onClick={unlockSound}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Inventory count
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 1.5 }}>
          {day
            ? `Today: ${day.counted.toLocaleString()} of ${day.expected.toLocaleString()} counted · ${day.sections_done} of ${day.sections_total} sections done`
            : 'No one has scanned today yet. Every run today adds up to one count.'}
        </Typography>
        {flash && (
          <Alert severity="success" sx={{ mb: 1.5 }}>
            {flash}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        {day?.status === 'closed' && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            Today&apos;s count is closed. A manager can reopen it from Sessions.
          </Alert>
        )}
        {pendingCards.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Still needs an answer ({pendingCards.length})</Typography>
            {pendingCards}
          </Box>
        )}

        <Typography sx={{ fontWeight: 800, mb: 1 }}>Which section are you about to scan?</Typography>
        {sections.length === 0 && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            There are no sections yet. {isSuper ? 'Add the first one below.' : 'The Super User adds them.'}
          </Alert>
        )}
        <Stack spacing={1}>
          {sections.map((s) => (
            <Button
              key={s.id}
              variant={s.complete ? 'outlined' : 'contained'}
              size="large"
              fullWidth
              disabled={busy || day?.status === 'closed'}
              onClick={() => void begin(s)}
              sx={{ py: 1.75, fontWeight: 800, fontSize: 17, textTransform: 'none', justifyContent: 'space-between' }}
            >
              {s.name}
              {s.complete && <Chip size="small" color="success" label="Done today" />}
            </Button>
          ))}
        </Stack>

        {isSuper && (
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <TextField
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createSection()}
              placeholder="New section name"
              size="small"
              fullWidth
              inputProps={{ maxLength: 60, 'aria-label': 'New section name' }}
            />
            <Button variant="outlined" onClick={() => void createSection()} sx={{ whiteSpace: 'nowrap', textTransform: 'none' }}>
              Add section
            </Button>
          </Stack>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 3 }} flexWrap="wrap" useFlexGap>
          {isManager && (
            <Button component={RouterLink} to="/inventory/count/days" sx={{ textTransform: 'none' }}>
              Sessions and reports
            </Button>
          )}
          <Button component={RouterLink} to="/inventory/pr-fixit" sx={{ textTransform: 'none' }}>
            PR Fix-it
          </Button>
        </Stack>
      </Box>
    );
  }

  // ---- A run is open: scan ---------------------------------------------------------------------
  const elapsed = elapsedSeconds(run.started_at, Date.now(), offsetRef.current);
  const rate = ratePerMinute(queue.kept, elapsed);
  const recent = queue.recent(30);
  const last = recent[0];
  const lastIsPending = !!last && last.issueAction === 'pending' && !last.removed;

  return (
    <Box sx={{ width: '100%', minWidth: 0, maxWidth: 560, mx: 'auto', pb: 11, overflowX: 'hidden' }} onClick={unlockSound}>
      <Box sx={{ px: 1.5, py: 1, position: 'sticky', top: 0, zIndex: 5, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 900, fontSize: 17, lineHeight: 1.2 }}>
              {run.section.name}
            </Typography>
            <Typography data-testid="count-timer" sx={{ fontSize: 14, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              <b style={{ color: 'inherit' }}>{queue.kept}</b> {queue.kept === 1 ? 'scan' : 'scans'} · {formatElapsed(elapsed)}
              {rate ? ` · ${rate}/min` : ''}
            </Typography>
          </Box>
          {queue.waiting > 0 && <Chip size="small" label={`${queue.waiting} sending`} />}
          {offline && <Chip size="small" color="warning" label="Offline: saved" />}
          <IconButton aria-label="More" onClick={(e) => setMenuAt(e.currentTarget)}>
            <MoreVertIcon />
          </IconButton>
        </Stack>
        <TextField
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              submitTyped();
            }
          }}
          onPointerDown={() => setKeysOn(true)}
          onBlur={() => setKeysOn(false)}
          placeholder="Scan. Or tap here to type a code or search."
          size="small"
          fullWidth
          autoFocus
          inputRef={inputRef}
          sx={{ mt: 0.75 }}
          InputProps={{
            endAdornment: typed ? (
              <Button size="small" onClick={doneTyping} sx={{ minWidth: 0, textTransform: 'none' }}>
                Clear
              </Button>
            ) : undefined,
          }}
          inputProps={{
            // inputMode none: a phone does not pop up its keyboard for a hardware scanner. A tap on the box turns it on.
            inputMode: keysOn ? 'search' : 'none',
            autoCapitalize: 'off',
            autoComplete: 'off',
            autoCorrect: 'off',
            spellCheck: false,
            'aria-label': 'Scan, or type a code or search',
          }}
        />
        {matches && (
          <Box sx={{ mt: 0.5, maxHeight: 260, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
            {matches.length === 0 && <Typography sx={{ p: 1, color: 'text.secondary' }}>No item matches &quot;{typed.trim()}&quot;.</Typography>}
            {matches.map((m) => (
              <Stack
                key={m.id}
                direction="row"
                alignItems="center"
                spacing={1}
                onClick={() => {
                  onScan(m.sku);
                  doneTyping();
                }}
                sx={{ px: 1, py: 0.75, cursor: 'pointer', borderBottom: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 14, fontWeight: 700 }}>
                    {m.title}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: 'monospace' }}>
                    {m.sku} · ${Number(m.price).toFixed(2)}
                    {m.status !== 'on_shelf' ? ` · ${m.status}` : ''}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: 'primary.main', whiteSpace: 'nowrap' }}>Count it</Typography>
              </Stack>
            ))}
          </Box>
        )}
      </Box>

      {flash && (
        <Alert severity="success" sx={{ mx: 1.5, mt: 1 }}>
          {flash}
        </Alert>
      )}
      {error && (
        <Alert severity="warning" sx={{ mx: 1.5, mt: 1 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {pendingCards.length > 0 && <Box sx={{ px: 1.5, pt: 1 }}>{pendingCards}</Box>}

      {last && !lastIsPending && (
        <Box sx={{ mx: 1.5, mt: 1, p: 1.5, borderRadius: 2, border: 2, borderColor: colorOf(last) }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <StateIcon scan={last} />
            <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 20, flex: 1 }}>{last.code}</Typography>
            {last.price && <Typography sx={{ fontWeight: 900, fontSize: 20 }}>${Number(last.price).toFixed(2)}</Typography>}
          </Stack>
          <Typography sx={{ fontSize: 15, mt: 0.25 }}>{describe(last)}</Typography>
          {last.issueId != null && last.issueKind && (
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              {PROBLEM_RULES[last.issueKind].title}: {ACTION_WORDS[last.issueAction || 'pending']}
            </Typography>
          )}
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              variant="outlined"
              color="warning"
              disabled={last.serverId == null || last.removed}
              onClick={() => setSheet({ mode: 'scan', clientId: last.clientId })}
              sx={{ flex: 1, fontWeight: 800, textTransform: 'none' }}
            >
              Problem?
            </Button>
            <Button variant="outlined" color="inherit" disabled={busy} onClick={() => void toggleRemoved(last)} sx={{ flex: 1, fontWeight: 800, textTransform: 'none' }}>
              {last.removed ? 'Put back' : 'Undo'}
            </Button>
          </Stack>
        </Box>
      )}

      <Box sx={{ px: 1.5, pt: 1.5 }}>
        {recent.length === 0 && <Typography sx={{ color: 'text.secondary' }}>Scan the first item in {run.section.name}.</Typography>}
        {recent.slice(lastIsPending ? 0 : 1).map((s) => (
          <Stack
            key={s.clientId}
            direction="row"
            alignItems="center"
            spacing={1}
            onClick={() => setSheet({ mode: 'scan', clientId: s.clientId })}
            sx={{ py: 0.6, borderBottom: 1, borderColor: 'divider', cursor: 'pointer', opacity: s.removed ? 0.55 : 1 }}
          >
            <StateIcon scan={s} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: 13 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, textDecoration: s.removed ? 'line-through' : 'none' }}>{s.code}</span> {describe(s)}
              </Typography>
              {s.issueId != null && s.issueKind && s.issueAction !== 'cleared' && (
                <Typography noWrap sx={{ fontSize: 12, color: s.issueAction === 'pending' ? ORANGE : 'text.secondary' }}>
                  {PROBLEM_RULES[s.issueKind].title}: {ACTION_WORDS[s.issueAction || 'pending']}
                </Typography>
              )}
            </Box>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>{agoText(queue.ago(s))}</Typography>
          </Stack>
        ))}
      </Box>

      <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, p: 1.5, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', zIndex: 6 }}>
        <Stack direction="row" spacing={1} sx={{ maxWidth: 560, mx: 'auto' }}>
          <Button variant="outlined" color="warning" fullWidth onClick={() => setSheet({ mode: 'notag' })} sx={{ py: 1.25, fontWeight: 800, textTransform: 'none' }}>
            No tag
          </Button>
          <Button variant="contained" fullWidth onClick={() => setStopOpen(true)} sx={{ py: 1.25, fontWeight: 800, textTransform: 'none' }}>
            Stop
          </Button>
        </Stack>
      </Box>

      <Menu anchorEl={menuAt} open={!!menuAt} onClose={() => setMenuAt(null)}>
        <MenuItem
          onClick={() => {
            setMenuAt(null);
            setNoteOpen(true);
          }}
        >
          {run.note ? 'Edit the note' : 'Add a note'}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMuted((m) => !m);
            setMenuAt(null);
          }}
        >
          {muted ? 'Turn sound on' : 'Turn sound off'}
        </MenuItem>
        <MenuItem onClick={() => void nextCart('pr')}>My PR cart is full{carts.pr ? ` (now ${carts.pr.label})` : ''}</MenuItem>
        <MenuItem onClick={() => void nextCart('relocate')}>My relocate cart is full{carts.relocate ? ` (now ${carts.relocate.label})` : ''}</MenuItem>
        <MenuItem component={RouterLink} to="/inventory/pr-fixit">
          PR Fix-it
        </MenuItem>
        {isManager && (
          <MenuItem component={RouterLink} to="/inventory/count/days">
            Sessions and reports
          </MenuItem>
        )}
      </Menu>

      <ProblemSheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        code={sheet?.mode === 'scan' ? sheetScan?.code ?? '' : ''}
        title={sheetScan?.title ?? ''}
        price={sheetScan?.price ?? null}
        kind={sheet?.mode === 'notag' ? 'no_tag' : sheetScan?.issueKind || null}
        context={sheetScan?.issueKind ? contextFor(sheetScan.issueKind, sheetScan) : undefined}
        sections={sections}
        currentSectionId={run.section.id}
        busy={busy}
        onAnswer={(a) => void onSheetAnswer(a)}
        onRemove={sheetScan ? () => void toggleRemoved(sheetScan) : undefined}
        removed={sheetScan?.removed}
      />

      <Dialog open={stopOpen} onClose={() => !busy && setStopOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Stop scanning {run.section.name}?</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5, color: 'text.secondary' }}>
            {queue.kept} scans in {formatElapsed(elapsed)}. To scan another section, stop here and pick it next.
          </Typography>
          <TextField
            value={note}
            onChange={(e) => setNote(e.target.value)}
            label="Note (optional)"
            placeholder="How you scanned, what got in the way"
            fullWidth
            multiline
            minRows={2}
            sx={{ mb: 1.5 }}
          />
          <Stack spacing={1}>
            <Button variant="contained" color="success" disabled={busy || pendingNow.length > 0} onClick={() => void stop('complete')} sx={{ py: 1.5, fontWeight: 800, textTransform: 'none' }}>
              The section is complete
            </Button>
            {pendingNow.length > 0 && (
              <Typography sx={{ fontSize: 13, color: ORANGE }}>
                {pendingNow.length} {pendingNow.length === 1 ? 'problem needs' : 'problems need'} an answer before the section can be complete.
              </Typography>
            )}
            <Button variant="outlined" disabled={busy} onClick={() => void stop('partial')} sx={{ py: 1.5, fontWeight: 800, textTransform: 'none' }}>
              Not finished, more to scan later
            </Button>
            <Button variant="outlined" color="error" disabled={busy} onClick={() => void stop('bad')} sx={{ py: 1.5, fontWeight: 800, textTransform: 'none' }}>
              Bad run, do not count it
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStopOpen(false)} disabled={busy} sx={{ textTransform: 'none' }}>
            {busy ? 'Stopping…' : 'Keep scanning'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={noteOpen} onClose={() => !busy && setNoteOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Note for this run</DialogTitle>
        <DialogContent>
          <TextField value={note} onChange={(e) => setNote(e.target.value)} placeholder="How you scanned, what got in the way" fullWidth multiline minRows={3} autoFocus sx={{ mt: 0.5 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNoteOpen(false)} disabled={busy} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void saveNote()} disabled={busy} sx={{ textTransform: 'none' }}>
            Save note
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
