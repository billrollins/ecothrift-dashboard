import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import {
  useCreateQualityAuditForm,
  useDeleteQualityAuditForm,
  useQualityAuditForm,
  useQualityAuditForms,
  useUpdateQualityAuditForm,
} from '../../hooks/useQualityAuditForms';
import { useSnackbar } from 'notistack';
import {
  QA_CONTROL_CATALOG,
  type QaControlKind,
  type QaFormDefinition,
  type QaFormDefinitionCheck,
  type QaFormDefinitionSection,
  type QualityAuditFormSummary,
} from '../../types/qualityAudit.types';

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
  const editingId = formId ? Number.parseInt(formId, 10) : null;
  const isCreating = !Number.isFinite(editingId);

  const { data: list } = useQualityAuditForms();
  const { data: existing, isLoading } = useQualityAuditForm(Number.isFinite(editingId) ? editingId : null);
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

  useEffect(() => {
    if (isCreating) {
      setSlug('');
      setTitle('');
      setIntro('');
      setIcon('');
      setIsActive(true);
      setDefinition(emptyDefinition());
    }
  }, [isCreating]);

  useEffect(() => {
    if (!existing) return;
    setSlug(existing.slug);
    setTitle(existing.title);
    setIntro(existing.intro);
    setIcon(existing.icon);
    setIsActive(existing.is_active);
    setDefinition(existing.definition || emptyDefinition());
  }, [existing]);

  const locked = Boolean(existing?.is_system);
  const feedsDashboard = Boolean(existing?.feeds_dashboard);

  function updateDefinition(next: QaFormDefinition) {
    setDefinition(next);
  }

  function patchSection(sectionIndex: number, patch: Partial<QaFormDefinitionSection>) {
    updateDefinition({
      ...definition,
      sections: definition.sections.map((s, i) => (i === sectionIndex ? { ...s, ...patch } : s)),
    });
  }
  function moveSection(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= definition.sections.length) return;
    const sections = [...definition.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    updateDefinition({ ...definition, sections });
  }
  function addSection() {
    updateDefinition({ ...definition, sections: [...definition.sections, emptySection()] });
  }
  function removeSection(index: number) {
    if (definition.sections.length <= 1) return;
    updateDefinition({ ...definition, sections: definition.sections.filter((_, i) => i !== index) });
  }

  function patchCheck(sectionIndex: number, checkIndex: number, patch: Partial<QaFormDefinitionCheck>) {
    const section = definition.sections[sectionIndex];
    const checks = section.checks.map((c, i) => (i === checkIndex ? { ...c, ...patch } : c));
    patchSection(sectionIndex, { checks });
  }
  function moveCheck(sectionIndex: number, checkIndex: number, dir: -1 | 1) {
    const section = definition.sections[sectionIndex];
    const target = checkIndex + dir;
    if (target < 0 || target >= section.checks.length) return;
    const checks = [...section.checks];
    [checks[checkIndex], checks[target]] = [checks[target], checks[checkIndex]];
    patchSection(sectionIndex, { checks });
  }
  function addCheck(sectionIndex: number) {
    const section = definition.sections[sectionIndex];
    patchSection(sectionIndex, { checks: [...section.checks, emptyCheck()] });
  }
  function removeCheck(sectionIndex: number, checkIndex: number) {
    const section = definition.sections[sectionIndex];
    if (section.checks.length <= 1) return;
    patchSection(sectionIndex, { checks: section.checks.filter((_, i) => i !== checkIndex) });
  }

  const totalChecks = useMemo(
    () => definition.sections.reduce((sum, s) => sum + s.checks.length, 0),
    [definition],
  );

  async function handleSave() {
    setSaveError(null);
    const input = { slug: slug.trim(), title: title.trim(), intro: intro.trim(), icon: icon.trim(), definition, is_active: isActive };
    try {
      if (isCreating) {
        const created = await createForm.mutateAsync(input);
        enqueueSnackbar('Form created.', { variant: 'success' });
        navigate(`/admin/quality-audit/forms/${created.id}`, { replace: true });
      } else if (editingId != null) {
        await updateForm.mutateAsync({ id: editingId, input });
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
      if (editingId === deleteTarget.id) navigate('/admin/quality-audit/forms', { replace: true });
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { detail?: string } } })?.response?.data;
      enqueueSnackbar(data?.detail ?? 'Could not delete form.', { variant: 'error' });
      setDeleteTarget(null);
    }
  }

  if (isLoading) {
    return <LoadingScreen message="Loading form…" />;
  }

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate('/admin/quality-audit/forms')} sx={{ minHeight: 44 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={800}>
          {isCreating ? 'New QA form' : 'Edit QA form'}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {existing ? (
          <Stack direction="row" spacing={0.75} flexWrap="wrap">
            {locked ? <Chip size="small" label="System" color="warning" /> : null}
            {feedsDashboard ? <Chip size="small" label="Feeds dashboard" color="primary" /> : null}
            {existing.is_active ? null : <Chip size="small" label="Inactive" color="default" />}
          </Stack>
        ) : null}
      </Stack>

      {/* Forms index list */}
      {isCreating && list ? (
        <Box sx={{ mb: 3 }}>
          <FormsIndex
            forms={list}
            onEdit={(id) => navigate(`/admin/quality-audit/forms/${id}`)}
            onDelete={(form) => setDeleteTarget(form)}
          />
        </Box>
      ) : null}

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
        <Typography variant="subtitle1" fontWeight={800}>
          Sections ({definition.sections.length}) · {totalChecks} checks
        </Typography>
        <Button startIcon={<AddIcon />} onClick={addSection} sx={{ minHeight: 44 }}>
          Add section
        </Button>
      </Stack>

      <Stack spacing={1.5}>
        {definition.sections.map((section, sIndex) => (
          <SectionEditor
            key={section.id}
            section={section}
            sectionNumber={sIndex + 1}
            canMoveUp={sIndex > 0}
            canMoveDown={sIndex < definition.sections.length - 1}
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

      <Stack direction="row" spacing={1.5} sx={{ mt: 2, pb: 4 }} flexWrap="wrap">
        <Button variant="contained" onClick={handleSave} disabled={createForm.isPending || updateForm.isPending} sx={{ minHeight: 48, fontWeight: 800, px: 4 }}>
          {createForm.isPending || updateForm.isPending ? 'Saving…' : 'Save form'}
        </Button>
        {existing && !locked ? (
          <Button
            variant="outlined"
            color="error"
            onClick={() => setDeleteTarget(existing)}
            sx={{ minHeight: 48 }}
          >
            Delete
          </Button>
        ) : null}
      </Stack>

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

// ── Forms index list ────────────────────────────────────────────────────────

function FormsIndex({
  forms,
  onEdit,
  onDelete,
}: {
  forms: QualityAuditFormSummary[];
  onEdit: (id: number) => void;
  onDelete: (form: { id: number; title: string }) => void;
}) {
  const navigate = useNavigate();
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={800}>Existing forms</Typography>
          <Button startIcon={<AddIcon />} onClick={() => navigate('/admin/quality-audit/forms/new')} sx={{ minHeight: 44 }}>
            New form
          </Button>
        </Stack>
        <Stack spacing={1}>
          {forms.map((form) => (
            <Stack
              key={form.id}
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ p: 1.25, borderRadius: 2, border: 1, borderColor: 'divider' }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                  <Typography fontWeight={700} noWrap>{form.title}</Typography>
                  <Typography variant="caption" color="text.secondary">/{form.slug}</Typography>
                  {form.is_system ? <Chip size="small" label="System" color="warning" /> : null}
                  {form.feeds_dashboard ? <Chip size="small" label="Dashboard" color="primary" /> : null}
                  {!form.is_active ? <Chip size="small" label="Inactive" /> : null}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {form.section_count} sections · {form.check_count} checks
                </Typography>
              </Box>
              <Button size="small" onClick={() => onEdit(form.id)} sx={{ minHeight: 44 }}>Edit</Button>
              {!form.is_system ? (
                <IconButton size="small" onClick={() => onDelete(form)} sx={{ minHeight: 44 }}>
                  <DeleteOutlineIcon />
                </IconButton>
              ) : null}
            </Stack>
          ))}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Editing below creates a brand-new form. To edit an existing one, pick it from the list above.
        </Typography>
      </CardContent>
    </Card>
  );
}

// ── Section editor ──────────────────────────────────────────────────────────

function SectionEditor({
  section,
  sectionNumber,
  canMoveUp,
  canMoveDown,
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
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPatch: (patch: Partial<QaFormDefinitionSection>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onAddCheck: () => void;
  onPatchCheck: (checkIndex: number, patch: Partial<QaFormDefinitionCheck>) => void;
  onMoveCheck: (checkIndex: number, dir: -1 | 1) => void;
  onRemoveCheck: (checkIndex: number) => void;
}) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="overline" color="text.secondary">Section {sectionNumber}</Typography>
          <Box sx={{ flex: 1 }} />
          <IconButton size="small" disabled={!canMoveUp} onClick={() => onMove(-1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
          <IconButton size="small" disabled={!canMoveDown} onClick={() => onMove(1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={onRemove}><DeleteOutlineIcon fontSize="small" /></IconButton>
        </Stack>
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
      </CardContent>
    </Card>
  );
}

// ── Check editor ────────────────────────────────────────────────────────────

function CheckEditor({
  check,
  checkNumber,
  canMoveUp,
  canMoveDown,
  onPatch,
  onMove,
  onRemove,
}: {
  check: QaFormDefinitionCheck;
  checkNumber: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPatch: (patch: Partial<QaFormDefinitionCheck>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const control = (check.control || 'yesno') as QaControlKind;
  const meta = QA_CONTROL_CATALOG.find((m) => m.value === control);
  const needsOptions = Boolean(meta?.needsOptions);
  const options = check.options || [];

  function patchOption(index: number, value: string) {
    const next = options.map((o, i) => (i === index ? value : o));
    onPatch({ options: next });
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
        <IconButton size="small" disabled={!canMoveUp} onClick={() => onMove(-1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
        <IconButton size="small" disabled={!canMoveDown} onClick={() => onMove(1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
        <IconButton size="small" onClick={onRemove}><DeleteOutlineIcon fontSize="small" /></IconButton>
      </Stack>
      <Stack spacing={1.25}>
        <TextField
          label="Check label"
          value={check.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          size="small"
          fullWidth
        />
        <TextField
          label="Hint (what good looks like)"
          value={check.hint || ''}
          onChange={(e) => onPatch({ hint: e.target.value })}
          size="small"
          fullWidth
        />
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Feedback control
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={control}
            sx={{ flexWrap: 'wrap', maxWidth: '100%', '& .MuiToggleButtonGroup-grouped': { minHeight: 40 } }}
          >
            {QA_CONTROL_CATALOG.map((m) => (
              <ToggleButton
                key={m.value}
                value={m.value}
                onClick={() => onPatch({ control: m.value })}
                sx={{ py: 0.5, px: 1.25, textTransform: 'none', fontWeight: 600, fontSize: '0.75rem' }}
              >
                {m.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
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
                  <IconButton size="small" onClick={() => removeOption(i)}><DeleteOutlineIcon fontSize="small" /></IconButton>
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
