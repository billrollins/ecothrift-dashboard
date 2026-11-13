/**
 * Texts (Dash Update #132, Bill 2026-11-13: "where do we see texts we get from that number?"). Every text that comes in
 * to our toll-free number, one row per number, with who it is when the number matches a staff member (or a Thrift+
 * member). Open one to read it all and reply from our number. Owner and managers. STOP / START / HELP are still answered
 * automatically; they show here as already read.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { PageHeader } from '../../components/common/PageHeader';
import { getInbox, getThread, prettyPhone, replyToThread, type Conversation, type ThreadMessage } from '../../api/texting.api';

const MAX = 270; // our name and the STOP line take the rest of two texts

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function who(row: { name: string; phone: string; kind: Conversation['kind'] }): { title: string; sub: string } {
  if (!row.name) return { title: prettyPhone(row.phone), sub: 'Not someone we know' };
  return { title: row.name, sub: `${row.kind === 'staff' ? 'Staff' : 'Thrift+ member'} · ${prettyPhone(row.phone)}` };
}

function errorText(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;
}

export default function TextsPage() {
  const [params, setParams] = useSearchParams();
  const open = params.get('n') || '';
  const inbox = useQuery({
    queryKey: ['texting', 'inbox'],
    queryFn: () => getInbox().then((r) => r.data),
    refetchInterval: 15_000,
  });

  const rows = inbox.data?.conversations ?? [];
  const pick = (phone: string) => setParams(phone ? { n: phone } : {}, { replace: false });

  return (
    <Box>
      <PageHeader
        title="Texts"
        subtitle="Texts people send to our number, (888) 812-7905. Open one to read it and reply."
      />
      {inbox.isError ? <Alert severity="error">{errorText(inbox.error, 'Could not load texts.')}</Alert> : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '340px 1fr' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Paper variant="outlined" sx={{ display: { xs: open ? 'none' : 'block', md: 'block' }, overflow: 'hidden' }}>
          {inbox.isLoading ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          ) : rows.length === 0 ? (
            <Typography sx={{ p: 2, color: 'text.secondary' }} data-testid="texts-empty">
              No texts yet. When someone texts (888) 812-7905, it shows up here.
            </Typography>
          ) : (
            rows.map((row) => {
              const name = who(row);
              return (
                <ButtonBase
                  key={row.phone}
                  onClick={() => pick(row.phone)}
                  data-testid="texts-row"
                  sx={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    px: 2,
                    py: 1.25,
                    borderBottom: 1,
                    borderColor: 'divider',
                    bgcolor: row.phone === open ? 'action.selected' : undefined,
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="baseline">
                    <Typography sx={{ flex: 1, fontWeight: row.unread ? 800 : 600, minWidth: 0 }} noWrap>
                      {name.title}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', flexShrink: 0 }}>{when(row.last_at)}</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography sx={{ flex: 1, fontSize: 13.5, color: 'text.secondary', minWidth: 0 }} noWrap>
                      {row.last_body || '(picture)'}
                    </Typography>
                    {/* Always rendered so the row never shifts when it is read. */}
                    <Badge
                      color="error"
                      badgeContent={row.unread}
                      invisible={!row.unread}
                      sx={{ '& .MuiBadge-badge': { position: 'static', transform: 'none' }, width: 24, justifyContent: 'flex-end' }}
                    />
                  </Stack>
                </ButtonBase>
              );
            })
          )}
        </Paper>
        <Box sx={{ display: { xs: open ? 'block' : 'none', md: 'block' } }}>
          {open ? (
            <ThreadPane phone={open} onBack={() => pick('')} />
          ) : (
            <Paper variant="outlined" sx={{ p: 3, color: 'text.secondary', display: { xs: 'none', md: 'block' } }}>
              Pick a number on the left.
            </Paper>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function ThreadPane({ phone, onBack }: { phone: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const thread = useQuery({
    queryKey: ['texting', 'thread', phone],
    queryFn: () => getThread(phone).then((r) => r.data),
    refetchInterval: 15_000,
  });
  const send = useMutation({
    mutationFn: (body: string) => replyToThread(phone, body).then((r) => r.data),
    onSuccess: (data) => {
      setDraft('');
      queryClient.setQueryData(['texting', 'thread', phone], data);
      void queryClient.invalidateQueries({ queryKey: ['texting', 'inbox'] });
      void queryClient.invalidateQueries({ queryKey: ['texting', 'status'] });
    },
  });

  // Opening a thread marks it read: refresh the list and the bell.
  useEffect(() => {
    if (!thread.data) return;
    void queryClient.invalidateQueries({ queryKey: ['texting', 'inbox'] });
    void queryClient.invalidateQueries({ queryKey: ['texting', 'status'] });
  }, [thread.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = thread.data?.messages.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  if (thread.isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress size={24} />
      </Paper>
    );
  }
  if (thread.isError || !thread.data) {
    return <Alert severity="error">{errorText(thread.error, 'Could not open this conversation.')}</Alert>;
  }
  const data = thread.data;
  const name = who(data);
  const usNumber = /^\d{10}$/.test(phone);
  const lastSent = send.data?.message;

  return (
    <Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minHeight: 420 }} data-testid="texts-thread">
      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
        <Button onClick={onBack} size="small" sx={{ display: { md: 'none' }, textTransform: 'none', minWidth: 0 }}>
          Back
        </Button>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800 }} noWrap>{name.title}</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }} noWrap>{name.sub}</Typography>
        </Box>
        {data.stopped ? <Chip size="small" color="warning" label="Said STOP" /> : null}
      </Stack>
      <Box sx={{ flex: 1, overflowY: 'auto', maxHeight: '60vh', p: 2 }}>
        <Stack spacing={1}>
          {data.messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
          <div ref={bottom} />
        </Stack>
      </Box>
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        {data.stopped ? (
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>
            They replied STOP, so we cannot text them. If they text START, replies open again.
          </Typography>
        ) : !usNumber ? (
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>Replies go only to US numbers.</Typography>
        ) : (
          <>
            {!data.replies_live ? (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                Replies are kept here but do not go out yet. Waiting on: {data.waiting_on.join('; ')}.
              </Alert>
            ) : null}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
              <TextField
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
                placeholder="Write a reply"
                multiline
                minRows={2}
                fullWidth
                size="small"
                helperText={`${draft.length}/${MAX}. Starts with "Eco-Thrift:" and ends with "Reply STOP to opt out."`}
                inputProps={{ 'data-testid': 'texts-reply' }}
              />
              <Button
                variant="contained"
                disabled={!draft.trim() || send.isPending}
                onClick={() => send.mutate(draft.trim())}
                sx={{ textTransform: 'none', flexShrink: 0 }}
                data-testid="texts-send"
              >
                {send.isPending ? 'Sending…' : 'Send'}
              </Button>
            </Stack>
            {send.isError ? <Alert severity="error" sx={{ mt: 1 }}>{errorText(send.error, 'Could not send.')}</Alert> : null}
            {/* Held is already said above the box; say only what went wrong. */}
            {lastSent && lastSent.status !== 'sent' && lastSent.status !== 'held' ? (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {lastSent.status_label}{lastSent.reason ? `: ${lastSent.reason}` : ''}
              </Alert>
            ) : null}
          </>
        )}
      </Box>
    </Paper>
  );
}

function Bubble({ message }: { message: ThreadMessage }) {
  const ours = message.from === 'us';
  const note = ours
    ? [message.by, message.status && message.status !== 'sent' ? message.status_label : ''].filter(Boolean).join(' · ')
    : message.keyword
      ? `${message.keyword.toUpperCase()}: answered automatically`
      : message.media
        ? `${message.media} picture${message.media === 1 ? '' : 's'} (open Twilio to see)`
        : '';
  return (
    <Box sx={{ alignSelf: ours ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderRadius: 2,
          bgcolor: ours ? 'primary.main' : 'action.hover',
          color: ours ? 'primary.contrastText' : 'text.primary',
          opacity: ours && message.status && message.status !== 'sent' ? 0.6 : 1,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 14.5,
        }}
      >
        {message.body || '(no words)'}
      </Box>
      <Typography sx={{ fontSize: 11.5, color: 'text.secondary', textAlign: ours ? 'right' : 'left', mt: 0.25 }}>
        {when(message.at)}
        {note ? ` · ${note}` : ''}
      </Typography>
    </Box>
  );
}
