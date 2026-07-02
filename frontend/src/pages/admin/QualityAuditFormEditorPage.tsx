import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import {
  useCreateQualityAuditForm,
  useDeleteQualityAuditForm,
  useQualityAuditForm,
  useUpdateQualityAuditForm,
} from '../../hooks/useQualityAuditForms';
import { useSnackbar } from 'notistack';
import {
  QA_CONTROL_CATALOG,
  type QaControlKind,
  type QaFormDefinition,
  type QaFormDefinitionCheck,
  type QaFormDefinitionSection,
} from '../../types/qualityAudit.types';
import { downloadQaForm, parseQaFormFile, qaFormToFileObject, serializeQaForm } from './qaFormFile';

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

function emptyCheck(): QaFormDefinitionCheck {
  return { id: newId('chk'), label: '', control: 'yesno', hint: '', options: [] };
}
function emptySection(): QaFormDefinitionSection {
  return { id: newId('sec'), title: '', intro: '', icon: '', checks: [emptyCheck()] };
}
function emptyDefinition(): QaFormDefinition {
  return { template_version: 1, sections: [emptySection()] };
}

export default function QualityAuditFormEditorPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const editingId = formId && formId !== 'new' ? Number.parseInt(formId, 10) : null;
  const isCreating = editingId == null || !Number.isFinite(editingId);

  const { data: existing, isLoading } = useQualityAuditForm(isCreating ? null : editingId);
  const createForm = useCreateQualityAuditForm();
  const updateForm = useUpdateQualityAuditForm();
  const deleteForm = useDeleteQualityAuditForm();

  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [icon, setIcon] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [definition, setDefinition] = useState<QaFormDefinition>(emptyDefinition());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating) {
      setSlug('');
      setTitle('');
      setIntro('');
      setIcon('');
      setIsActive(true);
      const def = emptyDefinition();
      setDefinition(def);
      setExpandedSection(def.sections[0].id);
    }
  }, [isCreating]);

  useEffect(() => {
    if (!existing) return;
    setSlug(existing.slug);
    setTitle(existing.title);
    setIntro(existing.intro);
    setIcon(existing.icon);
    setIsActive(existing.is_active);
    const def = existing.definition || emptyDefinition();
    setDefinition(def);
    setExpandedSection(def.sections[0]?.id ?? null);
  }, [existing]);

  const locked = Boolean(existing?.is_system);
  const feedsDashboard = Boolean(existing?.feeds_dashboard);

  function patchSection(sectionIndex: number, patch: Partial<QaFormDefinitionSection>) {
    setDefinition((def) => ({
      ...def,
      sections: def.sections.map((s, i) => (i === sectionIndex ? { ...s, ...patch } : s)),
    }));
  }
  function moveSection(index: number, dir: -1 | 1) {
    setDefinition((def) => {
      const target = index + dir;
      if (target < 0 || target >= def.sections.length) return def;
      const sections = [...def.sections];
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...def, sections };
    });
  }
  function addSection() {
    const section = emptySection();
    setDefinition((def) => ({ ...def, sections: [...def.sections, section] }));
    setExpandedSection(section.id);
  }
  function removeSection(index: number) {
    setDefinition((def) =>
      def.sections.length <= 1 ? def : { ...def, sections: def.sections.filter((_, i) => i !== index) });
  }

  function patchCheck(sectionIndex: number, checkIndex: number, patch: Partial<QaFormDefinitionCheck>) {
    setDefinition((def) => {
      const section = def.sections[sectionIndex];
      const checks = section.checks.map((c, i) => (i === checkIndex ? { ...c, ...patch } : c));
      return { ...def, sections: def.sections.map((s, i) => (i === sectionIndex ? { ...s, checks } : s)) };
    });
  }
  function moveCheck(sectionIndex: number, checkIndex: number, dir: -1 | 1) {
    setDefinition((def) => {
      const section = def.sections[sectionIndex];
      const target = checkIndex + dir;
      if (target < 0 || target >= section.checks.length) return def;
      const checks = [...section.checks];
      [checks[checkIndex], checks[target]] = [checks[target], checks[checkIndex]];
      return { ...def, sections: def.sections.map((s, i) => (i === sectionIndex ? { ...s, checks } : s)) };
    });
  }
  function addCheck(sectionIndex: number) {
    setDefinition((def) => {
      const section = def.sections[sectionIndex];
      return {
        ...def,
        sections: def.sections.map((s, i) => (i === sectionIndex ? { ...s, checks: [...section.checks, emptyCheck()] } : s)),
      };
    });
  }
  function removeCheck(sectionIndex: number, checkIndex: number) {
    setDefinition((def) => {
      const section = def.sections[sectionIndex];
      if (section.checks.length <= 1) return def;
      return {
        ...def,
        sections: def.sections.map((s, i) =>
          i === sectionIndex ? { ...s, checks: section.checks.filter((_, ci) => ci !== checkIndex) } : s),
      };
    });
  }

  const totalChecks = useMemo(
    () => definition.sections.reduce((sum, s) => sum + s.checks.length, 0),
    [definition],
  );

  const draftAsForm = () => ({
    slug: slug.trim(),
    title: title.trim(),
    intro: intro.trim(),
    icon: icon.trim(),
    is_active: isActive,
    definition,
  });

  async function handleSave() {
    setSaveError(null);
    const input = draftAsForm();
    try {
      if (isCreating) {
        const created = await createForm.mutateAsync(input);
        enqueueSnackbar('Form created.', { variant: 'success' });
        navigate(`/admin/quality-audit/forms/${created.id}`, { replace: true });
      } else if (editingId != null) {
        // The backend rejects any PATCH containing `slug` on system forms,
        // so only send it when it actually changed.
        const { slug: nextSlug, ...rest } = input;
        const patch = locked || nextSlug === existing?.slug ? rest : { ...rest, slug: nextSlug };
        await updateForm.mutateAsync({ id: editingId, input: patch });
        enqueueSnackbar('Form saved.', { variant: 'success' });
      }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string> } })?.response?.data;
      if (data) {
        const first = Object.values(data)[0];
        setSaveError(typeof first === 'string' ? first : 'Validation error.');
      } else {
        setSaveError('Could not save form.');
      }
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    try {
      await deleteForm.mutateAsync(deleteTarget.id);
      enqueueSnackbar('Form deleted.', { variant: 'success' });
      setDeleteTarget(null);
      navigate('/admin/quality-audit/forms', { replace: true });
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { detail?: string } } })?.response?.data;
      enqueueSnackbar(data?.detail ?? 'Could not delete form.', { variant: 'error' });
      setDeleteTarget(null);
    }
  }

  // ── Export / import of the current draft ───────────────────────────────────

  function handleExportDraft(format: 'json' | 'yaml') {
    setExportAnchor(null);
    const file = qaFormToFileObject(draftAsForm());
    const text = serializeQaForm(file, format);
    const blob = new Blob([text], { type: format === 'json' ? 'application/json' : 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qa-form-${file.slug || 'draft'}.${format === 'json' ? 'json' : 'yaml'}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLoadFromFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseQaFormFile(String(reader.result ?? ''));
        setTitle(parsed.file.title);
        setIntro(parsed.file.intro);
        setIcon(parsed.file.icon);
        setIsActive(parsed.file.is_active);
        if (!locked && parsed.file.slug) setSlug(parsed.file.slug);
        setDefinition(parsed.file.definition);
        setExpandedSection(parsed.file.definition.sections[0]?.id ?? null);
        enqueueSnackbar(
          `Loaded "${parsed.file.title}" (${parsed.sectionCount} sections, ${parsed.checkCount} checks). Review and save.`,
          { variant: 'info' },
        );
      } catch (err) {
        enqueueSnackbar(err instanceof Error ? err.message : 'Could not read the file.', { variant: 'error' });
      }
    };
    reader.onerror = () => enqueueSnackbar('Could not read the file.', { variant: 'error' });
    reader.readAsText(file);
  }

  if (isLoading) {
    return <LoadingScreen message="Loading form…" />;
  }

  const saving = createForm.isPending || updateForm.isPending;

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', pb: 12 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate('/admin/quality-audit/forms')} sx={{ minHeight: 44 }} aria-label="Back to forms">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" fontWeight={800} noWrap>
            {isCreating ? 'New QA form' : title || 'Edit QA form'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {definition.sections.length} sections · {totalChecks} checks
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
          {locked ? <Chip size="small" label="System" color="warning" variant="outlined" /> : null}
          {feedsDashboard ? <Chip size="small" label="Feeds dashboard" color="primary" variant="outlined" /> : null}
          {existing && !existing.is_active ? <Chip size="small" label="Inactive" /> : null}
        </Stack>
        <Tooltip title="Export this draft (JSON / YAML)">
          <IconButton onClick={(e) => setExportAnchor(e.currentTarget)} sx={{ minHeight: 44 }} aria-label="Export form">
            <FileDownloadIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Load draft from a JSON / YAML file">
          <IconButton onClick={() => importInputRef.current?.click()} sx={{ minHeight: 44 }} aria-label="Load form from file">
            <FileUploadIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
        <MenuItem onClick={() => handleExportDraft('json')}>Export as JSON</MenuItem>
        <MenuItem onClick={() => handleExportDraft('yaml')}>Export as YAML</MenuItem>
      </Menu>
      <input
        ref={importInputRef}
        type="file"
        accept=".json,.yaml,.yml,application/json,text/yaml"
        hidden
        onChange={(e) => {
          handleLoadFromFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <Card variant="outlined" sx={{ borderRadius: 3, mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5 }}>
            Form details
          </Typography>
          <Stack spacing={1.5}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={locked}
                helperText={locked ? 'Locked (system form)' : 'Unique URL key, e.g. retail'}
                size="small"
                sx={{ flex: 1 }}
              />
              <TextField
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                size="small"
                sx={{ flex: 2 }}
              />
            </Stack>
            <TextField
              label="Intro / subtitle"
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              size="small"
              fullWidth
            />
            <Stack direction="row" spacing={1.5} alignItems="center">
              <TextField
                label="Icon key"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                size="small"
                sx={{ flex: 1 }}
                helperText="e.g. storefront, factCheck"
              />
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2">Active</Typography>
                <Switch checked={isActive} onChange={(_, v) => setIsActive(v)} />
              </Stack>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={800}>Sections</Typography>
        <Button startIcon={<AddIcon />} onClick={addSection} sx={{ minHeight: 44 }}>
          Add section
        </Button>
      </Stack>

      <Stack spacing={1}>
        {definition.sections.map((section, sIndex) => (
          <SectionEditor
            key={section.id}
            section={section}
            sectionNumber={sIndex + 1}
            expanded={expandedSection === section.id}
            onToggle={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
            canMoveUp={sIndex > 0}
            canMoveDown={sIndex < definition.sections.length - 1}
            canRemove={definition.sections.length > 1}
            onPatch={(patch) => patchSection(sIndex, patch)}
            onMove={(dir) => moveSection(sIndex, dir)}
            onRemove={() => removeSection(sIndex)}
            onAddCheck={() => addCheck(sIndex)}
            onPatchCheck={(ci, patch) => patchCheck(sIndex, ci, patch)}
            onMoveCheck={(ci, dir) => moveCheck(sIndex, ci, dir)}
            onRemoveCheck={(ci) => removeCheck(sIndex, ci)}
          />
        ))}
      </Stack>

      {saveError ? <Alert severity="error" sx={{ mt: 2 }}>{saveError}</Alert> : null}

      {/* Sticky action bar */}
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          mt: 2,
          py: 1.5,
          px: 2,
          mx: -2,
          display: 'flex',
          gap: 1.5,
          alignItems: 'center',
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
          zIndex: 2,
        }}
      >
        <Button
          variant="contained"
          onClick={() => void handleSave()}
          disabled={saving}
          sx={{ minHeight: 48, fontWeight: 800, px: 4 }}
        >
          {saving ? 'Saving…' : isCreating ? 'Create form' : 'Save form'}
        </Button>
        <Button onClick={() => navigate('/admin/quality-audit/forms')} sx={{ minHeight: 48 }}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        {existing && !locked ? (
          <Button
            variant="text"
            color="error"
            onClick={() => setDeleteTarget(existing)}
            sx={{ minHeight: 48 }}
          >
            Delete form
          </Button>
        ) : null}
      </Box>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this form?"
        message="This cannot be undone. Forms with submitted audits cannot be deleted."
        confirmLabel="Delete"
        severity="error"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteForm.isPending}
      />
    </Box>
  );
}

