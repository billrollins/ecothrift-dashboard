import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { useSnackbar } from 'notistack';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { getQualityAuditForm } from '../../api/qualityAuditForms.api';
import {
  useCreateQualityAuditForm,
  useDeleteQualityAuditForm,
  useQualityAuditForms,
  useUpdateQualityAuditForm,
} from '../../hooks/useQualityAuditForms';
import type { QualityAuditFormSummary } from '../../types/qualityAudit.types';
import { downloadQaForm, parseQaFormFile, type ParsedQaFormFile } from './qaFormFile';

function slugFromTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50) || 'form';
}

export default function QualityAuditFormListPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { data: forms, isLoading, isError } = useQualityAuditForms();
  const createForm = useCreateQualityAuditForm();
  const updateForm = useUpdateQualityAuditForm();
  const deleteForm = useDeleteQualityAuditForm();

  const [deleteTarget, setDeleteTarget] = useState<QualityAuditFormSummary | null>(null);
  const [exportAnchor, setExportAnchor] = useState<{ el: HTMLElement; form: QualityAuditFormSummary } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<{
    parsed: ParsedQaFormFile;
    /** Existing form whose slug matches the file, if any */
    conflict: QualityAuditFormSummary | null;
    mode: 'create' | 'update';
    error: string | null;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleExport(form: QualityAuditFormSummary, format: 'json' | 'yaml') {
    setExportAnchor(null);
    try {
      const { data } = await getQualityAuditForm(form.id);
      downloadQaForm(data, format);
    } catch {
      enqueueSnackbar('Export failed — could not load the form.', { variant: 'error' });
    }
  }

  function handleImportFile(file: File | undefined) {
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseQaFormFile(String(reader.result ?? ''));
        const conflict = forms?.find(
          (f) => parsed.file.slug && f.slug.toLowerCase() === parsed.file.slug.toLowerCase(),
        ) ?? null;
        setImportState({ parsed, conflict, mode: conflict ? 'update' : 'create', error: null });
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Could not read the file.');
      }
    };
    reader.onerror = () => setImportError('Could not read the file.');
    reader.readAsText(file);
  }

  async function handleImportConfirm() {
    if (!importState) return;
    const { parsed, conflict, mode } = importState;
    const base = {
      title: parsed.file.title,
      intro: parsed.file.intro,
      icon: parsed.file.icon,
      is_active: parsed.file.is_active,
      definition: parsed.file.definition,
    };
    try {
      if (mode === 'update' && conflict) {
        // Slug stays as-is on update; system-form slugs are locked anyway.
        const updated = await updateForm.mutateAsync({ id: conflict.id, input: base });
        enqueueSnackbar(`Updated "${updated.title}" from file.`, { variant: 'success' });
        setImportState(null);
        navigate(`/admin/quality-audit/forms/${updated.id}`);
      } else {
        let slug = parsed.file.slug || slugFromTitle(parsed.file.title);
        if (forms?.some((f) => f.slug.toLowerCase() === slug.toLowerCase())) {
          slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
        }
        const created = await createForm.mutateAsync({ ...base, slug });
        enqueueSnackbar(`Created "${created.title}" from file.`, { variant: 'success' });
        setImportState(null);
        navigate(`/admin/quality-audit/forms/${created.id}`);
      }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const first = data ? Object.values(data)[0] : null;
      const msg = Array.isArray(first) ? String(first[0]) : typeof first === 'string' ? first : 'Import failed validation.';
      setImportState({ ...importState, error: msg });
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    try {
      await deleteForm.mutateAsync(deleteTarget.id);
      enqueueSnackbar('Form deleted.', { variant: 'success' });
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { detail?: string } } })?.response?.data;
      enqueueSnackbar(data?.detail ?? 'Could not delete form.', { variant: 'error' });
    }
    setDeleteTarget(null);
  }

  if (isLoading) return <LoadingScreen message="Loading forms…" />;

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <IconButton onClick={() => navigate('/admin/quality-audit')} sx={{ minHeight: 44 }} aria-label="Back to Quality Audit">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={800}>QA Forms</Typography>
        <Box sx={{ flex: 1 }} />
        <Button startIcon={<FileUploadIcon />} onClick={() => fileInputRef.current?.click()} sx={{ minHeight: 44 }}>
          Import
        </Button>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/admin/quality-audit/forms/new')}
          sx={{ minHeight: 44, fontWeight: 700 }}
        >
          New form
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, ml: 6.5 }}>
        Checklists managers run from the Quality Audit hub. Export a form as JSON or YAML,
        redesign it, and import it back to create or update a form.
      </Typography>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.yaml,.yml,application/json,text/yaml"
        hidden
        onChange={(e) => {
          handleImportFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {isError && <Alert severity="error">Failed to load forms.</Alert>}
      {importError && (
        <Alert severity="error" onClose={() => setImportError(null)} sx={{ mb: 2 }}>
          {importError}
        </Alert>
      )}

      <Stack spacing={1.25}>
        {forms?.map((form) => (
          <Card
            key={form.id}
            variant="outlined"
            sx={{
              borderRadius: 3,
              p: 1.75,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              transition: 'border-color 120ms, box-shadow 120ms',
              '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                display: 'grid',
                placeItems: 'center',
                bgcolor: form.is_active ? 'primary.50' : 'action.hover',
                color: form.is_active ? 'primary.main' : 'text.disabled',
                flexShrink: 0,
              }}
            >
              <FactCheckIcon />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                <Typography fontWeight={700} noWrap>{form.title}</Typography>
                <Typography variant="caption" color="text.secondary">/{form.slug}</Typography>
                {form.is_system ? <Chip size="small" label="System" color="warning" variant="outlined" /> : null}
                {form.feeds_dashboard ? <Chip size="small" label="Dashboard" color="primary" variant="outlined" /> : null}
                {!form.is_active ? <Chip size="small" label="Inactive" /> : null}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {form.section_count} sections · {form.check_count} checks · updated {new Date(form.updated_at).toLocaleDateString()}
              </Typography>
            </Box>
            <Tooltip title="Export (JSON / YAML)">
              <IconButton
                size="small"
                onClick={(e) => setExportAnchor({ el: e.currentTarget, form })}
                aria-label={`Export ${form.title}`}
                sx={{ minHeight: 44 }}
              >
                <FileDownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {!form.is_system ? (
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => setDeleteTarget(form)}
                  aria-label={`Delete ${form.title}`}
                  sx={{ minHeight: 44 }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
            <Button
              variant="outlined"
              size="small"
              startIcon={<EditIcon fontSize="small" />}
              onClick={() => navigate(`/admin/quality-audit/forms/${form.id}`)}
              sx={{ minHeight: 44, flexShrink: 0 }}
            >
              Edit
            </Button>
          </Card>
        ))}
        {forms && forms.length === 0 ? (
          <Alert severity="info">No forms yet — create one or import a JSON/YAML file.</Alert>
        ) : null}
      </Stack>

      {/* Export format menu */}
      <Menu anchorEl={exportAnchor?.el ?? null} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
        <MenuItem onClick={() => exportAnchor && void handleExport(exportAnchor.form, 'json')}>Export as JSON</MenuItem>
        <MenuItem onClick={() => exportAnchor && void handleExport(exportAnchor.form, 'yaml')}>Export as YAML</MenuItem>
      </Menu>

      {/* Import preview dialog */}
      <Dialog open={Boolean(importState)} onClose={() => setImportState(null)} fullWidth maxWidth="xs">
        <DialogTitle>Import QA form</DialogTitle>
        {importState ? (
          <DialogContent>
            <Stack spacing={1}>
              <Typography fontWeight={700}>{importState.parsed.file.title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {importState.parsed.file.slug ? `/${importState.parsed.file.slug} · ` : ''}
                {importState.parsed.sectionCount} sections · {importState.parsed.checkCount} checks
              </Typography>
              <Divider />
              {importState.conflict ? (
                <RadioGroup
                  value={importState.mode}
                  onChange={(_, v) => setImportState({ ...importState, mode: v as 'create' | 'update' })}
                >
                  <FormControlLabel
                    value="update"
                    control={<Radio />}
                    label={`Update existing "${importState.conflict.title}" (same slug)`}
                  />
                  <FormControlLabel
                    value="create"
                    control={<Radio />}
                    label="Create as a new form (slug gets a unique suffix)"
                  />
                </RadioGroup>
              ) : (
                <Typography variant="body2">A new form will be created.</Typography>
              )}
              {importState.error ? <Alert severity="error">{importState.error}</Alert> : null}
            </Stack>
          </DialogContent>
        ) : null}
        <DialogActions>
          <Button onClick={() => setImportState(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void handleImportConfirm()}
            disabled={createForm.isPending || updateForm.isPending}
          >
            {createForm.isPending || updateForm.isPending
              ? 'Importing…'
              : importState?.mode === 'update'
                ? 'Update form'
                : 'Create form'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete "${deleteTarget?.title ?? ''}"?`}
        message="This cannot be undone. Forms with submitted audits cannot be deleted."
        confirmLabel="Delete"
        severity="error"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteForm.isPending}
      />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : null}
    </Box>
  );
}
