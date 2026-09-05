import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  useAnnouncements,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useDuplicateAnnouncement,
  useToggleAnnouncement,
} from '../../hooks/useAnnouncements';
import type { Announcement, AnnouncementStatus } from '../../api/webstore.api';

const FILTERS: { id: string; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'off', label: 'Off' },
  { id: 'expired', label: 'Expired' },
  { id: 'template', label: 'Templates' },
];

const STATUS_COLOR: Record<AnnouncementStatus, 'success' | 'warning' | 'default' | 'error' | 'info'> = {
  live: 'success',
  scheduled: 'info',
  off: 'default',
  expired: 'warning',
  template: 'default',
};

export default function AnnouncementsPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [status, setStatus] = useState('');
  const [copyOpen, setCopyOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Announcement | null>(null);
  const { data = [], isLoading } = useAnnouncements(status ? { status } : undefined);
  const { data: copySource = [] } = useAnnouncements();
  const create = useCreateAnnouncement();
  const toggle = useToggleAnnouncement();
  const duplicate = useDuplicateAnnouncement();
  const remove = useDeleteAnnouncement();

  const copyRows = useMemo(() => {
    const templates = copySource.filter((row) => row.is_template);
    const rest = copySource.filter((row) => !row.is_template);
    return [...templates, ...rest];
  }, [copySource]);

  async function handleNew() {
    try {
      const row = await create.mutateAsync({
        title: 'Untitled announcement',
        kind: 'promotion',
        style: 'sale',
        placements: ['banner'],
        is_active: false,
      });
      navigate(`/announcements/${row.id}`);
    } catch {
      enqueueSnackbar('Could not create announcement', { variant: 'error' });
    }
  }

  async function handleDuplicate(id: number) {
    try {
      const row = await duplicate.mutateAsync(id);
      setCopyOpen(false);
      navigate(`/announcements/${row.id}`);
    } catch {
      enqueueSnackbar('Could not duplicate', { variant: 'error' });
    }
  }

  if (isLoading) return <LoadingScreen message="Loading announcements…" />;

  return (
    <Box>
      <PageHeader
        title="Announcements"
        subtitle="Customer-facing notices on www. Duplicate a template or an old one, then tweak."
        action={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => setCopyOpen(true)}>
              Copy from…
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleNew}>
              New
            </Button>
          </Stack>
        }
      />
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        {FILTERS.map((filter) => (
          <Chip
            key={filter.id || 'all'}
            label={filter.label}
            color={status === filter.id ? 'primary' : 'default'}
            variant={status === filter.id ? 'filled' : 'outlined'}
            onClick={() => setStatus(filter.id)}
          />
        ))}
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Title</TableCell>
            <TableCell>Kind</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Placements</TableCell>
            <TableCell>Dates</TableCell>
            <TableCell align="right">Priority</TableCell>
            <TableCell>On</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.id} hover>
              <TableCell>{row.title}</TableCell>
              <TableCell>{row.kind}</TableCell>
              <TableCell>
                <Chip size="small" label={row.status} color={STATUS_COLOR[row.status]} />
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                  {(row.placements || []).map((p) => (
                    <Chip key={p} size="small" label={p.replace('_', ' ')} variant="outlined" />
                  ))}
                </Stack>
              </TableCell>
              <TableCell>
                <Typography variant="caption">
                  {(row.starts_at || 'open').slice(0, 10)} → {(row.ends_at || 'open').slice(0, 10)}
                </Typography>
              </TableCell>
              <TableCell align="right">{row.priority}</TableCell>
              <TableCell>
                <Switch
                  checked={row.is_active}
                  disabled={row.is_template}
                  onChange={(_, checked) => toggle.mutate({ id: row.id, isActive: checked })}
                />
              </TableCell>
              <TableCell align="right">
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => navigate(`/announcements/${row.id}`)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Duplicate">
                  <IconButton size="small" onClick={() => handleDuplicate(row.id)}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton size="small" onClick={() => setToDelete(row)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8}>
                <Typography color="text.secondary">No announcements in this filter.</Typography>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      <Dialog open={copyOpen} onClose={() => setCopyOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Copy from…</DialogTitle>
        <DialogContent>
          <List>
            {copyRows.map((row) => (
              <ListItemButton key={row.id} onClick={() => handleDuplicate(row.id)}>
                <ListItemText
                  primary={row.title}
                  secondary={row.is_template ? 'Template' : row.status}
                />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCopyOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete announcement?"
        message={toDelete ? `Delete “${toDelete.title}”? This cannot be undone.` : ''}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          await remove.mutateAsync(toDelete.id);
          setToDelete(null);
        }}
      />
    </Box>
  );
}
