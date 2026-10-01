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
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { closeCount, listCounts, postScans, startCount, type CountSummary } from '../../../api/stocktake.api';
import { useAuth } from '../../../contexts/AuthContext';
import { CountQueue, agoText, codeFromScan, soundFor, type QueuedScan } from './countQueue';
import { playCountSound, unlockSound } from './countSound';

const storeKey = (id: number) => `stocktake.count.${id}`;

function load(id: number): QueuedScan[] | undefined {
  try {
    const raw = window.localStorage.getItem(storeKey(id));
    return raw ? (JSON.parse(raw) as QueuedScan[]) : undefined;
  } catch {
    return undefined;
  }
}

function save(id: number, queue: CountQueue): void {
  try {
    window.localStorage.setItem(storeKey(id), JSON.stringify(queue.snapshot()));
  } catch {
    // Storage full or blocked: the scans are still in memory and on the server.
  }
}

const COLORS = {
  ok: '#2e7d32',
  unknown: '#c62828',
  odd: '#ed6c02',
  already: '#ed6c02',
  queued: '#757575',
  sent: '#757575',
} as const;

function StateIcon({ state }: { state: QueuedScan['state'] }) {
  const sx = { color: COLORS[state], fontSize: 22 };
  if (state === 'ok') return <CheckCircleIcon sx={sx} />;
  if (state === 'unknown') return <ErrorIcon sx={sx} />;
  if (state === 'odd' || state === 'already') return <WarningAmberIcon sx={sx} />;
  return <HourglassEmptyIcon sx={sx} />;
}

function describe(s: QueuedScan): string {
  switch (s.state) {
    case 'ok':
      return s.title || 'On the shelf';
    case 'unknown':
      return 'Not found';
    case 'already':
      return 'Already scanned';
    case 'odd':
      return `System says ${s.itemStatus || 'not on shelf'}${s.title ? `: ${s.title}` : ''}`;
    default:
      return 'Looking up…';
  }
}

