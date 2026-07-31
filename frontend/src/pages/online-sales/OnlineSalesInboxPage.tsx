import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  InputAdornment,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  useConversation,
  useConversationActions,
  useConversations,
  useReservationAction,
  useReservations,
} from '../../hooks/useWebStore';
import type { Conversation, Reservation } from '../../api/webstore.api';
import { getMailboxTemplates } from '../../api/mailbox.api';
import { isTodaysPickupRow } from './pickupFilter';

type InboxTab = 'holds' | 'pickup' | 'messages';

function formatCountdown(expiresAt: string | null | undefined): string {
  if (!expiresAt) return '—';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return '—';
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${mins}m`;
}

function HoldsPanel() {
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const { data, isLoading, isError } = useReservations({
    search: search || undefined,
    status: status || undefined,
    ordering: '-created_at',
  });
  const action = useReservationAction();

  const run = async (id: number, act: 'confirm' | 'stage' | 'decline' | 'cancel' | 'expire' | 'complete') => {
    try {
      await action.mutateAsync({ id, action: act });
      enqueueSnackbar(`${act} ok`, { variant: 'success' });
    } catch {
      enqueueSnackbar(`Could not ${act}`, { variant: 'error' });
    }
  };

  const columns: GridColDef<Reservation>[] = [
    {
      field: 'created_at',
      headerName: 'Requested',
      width: 150,
      valueFormatter: (v) => (v ? new Date(String(v)).toLocaleString() : ''),
    },
    { field: 'listing_title', headerName: 'Listing', flex: 1, minWidth: 160 },
    { field: 'customer_name', headerName: 'Customer', width: 140 },
    { field: 'email', headerName: 'Email', width: 180 },
    { field: 'quantity', headerName: 'Qty', width: 70 },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: ({ row }) => <Chip size="small" label={row.status_display || row.status} />,
    },
    {
      field: 'expires_at',
      headerName: 'Expires',
      width: 150,
      valueFormatter: (v) => (v ? new Date(String(v)).toLocaleString() : '—'),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 360,
      sortable: false,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          {row.status === 'requested' && (
            <Button size="small" onClick={() => run(row.id, 'confirm')}>Confirm</Button>
          )}
          {['requested', 'confirmed'].includes(row.status) && (
            <Button size="small" onClick={() => run(row.id, 'stage')}>Stage</Button>
          )}
          {['requested', 'confirmed', 'ready_for_pickup'].includes(row.status) && (
            <>
              <Button size="small" onClick={() => run(row.id, 'complete')}>Complete</Button>
              <Button size="small" color="warning" onClick={() => run(row.id, 'expire')}>Expire</Button>
              <Button size="small" color="inherit" onClick={() => run(row.id, 'cancel')}>Cancel</Button>
              <Button size="small" color="error" onClick={() => run(row.id, 'decline')}>Decline</Button>
            </>
          )}
        </Stack>
      ),
    },
  ];

  if (isLoading && !data) return <LoadingScreen />;
  if (isError) return <Alert severity="error">Could not load holds.</Alert>;

  return (
    <>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          placeholder="Search customer or listing"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 240 }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All</MenuItem>
          {['requested', 'confirmed', 'ready_for_pickup', 'completed', 'declined', 'expired', 'cancelled'].map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
      </Stack>
      <Box sx={{ height: 520 }}>
        <DataGrid
          rows={data?.results || []}
          columns={columns}
          getRowId={(r) => r.id}
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Customer status links use unguessable tokens (not ETW order numbers).
      </Typography>
    </>
  );
}

function PickupPanel() {
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading, isError } = useReservations({
    ordering: 'expires_at',
  });
  const action = useReservationAction();

  const rows = useMemo(
    () => (data?.results || []).filter((r) => isTodaysPickupRow(r)),
    [data],
  );

  const run = async (
    id: number,
    act: 'stage' | 'extend' | 'cancel' | 'expire' | 'complete',
  ) => {
    try {
      await action.mutateAsync({ id, action: act });
      enqueueSnackbar(`${act} ok`, { variant: 'success' });
    } catch {
      enqueueSnackbar(`Could not ${act}`, { variant: 'error' });
    }
  };

  const columns: GridColDef<Reservation>[] = [
    { field: 'customer_name', headerName: 'Customer', width: 140 },
    { field: 'phone', headerName: 'Phone', width: 130 },
    { field: 'listing_title', headerName: 'Item', flex: 1, minWidth: 160 },
    {
      field: 'item_sku',
      headerName: 'SKU',
      width: 110,
      valueGetter: (_v, row) => row.item_sku || '—',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: ({ row }) => <Chip size="small" label={row.status_display || row.status} />,
    },
    {
      field: 'expires_at',
      headerName: 'Countdown',
      width: 120,
      valueGetter: (_v, row) => formatCountdown(row.expires_at),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 340,
      sortable: false,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          {row.status !== 'ready_for_pickup' && (
            <Button size="small" onClick={() => run(row.id, 'stage')}>Stage</Button>
          )}
          <Button size="small" onClick={() => run(row.id, 'extend')}>Extend</Button>
          <Button size="small" onClick={() => run(row.id, 'complete')}>Complete</Button>
          <Button size="small" color="inherit" onClick={() => run(row.id, 'cancel')}>Cancel</Button>
          <Button size="small" color="warning" onClick={() => run(row.id, 'expire')}>
            No-show
          </Button>
        </Stack>
      ),
    },
  ];

  if (isLoading && !data) return <LoadingScreen />;
  if (isError) return <Alert severity="error">Could not load pickup holds.</Alert>;

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Confirmed and staged holds for in-store pickup. No-show releases the hold.
      </Typography>
      <Box sx={{ height: 520 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(r) => r.id}
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        />
      </Box>
    </>
  );
}

function MessagesPanel() {
  const { enqueueSnackbar } = useSnackbar();
  const [filter, setFilter] = useState<'needs_reply' | 'has_hold' | 'resolved' | ''>('needs_reply');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const [subject, setSubject] = useState('');
  const [templateKey, setTemplateKey] = useState('');

  const listParams = useMemo(() => {
    if (filter === 'needs_reply') return { state: 'needs_reply', ordering: '-last_message_at' };
    if (filter === 'resolved') return { state: 'resolved', ordering: '-last_message_at' };
    if (filter === 'has_hold') return { has_hold: '1', ordering: '-last_message_at' };
    return { ordering: '-last_message_at' };
  }, [filter]);

  const { data, isLoading, isError } = useConversations(listParams);
  const { data: selected, isLoading: loadingThread } = useConversation(selectedId);
  const actions = useConversationActions();
  const { data: templates = [] } = useQuery({
    queryKey: ['mailboxTemplates'],
    queryFn: async () => (await getMailboxTemplates()).data,
  });

  const applyTemplate = (key: string) => {
    setTemplateKey(key);
    const template = templates.find((candidate) => candidate.key === key);
    if (!template) return;
    const values: Record<string, string> = {
      customer_name: selected?.guest_name || '',
      listing_title: selected?.listing_title || 'your request',
      pickup_by: '',
      store_address: '8425 W Center Rd, Omaha, NE 68124',
      hold_link: '',
      staff_name: '',
    };
    const fill = (value: string) => value.replace(
      /\{\{\s*([a-z_]+)\s*\}\}/g,
      (_match, name: string) => values[name] || '',
    );
    setSubject(fill(template.subject));
    setReply(
      fill(template.html_body)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    );
  };

  const columns: GridColDef<Conversation>[] = [
    {
      field: 'staff_unread',
      headerName: '',
      width: 56,
      renderCell: ({ row }) =>
        row.staff_unread > 0 ? <Chip size="small" color="error" label={row.staff_unread} /> : null,
    },
    { field: 'guest_name', headerName: 'Customer', width: 140 },
    { field: 'listing_title', headerName: 'Listing', flex: 1, minWidth: 140 },
    {
      field: 'state',
      headerName: 'State',
      width: 150,
      renderCell: ({ row }) => <Chip size="small" label={row.state.replace(/_/g, ' ')} />,
    },
    {
      field: 'reservation_id',
      headerName: 'Hold',
      width: 80,
      valueFormatter: (v) => (v ? `#${v}` : '—'),
    },
    {
      field: 'last_message_at',
      headerName: 'Last msg',
      width: 160,
      valueFormatter: (v) => (v ? new Date(String(v)).toLocaleString() : ''),
    },
  ];

  const sendReply = async () => {
    if (!selectedId || !reply.trim()) return;
    try {
      await actions.reply.mutateAsync({
        id: selectedId,
        body: reply.trim(),
        subject: subject.trim() || undefined,
      });
      setReply('');
      setSubject('');
      setTemplateKey('');
      enqueueSnackbar('Reply sent', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not send reply', { variant: 'error' });
    }
  };

  if (isLoading && !data) return <LoadingScreen />;
  if (isError) return <Alert severity="error">Could not load conversations.</Alert>;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' }, gap: 2 }}>
      <Box>
        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
          {[
            { id: 'needs_reply' as const, label: 'Needs reply' },
            { id: 'has_hold' as const, label: 'Has hold' },
            { id: 'resolved' as const, label: 'Resolved' },
            { id: '' as const, label: 'All' },
          ].map((f) => (
            <Button
              key={f.label}
              size="small"
              variant={filter === f.id ? 'contained' : 'outlined'}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </Stack>
        <Box sx={{ height: 480 }}>
          <DataGrid
            rows={data?.results || []}
            columns={columns}
            getRowId={(r) => r.id}
            disableRowSelectionOnClick
            onRowClick={(params) => setSelectedId(params.row.id)}
            pageSizeOptions={[25]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          />
        </Box>
      </Box>

      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, minHeight: 480 }}>
        {!selectedId && (
          <Typography color="text.secondary">Select a conversation to read and reply.</Typography>
        )}
        {selectedId && loadingThread && <LoadingScreen />}
        {selectedId && !loadingThread && selected?.id === selectedId && (
          <Stack spacing={1.5} sx={{ height: '100%' }}>
            <Box>
              <Typography variant="h6">{selected.guest_name || 'Guest'}</Typography>
              <Typography variant="body2" color="text.secondary">
                {selected.guest_email}
                {selected.listing_title ? ` · ${selected.listing_title}` : ''}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button size="small" onClick={() => actions.assign.mutateAsync(selected.id)}>
                Assign to me
              </Button>
              {selected.state === 'resolved' ? (
                <Button size="small" onClick={() => actions.reopen.mutateAsync(selected.id)}>
                  Reopen
                </Button>
              ) : (
                <Button size="small" onClick={() => actions.resolve.mutateAsync(selected.id)}>
                  Resolve
                </Button>
              )}
            </Stack>
            <Divider />
            <Box sx={{ flex: 1, overflowY: 'auto', maxHeight: 280 }}>
              {(selected.messages || []).map((m) => (
                <Box key={m.id} sx={{ mb: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {m.author_kind} · {new Date(m.created_at).toLocaleString()}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {m.body}
                  </Typography>
                </Box>
              ))}
            </Box>
            <TextField
              select
              size="small"
              label="Template"
              value={templateKey}
              onChange={(event) => applyTemplate(event.target.value)}
              fullWidth
            >
              <MenuItem value="">No template</MenuItem>
              {templates.map((template) => (
                <MenuItem key={template.key} value={template.key}>{template.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Email subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="New reply about this item"
              fullWidth
            />
            <TextField
              multiline
              minRows={2}
              placeholder="Reply to customer…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              fullWidth
            />
            <Button variant="contained" onClick={sendReply} disabled={!reply.trim()}>
              Send reply
            </Button>
          </Stack>
        )}
      </Box>
    </Box>
  );
}

export default function OnlineSalesInboxPage() {
  const [tab, setTab] = useState<InboxTab>('holds');

  return (
    <Box>
      <PageHeader
        title="Inbox & Holds"
        subtitle="Verify holds and reply to customer messages. Pay at POS — no online payment."
      />
      <Tabs value={tab} onChange={(_, v: InboxTab) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="holds" label="Holds" />
        <Tab value="pickup" label="Ready for pickup" />
        <Tab value="messages" label="Messages" />
      </Tabs>
      {tab === 'holds' && <HoldsPanel />}
      {tab === 'pickup' && <PickupPanel />}
      {tab === 'messages' && <MessagesPanel />}
    </Box>
  );
}
