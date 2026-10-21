/**
 * Messages (owner 2026-10-21): staff messages in Dash, never email or text. The owner and managers start a thread to
 * one person or a whole department; everyone on it replies. Each of my messages says who read it and when. A message
 * to one person can carry a one-time secret (a PIN): they tap Show, see it once, and Dash deletes it.
 *
 * Desk: the list on the left, the open thread on the right. Phone (and Thrift+ Staff): the list, then the thread with
 * a back arrow. `basePath` is /messages in Dash and /staff/messages in Thrift+ Staff.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { format, isToday, parseISO } from 'date-fns';
import {
  getAudiences,
  getThread,
  getThreads,
  replyToThread,
  showSecret,
  startThread,
  type ThreadMessage,
} from '../../api/messages.api';
import { UNREAD_KEY } from '../../components/messages/MessagesEnvelope';
import { useAuth } from '../../contexts/AuthContext';
import { ccTokens } from '../../theme';

export const THREADS_KEY = ['messages', 'threads'] as const;

export function when(iso: string): string {
  const d = parseISO(iso);
  return isToday(d) ? format(d, 'h:mm a') : format(d, 'MMM d, h:mm a');
}

function errorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  const first = Object.values(data)[0];
  return Array.isArray(first) ? String(first[0]) : typeof first === 'string' ? first : fallback;
}

/** "Read by Carrie 2:14 PM, Dave 3:01 PM", or "Not read yet". */
export function readLine(message: ThreadMessage): string {
  if (!message.read_by.length) return 'Not read yet';
  return `Read by ${message.read_by.map((r) => `${r.name.split(' ')[0]} ${when(r.at)}`).join(', ')}`;
}

function SecretBox({ message, onShown }: { message: ThreadMessage; onShown: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  // Held here only: never in the query cache, storage or a log.
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const secret = message.secret!;
  const show = async () => {
    setBusy(true);
    try {
      const { data } = await showSecret(message.id);
      setValue(data.secret);
      onShown();
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not show it'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box data-testid={`secret-${message.id}`} sx={{ mt: 1, p: 1.25, borderRadius: 1.5, border: `1px dashed ${ccTokens.kraft}`, bgcolor: ccTokens.kraftTint }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <LockRounded fontSize="small" sx={{ color: ccTokens.kraftDeep }} />
        {value !== null ? (
          <Typography data-testid="secret-value" sx={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 800, letterSpacing: 4, flex: 1 }}>
            {value}
          </Typography>
        ) : secret.state === 'shown' ? (
          <Typography variant="body2" sx={{ flex: 1 }}>
            Shown once on {secret.shown_at ? format(parseISO(secret.shown_at), 'MMM d, h:mm a') : ''}; deleted.
          </Typography>
        ) : secret.can_show ? (
          <>
            <Typography variant="body2" sx={{ flex: 1 }}>One-time secret. You can see it once.</Typography>
            <Button size="small" variant="contained" onClick={show} disabled={busy}>Show</Button>
          </>
        ) : (
          <Typography variant="body2" sx={{ flex: 1 }}>One-time secret for {secret.for}, not shown yet.</Typography>
        )}
      </Stack>
      {value !== null ? (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
          This is the only time it shows. It is deleted now, so learn it before you leave this page.
        </Typography>
      ) : null}
    </Box>
  );
}

function ThreadPane({ id, onBack }: { id: number; onBack?: () => void }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const query = useQuery({ queryKey: ['messages', 'thread', id], queryFn: async () => (await getThread(id)).data });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: THREADS_KEY });
    queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
  };
  // Opening a thread marks it read on the server: the list and the envelope follow.
  const loadedAt = query.dataUpdatedAt;
  useEffect(() => {
    if (loadedAt) {
      queryClient.invalidateQueries({ queryKey: THREADS_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
    }
  }, [loadedAt, queryClient]);
  if (query.isLoading) return <CircularProgress sx={{ m: 3 }} />;
  if (query.isError || !query.data) return <Alert severity="error" sx={{ m: 2 }}>Could not open this message.</Alert>;
  const thread = query.data;

  const send = async () => {
    setSending(true);
    try {
      const { data } = await replyToThread(id, reply);
      queryClient.setQueryData(['messages', 'thread', id], data);
      setReply('');
      refresh();
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not send'), { variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Box data-testid="message-thread" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderBottom: `1px solid ${ccTokens.line}` }}>
        {onBack ? <IconButton aria-label="Back to messages" onClick={onBack}><ArrowBackRounded /></IconButton> : null}
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={800} noWrap>{thread.subject}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            To {thread.audience} · from {thread.started_by} · {thread.members.length} people
          </Typography>
        </Box>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.5 }}>
        {thread.messages.map((m) => (
          <Box key={m.id} sx={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start', mb: 1.25 }}>
            <Box sx={{ maxWidth: { xs: '88%', md: '75%' }, p: 1.25, borderRadius: 2, bgcolor: m.mine ? ccTokens.goodTint : ccTokens.card, border: `1px solid ${ccTokens.line}` }}>
              <Typography variant="caption" color="text.secondary">{m.mine ? 'You' : m.sender} · {when(m.created_at)}</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</Typography>
              {m.secret ? <SecretBox message={m} onShown={() => queryClient.invalidateQueries({ queryKey: ['messages', 'thread', id] })} /> : null}
              {m.mine ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }} data-testid={`read-${m.id}`}>
                  {readLine(m)}
                </Typography>
              ) : null}
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, p: 1.5, borderTop: `1px solid ${ccTokens.line}` }}>
        <TextField
          size="small"
          placeholder="Reply"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          multiline
          maxRows={4}
          fullWidth
        />
        <Button variant="contained" onClick={send} disabled={sending || !reply.trim()}>Send</Button>
      </Box>
    </Box>
  );
}