/** Shelf inventory count. Phone first: scan fast, the lookup happens behind the scenes. */
export default function CountPage() {
  const { hasRole } = useAuth();
  const [count, setCount] = useState<CountSummary | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState('');
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const [scannerReady, setScannerReady] = useState(false);
  const [keyboardOn, setKeyboardOn] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [offline, setOffline] = useState(false);
  const [alertScan, setAlertScan] = useState<QueuedScan | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [typed, setTyped] = useState('');

  const queueRef = useRef<CountQueue>(new CountQueue());
  const inFlight = useRef(false);
  const lastCode = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const countRef = useRef<CountSummary | null>(null);
  countRef.current = count;
  const queue = queueRef.current;

  const attach = useCallback((c: CountSummary) => {
    queueRef.current = new CountQueue(load(c.id));
    setCount(c);
    setAlertScan(null);
    setOffline(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listCounts()
      .then((all) => {
        if (cancelled) return;
        const open = all.find((c) => c.status === 'open');
        if (open) attach(open);
      })
      .catch(() => {
        if (!cancelled) setBootError('Could not load counts. Check the connection and reload.');
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attach]);

  // The sender: every 300 ms, send whatever is waiting. A failed send goes back in the queue.
  useEffect(() => {
    if (!count) return undefined;
    const tick = async () => {
      const c = countRef.current;
      const q = queueRef.current;
      if (!c || inFlight.current || q.waiting === 0) return;
      const batch = q.takeBatch(100);
      if (batch.length === 0) return;
      inFlight.current = true;
      try {
        const { results, summary } = await postScans(c.id, batch);
        const answered = q.apply(results);
        setOffline(false);
        setCount((prev) => (prev ? { ...prev, ...summary } : prev));
        const kind = soundFor(answered);
        if (kind) playCountSound(kind, mutedRef.current);
        const worst = [...answered].reverse().find((s) => s.state === 'unknown' || s.state === 'odd' || s.state === 'already');
        if (worst) setAlertScan(worst);
      } catch {
        q.requeue(batch.map((b) => b.client_id));
        setOffline(true);
      } finally {
        inFlight.current = false;
        save(c.id, q);
        rerender();
      }
    };
    const id = window.setInterval(() => void tick(), 300);
    return () => window.clearInterval(id);
  }, [count?.id, rerender]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScan = useCallback(
    (raw: string) => {
      const c = countRef.current;
      if (!c) return;
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
      save(c.id, queueRef.current);
      rerender();
    },
    [rerender],
  );

  // A Bluetooth or USB scanner types the code and presses Enter, like a keyboard. Keep the scan box focused
  // whenever the count is open, and catch keystrokes that land anywhere else on the page.
  const active = !!count && count.status === 'open' && !confirmClose;
  useEffect(() => {
    if (!active) return undefined;
    const focusBox = () => inputRef.current?.focus({ preventScroll: true });
    focusBox();
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el === inputRef.current || e.ctrlKey || e.metaKey || e.altKey) return;
      if (el instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if (e.key.length === 1) {
        focusBox(); // the character is typed into the box by the browser
      }
    };
    window.addEventListener('keydown', onKey, true);
    const keepFocus = window.setInterval(() => {
      if (document.activeElement !== inputRef.current && !document.querySelector('[role="dialog"]')) focusBox();
    }, 1500);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.clearInterval(keepFocus);
    };
  }, [active]);

  const submitTyped = () => {
    const value = typed.trim();
    if (!value) return;
    unlockSound(); // a keypress counts as a touch: phones allow sound from now on
    onScan(value);
    setTyped('');
  };

  const begin = async () => {
    unlockSound();
    try {
      const c = await startCount();
      attach(c);
    } catch {
      setBootError('Could not start the count.');
    }
  };

  const finish = async () => {
    if (!count) return;
    setClosing(true);
    // Everything must be answered by the server before the count is closed.
    const started = Date.now();
    while (queueRef.current.waiting > 0 && Date.now() - started < 20000) {
      await new Promise((r) => setTimeout(r, 300));
    }
    if (queueRef.current.waiting > 0) {
      setClosing(false);
      setConfirmClose(false);
      setBootError(`${queueRef.current.waiting} scans are still waiting to send. Get a connection, then finish.`);
      return;
    }
    try {
      const closed = await closeCount(count.id);
      window.localStorage.removeItem(storeKey(count.id));
      setCount(closed);
    } catch {
      setBootError('Could not close the count.');
    } finally {
      setClosing(false);
      setConfirmClose(false);
    }
  };

  if (booting) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const isManager = hasRole('Manager') || hasRole('Admin');

  if (!count || count.status === 'closed') {
    return (
      <Box sx={{ p: 2, width: '100%', maxWidth: 520, mx: 'auto' }}>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
          Inventory count
        </Typography>
        {count?.status === 'closed' && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Count closed: {count.counted.toLocaleString()} of {count.expected.toLocaleString()} counted.{' '}
            {isManager && (
              <Button component={RouterLink} to={`/inventory/count/${count.id}/report`} size="small">
                See the report
              </Button>
            )}
          </Alert>
        )}
        {bootError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {bootError}
          </Alert>
        )}
        <Typography sx={{ mb: 2, color: 'text.secondary' }}>
          Scan every item on the floor. The app remembers what the system says is on the shelf right now, and the
          report shows what was not found.
        </Typography>
        <Button variant="contained" size="large" fullWidth onClick={() => void begin()} sx={{ py: 2, fontWeight: 800 }}>
          Start a new count
        </Button>
      </Box>
    );
  }

  const live = queue.recent(14);
  const problems = queue.problems();
  const pct = count.expected ? Math.min(100, Math.round((count.counted / count.expected) * 100)) : 0;

  return (
    <Box sx={{ width: '100%', minWidth: 0, maxWidth: 560, mx: 'auto', pb: 10, overflowX: 'hidden' }} onClick={unlockSound}>
      <Box sx={{ p: 1.5, position: 'sticky', top: 0, zIndex: 5, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{count.name}</Typography>
            <Typography sx={{ fontSize: 30, fontWeight: 900, lineHeight: 1.05 }}>
              {count.counted.toLocaleString()}
              <Typography component="span" sx={{ fontSize: 16, fontWeight: 600, color: 'text.secondary' }}>
                {' '}
                of {count.expected.toLocaleString()} ({pct}%)
              </Typography>
            </Typography>
          </Box>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            {queue.waiting > 0 && <Chip size="small" label={`${queue.waiting} sending`} />}
            {offline && <Chip size="small" color="warning" label="Offline: saved, will send" />}
            <IconButton aria-label={muted ? 'Sound off' : 'Sound on'} onClick={() => setMuted((m) => !m)}>
              {muted ? <VolumeOffIcon /> : <VolumeUpIcon />}
            </IconButton>
          </Stack>
        </Stack>
      </Box>

      {alertScan && (
        <Box
          role="alert"
          onClick={() => setAlertScan(null)}
          sx={{
            m: 1.5,
            p: 1.5,
            borderRadius: 2,
            color: '#fff',
            bgcolor: alertScan.state === 'unknown' ? COLORS.unknown : COLORS.odd,
            cursor: 'pointer',
          }}
        >
          <Typography sx={{ fontWeight: 900, fontSize: 18 }}>
            {alertScan.state === 'unknown' && 'Back up: not found'}
            {alertScan.state === 'odd' && `Back up: system says ${alertScan.itemStatus}`}
            {alertScan.state === 'already' && 'Already scanned'}
          </Typography>
          <Typography sx={{ fontSize: 26, fontWeight: 900, fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {alertScan.code}
          </Typography>
          <Typography sx={{ fontSize: 15 }}>
            {agoText(queue.ago(alertScan))}
            {alertScan.title ? ` · ${alertScan.title}` : ''} · tap to dismiss
          </Typography>
        </Box>
      )}

      <Box sx={{ px: 1.5, pt: 1.5 }}>
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: 2,
            borderColor: scannerReady ? COLORS.ok : 'warning.main',
            bgcolor: scannerReady ? 'rgba(46,125,50,0.08)' : 'rgba(237,108,2,0.10)',
            textAlign: 'center',
          }}
        >
          <Typography sx={{ fontWeight: 900, fontSize: 18 }}>
            {scannerReady ? 'Scanner ready: scan an item' : 'Tap here, then scan'}
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            Pair a Bluetooth scanner (keyboard mode) or plug in a USB scanner. Each scan is saved at once.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <TextField
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                submitTyped();
              }
            }}
            placeholder="Scan here (or type a code, then Enter)"
            size="small"
            fullWidth
            autoFocus
            inputRef={inputRef}
            onFocus={() => setScannerReady(true)}
            onBlur={() => setScannerReady(false)}
            inputProps={{
              // inputMode none: a phone does not pop up its keyboard for a hardware scanner.
              inputMode: keyboardOn ? 'text' : 'none',
              autoCapitalize: 'characters',
              autoComplete: 'off',
              autoCorrect: 'off',
              spellCheck: false,
              'aria-label': 'Scan or type a code',
            }}
          />
          <Button variant="outlined" onClick={() => setKeyboardOn((v) => !v)} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            {keyboardOn ? 'Hide keys' : 'Type'}
          </Button>
        </Stack>
      </Box>

      <Box sx={{ px: 1.5, pt: 1.5 }}>
        <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Latest scans</Typography>
        {live.length === 0 && <Typography sx={{ color: 'text.secondary' }}>Scan the first item.</Typography>}
        {live.map((s) => (
          <Stack
            key={s.clientId}
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}
          >
            <StateIcon state={s.state} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>{s.code}</Typography>
              <Typography noWrap sx={{ fontSize: 13, color: s.state === 'unknown' ? COLORS.unknown : 'text.secondary' }}>
                {describe(s)}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {agoText(queue.ago(s))}
            </Typography>
          </Stack>
        ))}
      </Box>

      {problems.length > 0 && (
        <Box sx={{ px: 1.5, pt: 2 }}>
          <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Problems ({problems.length})</Typography>
          {problems.slice(0, 25).map(({ scan, ago }) => (
            <Stack key={scan.clientId} direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }}>
              <StateIcon state={scan.state} />
              <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>{scan.code}</Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', flex: 1 }} noWrap>
                {describe(scan)}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>{agoText(ago)}</Typography>
            </Stack>
          ))}
        </Box>
      )}

      {bootError && (
        <Alert severity="warning" sx={{ m: 1.5 }} onClose={() => setBootError('')}>
          {bootError}
        </Alert>
      )}

      <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, p: 1.5, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} sx={{ maxWidth: 560, mx: 'auto' }}>
          <Button variant="contained" color="primary" fullWidth onClick={() => setConfirmClose(true)} sx={{ py: 1.25, fontWeight: 800 }}>
            Finish count
          </Button>
        </Stack>
      </Box>

      <Dialog open={confirmClose} onClose={() => !closing && setConfirmClose(false)}>
        <DialogTitle>Finish this count?</DialogTitle>
        <DialogContent>
          <Typography>
            {count.counted.toLocaleString()} of {count.expected.toLocaleString()} counted. After you finish, nothing more can be
            scanned into this count.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClose(false)} disabled={closing}>
            Keep scanning
          </Button>
          <Button variant="contained" onClick={() => void finish()} disabled={closing}>
            {closing ? 'Finishing…' : 'Finish'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
