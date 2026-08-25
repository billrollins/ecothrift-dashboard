import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import {
  useConversation,
  useConversationActions,
  useConversations,
} from '../../../hooks/useWebStore';
import type { Conversation, ConversationParams } from '../../../api/webstore.api';
import { getConversations } from '../../../api/webstore.api';
import { getMailboxTemplates } from '../../../api/mailbox.api';
import {
  describeWhen,
  fmtWhen,
  GRID_FILL_SX,
  GRID_MIN_HEIGHT,
  PAGE_FILL_SX,
  GRID_PAGE_PROPS,
  GRID_SX,
  humanize,
  noRowsSlot,
  conversationNeedsStaffAction,
  NextActionBadge,
  ThreadStateChip,
  WhenCell,
} from '../presentation';
import { useOnlineSalesMobile } from '../useOnlineSalesMobile';

type Props = {
  onOpenHold?: (reservationId: number) => void;
  /** Prefill the search box (e.g. from Directory → Messages). */
  initialSearch?: string;
  /** Open this conversation (e.g. Holds → Messages deep link). */
  initialThreadId?: number | null;
  /** Keep `?thread=` in sync when staff pick another conversation. */
  onThreadChange?: (conversationId: number | null) => void;
};

type Filter = 'needs_reply' | 'has_hold' | 'resolved' | 'archived' | '';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'needs_reply', label: 'Needs reply' },
  { id: 'has_hold', label: 'Has hold' },
  { id: 'resolved', label: 'Resolved' },
  { id: '', label: 'All' },
  { id: 'archived', label: 'Archived' },
];

const EMPTY_COPY: Record<Filter, string> = {
  needs_reply: 'Nothing waiting on a reply',
  has_hold: 'No threads attached to a hold',
  resolved: 'Nothing resolved yet',
  archived: 'Nothing archived yet',
  '': 'No conversations yet',
};

function conversationListParams(filter: Filter, search: string): ConversationParams {
  const base: ConversationParams = {
    ordering: '-last_message_at',
    archived: '0',
    search: search || undefined,
  };
  if (filter === 'needs_reply') return { ...base, state: 'needs_reply' };
  if (filter === 'resolved') return { ...base, state: 'resolved' };
  if (filter === 'has_hold') return { ...base, has_hold: '1' };
  if (filter === 'archived') return { ...base, archived: '1' };
  return base;
}

/** Staff view: attribute by role, never by raw enum value. */
function authorLabel(kind: string): string {
  if (kind === 'customer') return 'Customer';
  if (kind === 'staff') return 'Eco-Thrift';
  if (kind === 'system') return 'System';
  return humanize(kind);
}

function ConversationMobileRow({
  conversation,
  onSelect,
}: {
  conversation: Conversation;
  onSelect: (id: number) => void;
}) {
  const stamp = describeWhen(conversation.last_message_at, new Date(), 'happened');
  const needsAction = conversationNeedsStaffAction(conversation.state);

  return (
    <Box
      component="button"
      type="button"
      onClick={() => onSelect(conversation.id)}
      sx={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        gap: 1.25,
        px: 1.5,
        py: 1.25,
        minHeight: 72,
        textAlign: 'left',
        border: '1.5px solid',
        borderColor: needsAction ? 'error.light' : 'divider',
        borderRadius: 2.5,
        bgcolor: needsAction ? 'action.hover' : 'background.paper',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        transition: 'transform 120ms ease, background-color 120ms ease',
        '&:active': { transform: 'scale(0.985)' },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
            {conversation.guest_name || 'Guest'}
          </Typography>
          {needsAction ? <NextActionBadge /> : null}
          <Box sx={{ ml: 'auto', flexShrink: 0 }}>
            <ThreadStateChip state={conversation.state} />
          </Box>
        </Stack>
        <Typography variant="body2" color="text.secondary" noWrap>
          {conversation.listing_title || conversation.guest_email || 'Conversation'}
          {conversation.reservation_id ? ' · Hold' : ''}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 0.25,
            color: stamp?.bucket === 'today' ? 'success.dark' : 'text.secondary',
            fontWeight: stamp?.bucket === 'today' ? 700 : 500,
          }}
        >
          {stamp ? `${stamp.dayLabel}${stamp.timeLabel ? ` · ${stamp.timeLabel}` : ''}` : '-'}
        </Typography>
      </Box>
      <ChevronRight sx={{ color: 'text.disabled', flexShrink: 0 }} />
    </Box>
  );
}

