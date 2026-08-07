/**
 * Label Studio - Admin library of persistent custom labels.
 *
 * Templates open in the full-page designer; PDFs keep the dialog editor.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArchiveIcon from '@mui/icons-material/Archive';
import RestoreIcon from '@mui/icons-material/Restore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import PrintIcon from '@mui/icons-material/Print';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import { useSnackbar } from 'notistack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageHeader } from '../../../components/common/PageHeader';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import {
  archiveCustomLabel,
  createCustomLabel,
  duplicateCustomLabel,
  getCustomLabels,
  restoreCustomLabel,
  type CustomLabel,
  type CustomLabelKind,
} from '../../../api/labels.api';
import LabelEditorDialog from './LabelEditorDialog';
import LabelPrintDialog from './LabelPrintDialog';
import { starterDefinition } from './designerState';
import { formatApiError } from './labelStudioUtils';

const LIST_KEY = ['custom-labels'];

export default function LabelStudioPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const [newMenuAnchor, setNewMenuAnchor] = useState<HTMLElement | null>(null);
  const [editorLabel, setEditorLabel] = useState<CustomLabel | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [printLabel, setPrintLabel] = useState<CustomLabel | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [archiveLabel, setArchiveLabel] = useState<CustomLabel | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...LIST_KEY, search, showArchived],
    queryFn: async () =>
      (
        await getCustomLabels({
          search: search.trim() || undefined,
          include_archived: showArchived ? '1' : undefined,
        })
      ).data,
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => archiveCustomLabel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      enqueueSnackbar('Label archived', { variant: 'success' });
    },
    onError: (reason) =>
      enqueueSnackbar(formatApiError(reason, 'Archive failed'), { variant: 'error' }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => restoreCustomLabel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      enqueueSnackbar('Label restored', { variant: 'success' });
    },
    onError: (reason) =>
      enqueueSnackbar(formatApiError(reason, 'Restore failed'), { variant: 'error' }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => duplicateCustomLabel(id),
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      enqueueSnackbar(`Duplicated “${resp.data.name}”`, { variant: 'success' });
    },
    onError: (reason) =>
      enqueueSnackbar(formatApiError(reason, 'Duplicate failed'), { variant: 'error' }),
  });

  const createTemplateMutation = useMutation({
    mutationFn: () =>
      createCustomLabel({
        name: 'New template',
        kind: 'template',
        width_in: '3',
        height_in: '2',
        definition: starterDefinition(),
      }),
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      navigate(`/admin/label-studio/${resp.data.id}`);
    },
    onError: (reason) =>
      enqueueSnackbar(formatApiError(reason, 'Could not create template'), {
        variant: 'error',
      }),
  });

  const openCreate = (kind: CustomLabelKind) => {
    setNewMenuAnchor(null);
    if (kind === 'template') {
      createTemplateMutation.mutate();
      return;
    }
    setEditorLabel(null);
    setEditorOpen(true);
  };

  const openEdit = (label: CustomLabel) => {
    if (label.kind === 'template') {
      navigate(`/admin/label-studio/${label.id}`);
      return;
    }
    setEditorLabel(label);
    setEditorOpen(true);
  };

  if (isLoading) return <LoadingScreen />;

  const labels = data?.results ?? [];

  return (
    <Box>
      <PageHeader
        title="Label Studio"
        subtitle="Saved custom labels - print any of them, as many copies as you need."
        action={
          <>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={(e) => setNewMenuAnchor(e.currentTarget)}
              disabled={createTemplateMutation.isPending}
            >
              New label
            </Button>
            <Menu
              anchorEl={newMenuAnchor}
              open={Boolean(newMenuAnchor)}
              onClose={() => setNewMenuAnchor(null)}
            >
              <MenuItem onClick={() => openCreate('template')}>
                <TextFieldsIcon fontSize="small" sx={{ mr: 1 }} /> Template (designer)
              </MenuItem>
              <MenuItem onClick={() => openCreate('pdf')}>
                <PictureAsPdfIcon fontSize="small" sx={{ mr: 1 }} /> PDF (print a saved file)
              </MenuItem>
            </Menu>
          </>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Search labels"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ minWidth: 260 }}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
          }
          label="Show archived"
        />
      </Stack>

      {error != null && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }
        >
          Failed to load labels.
        </Alert>
      )}

      {labels.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No labels yet. Create a template (visual designer with text, QR, barcode) or upload a
            PDF to print on demand.
          </Typography>
        </Paper>
      ) : (
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Kind</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Updated</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {labels.map((label) => (
                <TableRow key={label.id} hover sx={{ opacity: label.is_active ? 1 : 0.62 }}>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography fontWeight={600}>{label.name}</Typography>
                      {!label.is_active && <Chip size="small" label="Archived" />}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      icon={label.kind === 'pdf' ? <PictureAsPdfIcon /> : <TextFieldsIcon />}
                      label={label.kind === 'pdf' ? 'PDF' : 'Template'}
                      color={label.kind === 'pdf' ? 'default' : 'primary'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {label.width_in && label.height_in
                      ? `${Number(label.width_in)}″ × ${Number(label.height_in)}″`
                      : '-'}
                  </TableCell>
                  <TableCell>{new Date(label.updated_at).toLocaleDateString()}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip
                        title={
                          !label.is_active
                            ? 'Restore this label before printing'
                            : label.kind === 'pdf' && !label.pdf
                              ? 'No PDF attached - edit this label to upload one'
                              : 'Print copies'
                        }
                      >
                        <span>
                          <IconButton
                            size="small"
                            color="primary"
                            disabled={
                              !label.is_active ||
                              (label.kind === 'pdf' && !label.pdf) ||
                              archiveMutation.isPending ||
                              restoreMutation.isPending ||
                              duplicateMutation.isPending
                            }
                            onClick={() => setPrintLabel(label)}
                          >
                            <PrintIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={label.is_active ? 'Edit' : 'Restore before editing'}>
                        <span>
                        <IconButton
                          size="small"
                          disabled={!label.is_active}
                          onClick={() => openEdit(label)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Duplicate">
                        <IconButton
                          size="small"
                          disabled={!label.is_active || duplicateMutation.isPending}
                          onClick={() => duplicateMutation.mutate(label.id)}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {label.is_active ? (
                        <Tooltip title="Archive">
                          <IconButton
                            size="small"
                            disabled={archiveMutation.isPending}
                            onClick={() => setArchiveLabel(label)}
                          >
                            <ArchiveIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Restore">
                          <IconButton
                            size="small"
                            disabled={restoreMutation.isPending}
                            onClick={() => restoreMutation.mutate(label.id)}
                          >
                            <RestoreIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <LabelEditorDialog
        open={editorOpen}
        kind="pdf"
        label={editorLabel}
        onClose={() => setEditorOpen(false)}
        onSaved={(saved) => {
          setEditorOpen(false);
          queryClient.invalidateQueries({ queryKey: LIST_KEY });
          enqueueSnackbar(`Saved “${saved.name}”`, { variant: 'success' });
        }}
      />
      <LabelPrintDialog
        label={printLabel}
        open={printLabel != null}
        onClose={() => setPrintLabel(null)}
      />
      <ConfirmDialog
        open={archiveLabel != null}
        title="Archive label?"
        message={`Archive “${archiveLabel?.name ?? ''}”? It will be hidden from the normal list, and can be restored later.`}
        confirmLabel="Archive"
        onCancel={() => setArchiveLabel(null)}
        onConfirm={() => {
          if (archiveLabel) archiveMutation.mutate(archiveLabel.id);
          setArchiveLabel(null);
        }}
      />
    </Box>
  );
}