function ComposeDialog({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (id: number) => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const audiences = useQuery({ queryKey: ['messages', 'audiences'], queryFn: async () => (await getAudiences()).data, enabled: open });
  const [mode, setMode] = useState<'person' | 'department'>('person');
  const [to, setTo] = useState<number | ''>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const options = mode === 'person' ? audiences.data?.people ?? [] : audiences.data?.departments ?? [];
  const send = async () => {
    setBusy(true);
    try {
      const { data } = await startThread({
        subject, body, ...(mode === 'person' ? { to_user: Number(to), secret: secret || undefined } : { to_department: Number(to) }),
      });
      setSubject('');
      setBody('');
      setSecret('');
      setTo('');
      onSent(data.id);
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not send'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New message</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_e, v) => { if (v) { setMode(v); setTo(''); } }}>
            <ToggleButton value="person">One person</ToggleButton>
            <ToggleButton value="department">A department</ToggleButton>
          </ToggleButtonGroup>
          <FormControl size="small" fullWidth>
            <InputLabel>To</InputLabel>
            <Select label="To" value={to} onChange={(e) => setTo(String(e.target.value) === '' ? '' : Number(e.target.value))}>
              {options.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} fullWidth />
          <TextField label="Message" value={body} onChange={(e) => setBody(e.target.value)} multiline minRows={3} fullWidth />
          {mode === 'person' ? (
            <TextField
              size="small"
              label="One-time secret (optional)"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              helperText="Like a PIN or a code. They see it once with a Show tap, then Dash deletes it."
              autoComplete="off"
              fullWidth
            />
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={send} disabled={busy || to === '' || !subject.trim() || !body.trim()}>Send</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function MessagesPage({ basePath = '/messages', compact = false }: { basePath?: string; compact?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const wide = useMediaQuery(useTheme().breakpoints.up('md')) && !compact;
  const openId = params.id ? Number(params.id) : null;
  const [composing, setComposing] = useState(false);
  const threads = useQuery({ queryKey: THREADS_KEY, queryFn: async () => (await getThreads()).data, refetchInterval: 60_000 });
  const canStart = Boolean(user?.is_superuser || user?.role === 'Manager' || user?.role === 'Admin');
  const openThread = (id: number) => navigate(`${basePath}/${id}`);

  const list = (
    <Box data-testid="message-list" sx={{ height: '100%', overflowY: 'auto' }}>
      {threads.isLoading ? <CircularProgress sx={{ m: 3 }} /> : null}
      {threads.data && threads.data.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>No messages yet.</Typography>
      ) : null}
      {(threads.data ?? []).map((t) => (
        <Box
          key={t.id}
          component="button"
          type="button"
          onClick={() => openThread(t.id)}
          data-testid={`thread-${t.id}`}
          sx={{
            display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: `1px solid ${ccTokens.line}`,
            p: 1.5, font: 'inherit', cursor: 'pointer', bgcolor: t.id === openId ? ccTokens.bg : ccTokens.card,
            '&:hover': { bgcolor: ccTokens.bg },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography fontWeight={t.unread ? 800 : 600} noWrap sx={{ flex: 1 }}>{t.subject}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{when(t.last_message_at)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1 }}>
              {t.preview_from}: {t.preview}
            </Typography>
            {t.unread ? (
              <Box sx={{ minWidth: 20, height: 20, px: 0.75, borderRadius: 10, bgcolor: 'error.main', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {t.unread}
              </Box>
            ) : null}
          </Box>
        </Box>
      ))}
    </Box>
  );

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, px: compact ? 1.5 : 0, pt: compact ? 1.5 : 0 }}>
      <Typography variant={compact ? 'h6' : 'h5'} fontWeight={800} sx={{ flex: 1 }}>Messages</Typography>
      {canStart ? <Button variant="contained" onClick={() => setComposing(true)}>New message</Button> : null}
    </Box>
  );

  return (
    <Box data-testid="messages-page" sx={{ width: '100%', maxWidth: wide ? 1240 : 760, mx: 'auto', height: compact ? '100%' : 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column', minHeight: 420 }}>
      {!openId || wide ? header : null}
      <Box sx={{ flex: 1, minHeight: 0, border: `1px solid ${ccTokens.line}`, borderRadius: ccTokens.r, bgcolor: ccTokens.card, overflow: 'hidden', display: wide ? 'grid' : 'block', gridTemplateColumns: wide ? '360px minmax(0, 1fr)' : undefined }}>
        {wide ? (
          <>
            <Box sx={{ borderRight: `1px solid ${ccTokens.line}`, minHeight: 0 }}>{list}</Box>
            <Box sx={{ minHeight: 0 }}>
              {openId ? <ThreadPane key={openId} id={openId} /> : (
                <Typography color="text.secondary" sx={{ p: 3 }}>Pick a message on the left.</Typography>
              )}
            </Box>
          </>
        ) : openId ? (
          <ThreadPane key={openId} id={openId} onBack={() => navigate(basePath)} />
        ) : list}
      </Box>
      <ComposeDialog
        open={composing}
        onClose={() => setComposing(false)}
        onSent={(id) => {
          setComposing(false);
          threads.refetch();
          openThread(id);
        }}
      />
    </Box>
  );
}