export default function MessagesPanel({
  onOpenHold,
  initialSearch = '',
  initialThreadId = null,
  onThreadChange,
}: Props) {
  const isMobile = useOnlineSalesMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [filter, setFilter] = useState<Filter>(
    initialSearch || initialThreadId ? '' : 'needs_reply',
  );
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch.trim());
  const [selectedId, setSelectedId] = useState<number | null>(initialThreadId);
  const [reply, setReply] = useState('');
  const [subject, setSubject] = useState('');
  const [templateKey, setTemplateKey] = useState('');

  useEffect(() => {
    const next = (initialSearch || '').trim();
    setSearchInput(initialSearch || '');
    setSearch(next);
    if (next) setFilter('');
  }, [initialSearch]);

  useEffect(() => {
    if (initialThreadId == null) return;
    setSelectedId(initialThreadId);
    setFilter('');
  }, [initialThreadId]);

  const selectThread = (id: number | null) => {
    setSelectedId(id);
    onThreadChange?.(id);
  };

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const listParams = useMemo(
    () => conversationListParams(filter, search),
    [filter, search],
  );

  // Warm the other filter buckets so toggling feels instant (no blank flash).
  useEffect(() => {
    for (const f of FILTERS) {
      if (f.id === filter) continue;
      const params = conversationListParams(f.id, search);
      void queryClient.prefetchQuery({
        queryKey: ['webConversations', params],
        queryFn: async () => (await getConversations(params)).data,
        staleTime: 20_000,
      });
    }
  }, [filter, search, queryClient]);

  const { data, isLoading, isFetching, isError, isPlaceholderData } =
    useConversations(listParams);
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
      field: 'state_action',
      headerName: '',
      width: 52,
      sortable: false,
      filterable: false,
      align: 'center',
      headerAlign: 'center',
      valueGetter: (_v, row) => (conversationNeedsStaffAction(row.state) ? 1 : 0),
      renderCell: ({ row }) =>
        conversationNeedsStaffAction(row.state) ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              overflow: 'visible',
            }}
          >
            <NextActionBadge />
          </Box>
        ) : null,
    },
    { field: 'guest_name', headerName: 'Customer', width: 150 },
    { field: 'listing_title', headerName: 'Listing', flex: 1, minWidth: 150 },
    {
      field: 'state',
      headerName: 'State',
      width: 165,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <ThreadStateChip state={row.state} />
        </Box>
      ),
    },
    {
      field: 'reservation_id',
      headerName: 'Hold',
      width: 100,
      sortable: false,
      renderCell: ({ row }) =>
        row.reservation_id && onOpenHold ? (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onOpenHold(row.reservation_id!);
              }}
              sx={{ textTransform: 'none', fontWeight: 700, minWidth: 0, px: 0.75 }}
            >
              Open hold
            </Button>
          </Box>
        ) : (
          <Typography variant="body2" color="text.disabled">
            -
          </Typography>
        ),
    },
    {
      field: 'last_message_at',
      headerName: 'Last message',
      width: 148,
      renderCell: ({ value }) => <WhenCell value={value as string} tone="happened" />,
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

  const archiveThread = async () => {
    if (!selected) return;
    try {
      await actions.archive.mutateAsync(selected.id);
      enqueueSnackbar('Archived - out of the inbox, still searchable', {
        variant: 'success',
      });
    } catch {
      enqueueSnackbar('Could not archive', { variant: 'error' });
    }
  };

  // Only the first paint - never swap the whole panel for a spinner on filter change.
  if (isLoading && !data) return <LoadingScreen />;
  if (isError && !data) return <Alert severity="error">Could not load conversations.</Alert>;

  const rows = data?.results || [];
  const showList = !isMobile || selectedId == null;
  const showThread = !isMobile || selectedId != null;
  const listBusy = isFetching && isPlaceholderData;

  const threadPane = (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2,
        minHeight: isMobile ? '70dvh' : GRID_MIN_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        pb: isMobile ? 'env(safe-area-inset-bottom)' : 0,
      }}
    >
      {!selectedId && (
        <Stack flex={1} alignItems="center" justifyContent="center" sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary" align="center">
            Select a conversation to read and reply.
          </Typography>
        </Stack>
      )}
      {selectedId && loadingThread && <LoadingScreen />}
      {selectedId && !loadingThread && selected?.id === selectedId && (
        <>
          <Box sx={{ p: 2, pb: 1.5 }}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="flex-start"
              justifyContent="space-between"
            >
              <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ minWidth: 0, flex: 1 }}>
                {isMobile && (
                  <IconButton
                    aria-label="Back to conversations"
                    onClick={() => selectThread(null)}
                    edge="start"
                    size="small"
                    sx={{ mt: -0.25 }}
                  >
                    <ArrowBack />
                  </IconButton>
                )}
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                    {selected.guest_name || 'Guest'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {selected.guest_email}
                  </Typography>
                  {selected.listing_title ? (
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {selected.listing_title}
                    </Typography>
                  ) : null}
                  {selected.reservation_id ? (
                    <Typography variant="body2" color="text.secondary" noWrap>
                      Linked to a hold
                    </Typography>
                  ) : null}
                </Box>
              </Stack>
              <ThreadStateChip state={selected.state} />
            </Stack>
            <Stack direction="row" spacing={0.75} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
              {selected.reservation_id && onOpenHold ? (
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => onOpenHold(selected.reservation_id!)}
                >
                  Open hold #{selected.reservation_id}
                </Button>
              ) : null}
              {selected.customer ? (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => navigate(`/admin/users?customer=${selected.customer}`)}
                >
                  Open customer record
                </Button>
              ) : null}
            </Stack>
            <Stack direction="row" spacing={0.75} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
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
              {selected.archived_at ? (
                <Button size="small" onClick={() => actions.unarchive.mutateAsync(selected.id)}>
                  Unarchive
                </Button>
              ) : (
                selected.state === 'resolved' && (
                  <Button size="small" onClick={archiveThread}>
                    Archive
                  </Button>
                )
              )}
            </Stack>
          </Box>

          <Divider />

          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: 2,
              minHeight: isMobile ? 180 : 200,
              maxHeight: isMobile ? 'none' : 300,
            }}
          >
            {(selected.messages || []).length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No messages yet.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {(selected.messages || []).map((m) => (
                  <Box key={m.id}>
                    <Stack direction="row" spacing={1} alignItems="baseline">
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {authorLabel(m.author_kind)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {fmtWhen(m.created_at)}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {m.body}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>

          <Divider />

          <Stack spacing={1.5} sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                select
                size="small"
                label="Template"
                value={templateKey}
                onChange={(event) => applyTemplate(event.target.value)}
                sx={{ minWidth: isMobile ? 0 : 160, flex: 1 }}
                fullWidth={isMobile}
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
                sx={{ flex: 1.4 }}
                fullWidth={isMobile}
              />
            </Stack>
            <TextField
              multiline
              minRows={isMobile ? 4 : 3}
              size="small"
              label="Reply"
              placeholder="Reply to customer…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              fullWidth
            />
            <Button
              variant="contained"
              size={isMobile ? 'large' : 'medium'}
              onClick={sendReply}
              disabled={!reply.trim() || actions.reply.isPending}
              sx={{ alignSelf: isMobile ? 'stretch' : 'flex-start' }}
            >
              Send reply
            </Button>
          </Stack>
        </>
      )}
    </Paper>
  );

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : { xs: '1fr', lg: '1.15fr 1fr' },
        gap: 2,
        // Desktop fills the page; on a phone the page scrolls as one column.
        ...(isMobile ? {} : { flex: 1, minHeight: 0, gridTemplateRows: 'minmax(0, 1fr)' }),
      }}
    >
      {showList && (
        <Box sx={isMobile ? undefined : PAGE_FILL_SX}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            sx={{ mb: 2 }}
            flexWrap="wrap"
            useFlexGap
            alignItems={{ sm: 'center' }}
          >
            <ToggleButtonGroup
              exclusive
              size="small"
              value={filter}
              onChange={(_e, next: Filter | null) => next !== null && setFilter(next)}
              sx={{ flexWrap: 'wrap', width: isMobile ? '100%' : undefined }}
            >
              {FILTERS.map((f) => (
                <ToggleButton
                  key={f.label}
                  value={f.id}
                  sx={{ textTransform: 'none', px: 1.5, flex: isMobile ? 1 : undefined }}
                >
                  {f.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <TextField
              size="small"
              placeholder="Search name, email, listing"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              fullWidth={isMobile}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: isMobile ? 0 : 240, flex: isMobile ? undefined : '1 1 240px' }}
            />
            {listBusy ? (
              <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: 'auto' } }}>
                Updating…
              </Typography>
            ) : null}
          </Stack>
          <Box
            sx={{
              // Keep layout stable while a filter result is in flight.
              opacity: listBusy ? 0.85 : 1,
              transition: 'opacity 80ms linear',
              pointerEvents: listBusy ? 'none' : 'auto',
              ...(isMobile ? {} : PAGE_FILL_SX),
            }}
          >
            {isMobile ? (
              rows.length === 0 ? (
                <Stack
                  alignItems="center"
                  justifyContent="center"
                  sx={{
                    px: 3,
                    py: 6,
                    border: '1px dashed',
                    borderColor: 'divider',
                    borderRadius: 2.5,
                  }}
                >
                  <Typography variant="body2" color="text.secondary" align="center">
                    {search ? 'No threads match this search' : EMPTY_COPY[filter]}
                  </Typography>
                </Stack>
              ) : (
                <Stack spacing={1}>
                  {rows.map((row) => (
                    <ConversationMobileRow
                      key={row.id}
                      conversation={row}
                      onSelect={selectThread}
                    />
                  ))}
                </Stack>
              )
            ) : (
              <Box sx={GRID_FILL_SX}>
                <DataGrid
                  rows={rows}
                  columns={columns}
                  getRowId={(r) => r.id}
                  disableRowSelectionOnClick
                  onRowClick={(params) => selectThread(params.row.id)}
                  getRowClassName={({ row }) =>
                    conversationNeedsStaffAction(row.state) ? 'os-row--unread' : ''
                  }
                  slots={noRowsSlot(search ? 'No threads match this search' : EMPTY_COPY[filter])}
                  sx={GRID_SX}
                  {...GRID_PAGE_PROPS}
                />
              </Box>
            )}
          </Box>
        </Box>
      )}

      {showThread && threadPane}
    </Box>
  );
}
