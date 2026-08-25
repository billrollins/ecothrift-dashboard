import { lazy, Suspense, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Refresh from '@mui/icons-material/Refresh';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';

import {
  getMailboxMessage,
  getMailboxMessages,
  replyMailboxMessage,
  syncMailbox,
  type MailboxMessage,
} from '../../api/mailbox.api';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { PageHeader } from '../../components/common/PageHeader';
import { GRID_FILL_SX, GRID_MIN_HEIGHT, PAGE_FILL_SX } from '../../components/common/gridChrome';

const EmailEditor = lazy(async () => {
  const module = await import('../../components/common/RichTextEditor');
  return { default: module.RichTextEditor };
});

export default function RetailInboxPage() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [replyHtml, setReplyHtml] = useState('');

  const messages = useQuery({
    queryKey: ['retailMailbox', search],
    queryFn: async () => (
      await getMailboxMessages({
        classification: 'general',
        search: search || undefined,
        ordering: '-received_at',
      })
    ).data,
  });
  const selected = useQuery({
    queryKey: ['retailMailboxMessage', selectedId],
    queryFn: async () => (await getMailboxMessage(selectedId!)).data,
    enabled: selectedId != null,
  });
  const refresh = useMutation({
    mutationFn: async () => (await syncMailbox()).data,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['retailMailbox'] });
      enqueueSnackbar(
        `Mailbox refreshed: ${result.created} new, ${result.updated} updated`,
        { variant: 'success' },
      );
    },
    onError: () => enqueueSnackbar('Mailbox refresh failed or Graph is disabled', { variant: 'error' }),
  });
  const reply = useMutation({
    mutationFn: async () => replyMailboxMessage(selectedId!, replyHtml),
    onSuccess: () => {
      setReplyHtml('');
      queryClient.invalidateQueries({ queryKey: ['retailMailbox'] });
      enqueueSnackbar('Reply sent', { variant: 'success' });
    },
    onError: () => enqueueSnackbar('Reply could not be sent', { variant: 'error' }),
  });

  const columns: GridColDef<MailboxMessage>[] = [
    {
      field: 'is_read',
      headerName: '',
      width: 52,
      renderCell: ({ row }) => row.is_read ? null : <Chip size="small" color="primary" label="New" />,
    },
    { field: 'from_email', headerName: 'From', width: 210 },
    { field: 'subject', headerName: 'Subject', flex: 1, minWidth: 220 },
    {
      field: 'received_at',
      headerName: 'Received',
      width: 180,
      valueFormatter: (value) => value ? new Date(String(value)).toLocaleString() : '',
    },
  ];

  return (
    <Box sx={PAGE_FILL_SX}>
      <PageHeader
        title="Retail inbox"
        subtitle="General messages received by retail@ecothrift.us. Admin access only."
        action={(
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
          >
            Refresh now
          </Button>
        )}
      />
      {messages.isError && <Alert severity="error">Could not load the retail inbox.</Alert>}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1.1fr 1fr' },
          gridTemplateRows: 'minmax(0, 1fr)',
          gap: 2,
          flex: 1,
          minHeight: 0,
        }}
      >
        <Box sx={PAGE_FILL_SX}>
          <TextField
            size="small"
            label="Search inbox"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ mb: 1.5, minWidth: 280, flexShrink: 0 }}
          />
          <Box sx={GRID_FILL_SX}>
            <DataGrid
              rows={messages.data?.results || []}
              columns={columns}
              loading={messages.isLoading}
              disableRowSelectionOnClick
              onRowClick={({ row }) => setSelectedId(row.id)}
              pageSizeOptions={[25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            />
          </Box>
        </Box>
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            p: 2,
            minHeight: GRID_MIN_HEIGHT,
            overflowY: 'auto',
          }}
        >
          {!selectedId && (
            <Typography color="text.secondary">Select a message to read and reply.</Typography>
          )}
          {selected.isLoading && <LoadingScreen />}
          {selected.data && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6">{selected.data.subject || '(No subject)'}</Typography>
                <Typography variant="body2" color="text.secondary">
                  From {selected.data.from_email}
                  {selected.data.received_at
                    ? ` · ${new Date(selected.data.received_at).toLocaleString()}`
                    : ''}
                </Typography>
              </Box>
              <Divider />
              {selected.data.html_body ? (
                <Box
                  sx={{ overflowWrap: 'anywhere' }}
                  dangerouslySetInnerHTML={{ __html: selected.data.html_body }}
                />
              ) : (
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{selected.data.text_body}</Typography>
              )}
              {selected.data.attachment_names.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                  Attachments: {selected.data.attachment_names.join(', ')}
                </Typography>
              )}
              <Divider />
              <Suspense fallback={<LoadingScreen message="Loading email editor…" />}>
                <EmailEditor
                  value={replyHtml}
                  onChange={(value) => setReplyHtml(value.html)}
                  placeholder="Write a reply…"
                  variant="email"
                />
              </Suspense>
              <Button
                variant="contained"
                onClick={() => reply.mutate()}
                disabled={reply.isPending || !replyHtml.replace(/<[^>]+>/g, '').trim()}
              >
                Send reply
              </Button>
            </Stack>
          )}
        </Box>
      </Box>
    </Box>
  );
}