// ── Section editor (collapsible) ────────────────────────────────────────────

function SectionEditor({
  section,
  sectionNumber,
  expanded,
  onToggle,
  canMoveUp,
  canMoveDown,
  canRemove,
  onPatch,
  onMove,
  onRemove,
  onAddCheck,
  onPatchCheck,
  onMoveCheck,
  onRemoveCheck,
}: {
  section: QaFormDefinitionSection;
  sectionNumber: number;
  expanded: boolean;
  onToggle: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canRemove: boolean;
  onPatch: (patch: Partial<QaFormDefinitionSection>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onAddCheck: () => void;
  onPatchCheck: (checkIndex: number, patch: Partial<QaFormDefinitionCheck>) => void;
  onMoveCheck: (checkIndex: number, dir: -1 | 1) => void;
  onRemoveCheck: (checkIndex: number) => void;
}) {
  return (
    <Accordion
      variant="outlined"
      disableGutters
      expanded={expanded}
      onChange={onToggle}
      sx={{ borderRadius: '12px !important', '&::before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1, minWidth: 0 } }}>
        <Typography variant="overline" color="text.secondary" sx={{ flexShrink: 0 }}>
          {sectionNumber}
        </Typography>
        <Typography fontWeight={700} noWrap sx={{ flex: 1, minWidth: 0 }}>
          {section.title || 'Untitled section'}
        </Typography>
        <Chip size="small" label={`${section.checks.length} checks`} sx={{ mr: 0.5 }} />
        <IconButton
          size="small"
          component="span"
          disabled={!canMoveUp}
          onClick={(e) => { e.stopPropagation(); onMove(-1); }}
          aria-label="Move section up"
        >
          <ArrowUpwardIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          component="span"
          disabled={!canMoveDown}
          onClick={(e) => { e.stopPropagation(); onMove(1); }}
          aria-label="Move section down"
        >
          <ArrowDownwardIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          component="span"
          disabled={!canRemove}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label="Delete section"
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              label="Section title"
              value={section.title}
              onChange={(e) => onPatch({ title: e.target.value })}
              size="small"
              sx={{ flex: 2 }}
            />
            <TextField
              label="Icon key"
              value={section.icon || ''}
              onChange={(e) => onPatch({ icon: e.target.value })}
              size="small"
              sx={{ flex: 1 }}
            />
          </Stack>
          <TextField
            label="Section intro"
            value={section.intro || ''}
            onChange={(e) => onPatch({ intro: e.target.value })}
            size="small"
            fullWidth
          />

          <Stack spacing={1}>
            {section.checks.map((check, ci) => (
              <CheckEditor
                key={check.id}
                check={check}
                checkNumber={ci + 1}
                canMoveUp={ci > 0}
                canMoveDown={ci < section.checks.length - 1}
                canRemove={section.checks.length > 1}
                onPatch={(patch) => onPatchCheck(ci, patch)}
                onMove={(dir) => onMoveCheck(ci, dir)}
                onRemove={() => onRemoveCheck(ci)}
              />
            ))}
          </Stack>

          <Button startIcon={<AddIcon />} onClick={onAddCheck} sx={{ minHeight: 44, alignSelf: 'flex-start' }}>
            Add check
          </Button>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

// ── Check editor ────────────────────────────────────────────────────────────

function CheckEditor({
  check,
  checkNumber,
  canMoveUp,
  canMoveDown,
  canRemove,
  onPatch,
  onMove,
  onRemove,
}: {
  check: QaFormDefinitionCheck;
  checkNumber: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canRemove: boolean;
  onPatch: (patch: Partial<QaFormDefinitionCheck>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const control = (check.control || 'yesno') as QaControlKind;
  const meta = QA_CONTROL_CATALOG.find((m) => m.value === control);
  const needsOptions = Boolean(meta?.needsOptions);
  const options = check.options || [];

  function patchOption(index: number, value: string) {
    onPatch({ options: options.map((o, i) => (i === index ? value : o)) });
  }
  function addOption() {
    onPatch({ options: [...options, ''] });
  }
  function removeOption(index: number) {
    onPatch({ options: options.filter((_, i) => i !== index) });
  }

  return (
    <Box sx={{ p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: alpha('#000', 0.015) }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="overline" color="text.secondary">Check {checkNumber}</Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Move check up">
          <ArrowUpwardIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Move check down">
          <ArrowDownwardIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" disabled={!canRemove} onClick={onRemove} aria-label="Delete check">
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Stack spacing={1.25}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <TextField
            label="Check label"
            value={check.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            size="small"
            sx={{ flex: 2 }}
          />
          <TextField
            select
            label="Control"
            value={control}
            onChange={(e) => onPatch({ control: e.target.value as QaControlKind })}
            size="small"
            sx={{ flex: 1, minWidth: 190 }}
          >
            {QA_CONTROL_CATALOG.map((m) => (
              <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
            ))}
          </TextField>
        </Stack>
        <TextField
          label="Hint (what good looks like)"
          value={check.hint || ''}
          onChange={(e) => onPatch({ hint: e.target.value })}
          size="small"
          fullWidth
        />
        {needsOptions ? (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Options {control === 'chips' ? '(issue tags)' : '(zones)'}
            </Typography>
            <Stack spacing={0.75}>
              {options.map((opt, i) => (
                <Stack key={i} direction="row" spacing={0.75} alignItems="center">
                  <TextField
                    value={opt}
                    onChange={(e) => patchOption(i, e.target.value)}
                    size="small"
                    sx={{ flex: 1 }}
                  />
                  <IconButton size="small" onClick={() => removeOption(i)} aria-label="Remove option">
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button size="small" startIcon={<AddIcon />} onClick={addOption} sx={{ alignSelf: 'flex-start', minHeight: 40 }}>
                Add option
              </Button>
            </Stack>
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}
