import { Box, Button, IconButton, MenuItem, Stack, TextField, Tooltip } from '@mui/material';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowUpRounded from '@mui/icons-material/KeyboardArrowUpRounded';
import PriorityHighRounded from '@mui/icons-material/PriorityHighRounded';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDepartments } from '../../api/hr.api';
import { useRoutine, useRoutineAssignees, useSaveRoutine } from '../../hooks/useRoutines';
import type { AuditTaxonomy, RoutineCheckDef, RoutineControl, RoutineDefinition, RoutineKind } from '../../api/routines.api';
import { dutyColors, thinScrollSx } from '../../components/duty/tokens';
import { DashedButton, FormSection, fieldSx } from './editorStyles';
import { RoutineHeaderButton, RoutineHeaderIconButton, RoutinePaneHeader } from './RoutinePaneHeader';
import { RoutineJsonDialog } from './RoutineJsonDialog';
import { buildAiBrief, ROUTINE_DOC_FORMAT, type BriefContext, type RoutineDoc } from './routineJson';
import {
  defaultRoutineSettings,
  RoutineSettingsFields,
  settingsFromRoutine,
  settingsToPayload,
  type RoutineSettings,
} from './RoutineSettingsFields';

export { TRIGGER_LABELS } from './RoutineSettingsFields';

const CONTROL_LABELS: Record<RoutineControl, string> = {
  pass_fail: 'Pass / Fail / N/A',
  pass_fail_strict: 'Pass / Fail',
  number: 'Number',
  text: 'Text',
  photo: 'Photo',
};

/**
 * A check is two lines on a desk - what to check over its hint, the answer
 * type over its unit - with critical and delete spanning both on the right.
 */
const CHECK_COLUMNS_WIDE = '24px minmax(0, 1fr) 150px 36px 36px';
const CHECK_COLUMNS_NARROW = '28px minmax(0, 1fr) 84px 40px';
const CHECK_AREAS_WIDE = '"move label answer crit del" "move hint unit crit del"';
const CHECK_AREAS_NARROW = '"move label label del" "move hint hint hint" "move answer unit crit"';

export const emptyDefinition = (): RoutineDefinition => ({
  template_version: 1,
  sections: [{
    id: 'section-1',
    title: 'Section 1',
    checks: [{ id: 'check-1', label: 'Check 1', control: 'pass_fail', hint: '', hint_es: '', label_es: '', unit: '', critical: false, verify_prev: false }],
  }],
});

export interface EditorPreview {
  title: string;
  intro: string;
  definition: RoutineDefinition;
  /** Section kinds preview from a fixture; the editor never authors them. */
  kind?: RoutineKind;
  taxonomy?: AuditTaxonomy | null;
  sections?: Array<{ id: number; name: string }>;
}

export function RoutineEditorPane({
  wide = false,
  onPreviewChange,
}: {
  wide?: boolean;
  onPreviewChange?: (preview: EditorPreview) => void;
}) {
  const { id } = useParams();
  const editingId = id && id !== 'new' ? Number(id) : null;
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const existing = useRoutine(editingId);
  const save = useSaveRoutine();
  const assignees = useRoutineAssignees();
  const departments = useQuery({
    queryKey: ['hr', 'departments'],
    queryFn: async () => (await getDepartments()).data,
  });
  const [settings, setSettings] = useState<RoutineSettings>(() => defaultRoutineSettings(new Date()));
  const { title, intro } = settings;
  // Kind is set by the seed, never in the editor: a section runner has no
  // checklist to author, so the phone previews it from a fixture instead.
  const kind: RoutineKind = existing.data?.kind ?? 'checklist';
  const locked = Boolean(existing.data?.system_key);
  const [definition, setDefinition] = useState<RoutineDefinition>(emptyDefinition());
  const [error, setError] = useState('');
  const [jsonOpen, setJsonOpen] = useState(false);
  // A check just added by Enter grabs focus so authoring flows like a list.
  const [focusCheckId, setFocusCheckId] = useState<string | null>(null);

  useEffect(() => {
    if (!existing.data) return;
    setSettings(settingsFromRoutine(existing.data, new Date()));
    setDefinition(existing.data.definition?.sections?.length ? existing.data.definition : emptyDefinition());
  }, [existing.data]);

  useEffect(() => {
    onPreviewChange?.({
      title,
      intro,
      definition,
      kind,
      taxonomy: existing.data?.runner?.taxonomy ?? null,
      sections: existing.data?.runner?.sections ?? [],
    });
  }, [title, intro, definition, kind, existing.data?.runner, onPreviewChange]);

  const patchSettings = (patch: Partial<RoutineSettings>) => setSettings((prev) => ({ ...prev, ...patch }));

  function edit(mutate: (draft: RoutineDefinition) => void) {
    const next = structuredClone(definition);
    mutate(next);
    setDefinition(next);
  }

  const checkTotal = definition.sections.reduce((sum, section) => sum + section.checks.length, 0);
  const canSave = Boolean(title.trim()) && !save.isPending;

  /** The form as a portable document - unsaved edits included, since that is what the user is looking at. */
  const payload = settingsToPayload(settings, { locked });
  const currentDoc: RoutineDoc = {
    format: ROUTINE_DOC_FORMAT,
    title,
    intro,
    trigger: settings.trigger as RoutineDoc['trigger'],
    due_time: settings.dueTime,
    anchor_date: payload.anchor_date ?? null,
    grace_days: payload.grace_days ?? 0,
    expire_rule: payload.expire_rule ?? 'never',
    expire_count: payload.expire_count ?? 1,
    expire_unit: payload.expire_unit ?? 'hours',
    expire_from_time: payload.expire_from_time ? payload.expire_from_time.slice(0, 5) : null,
    assignment: settings.assignment as RoutineDoc['assignment'],
    audience_type: settings.audienceType,
    audience_all: settings.audienceAll,
    assigned_shifts: settings.assignedShifts,
    assigned_department_ids: settings.assignedDepartmentIds,
    assigned_department: payload.assigned_department ?? null,
    assigned_user_ids: settings.assignedUserIds,
    is_blocking: settings.isBlocking,
    definition,
  };

  const briefContext = useMemo<BriefContext>(() => ({
    departments: (departments.data ?? []).map((d) => ({ id: d.id, name: d.name })),
    people: (assignees.data ?? []).map((p) => ({
      id: p.id,
      name: p.full_name,
      role: p.role,
      department: p.department_name,
    })),
  }), [departments.data, assignees.data]);

  function applyDoc(doc: RoutineDoc) {
    // The brief only carries the fields an outside model reasons about, so the
    // nag moments keep whatever the form already had. Program routines also
    // keep repeats and assignment, or the save would 400.
    setSettings((prev) => ({
      ...prev,
      title: doc.title,
      intro: doc.intro,
      trigger: locked ? prev.trigger : doc.trigger,
      dueTime: doc.due_time,
      nextDue: doc.anchor_date || prev.nextDue,
      graceDays: String(doc.grace_days),
      expireRule: doc.expire_rule,
      expireCount: String(doc.expire_count),
      expireUnit: doc.expire_unit,
      expireFromTime: doc.expire_from_time || '',
      assignment: locked ? prev.assignment : doc.assignment,
      audienceType: locked ? prev.audienceType : doc.audience_type,
      audienceAll: doc.audience_all,
      assignedShifts: doc.assigned_shifts,
      assignedDepartmentIds: doc.assigned_department_ids,
      assignedUserIds: doc.assigned_user_ids,
      isBlocking: doc.is_blocking,
    }));
    setDefinition(doc.definition);
    setJsonOpen(false);
    enqueueSnackbar('Form updated - check the phone, then Save', { variant: 'success' });
  }

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(buildAiBrief(currentDoc, editingId ? 'edit' : 'create', briefContext));
      enqueueSnackbar(
        editingId
          ? 'Copied. Paste it into your AI chat and add what you want changed.'
          : 'Copied. Paste it into your AI chat and describe the routine you want.',
        { variant: 'success' },
      );
    } catch {
      enqueueSnackbar('Could not reach the clipboard', { variant: 'error' });
    }
  }

  function insertCheckAfter(sectionIndex: number, checkIndex: number) {
    const newId = `check-${Date.now()}`;
    edit((draft) => {
      draft.sections[sectionIndex].checks.splice(checkIndex + 1, 0, {
        id: newId,
        label: '',
        control: 'pass_fail',
        hint: '',
        hint_es: '',
        label_es: '',
        unit: '',
        critical: false,
        verify_prev: false,
      });
    });
    setFocusCheckId(newId);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (canSave) void handleSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function handleSave() {
    setError('');
    try {
      const saved = await save.mutateAsync({
        id: editingId ?? undefined,
        data: { ...payload, definition, is_active: true },
      });
      enqueueSnackbar(editingId ? 'Routine saved' : 'Routine created', { variant: 'success' });
      navigate(`/routines/catalog?view=${saved.id}`);
    } catch {
      setError('Could not save this routine.');
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: dutyColors.desk }}>
      <RoutinePaneHeader
        tone="editor"
        eyebrow={editingId ? 'Editing' : 'New routine'}
        title={title.trim() || 'Untitled routine'}
        note={error || `${checkTotal} check${checkTotal === 1 ? '' : 's'} · live on the phone`}
        noteIsError={Boolean(error)}
        actions={(
          <>
            <RoutineHeaderIconButton
              label={editingId
                ? 'Copy for AI - the routine plus instructions, ready to paste into a chat'
                : 'Copy for AI - a blank routine plus instructions, so an AI can draft it for you'}
              icon={<ContentCopyOutlined />}
              onClick={() => void copyBrief()}
            />
            <RoutineHeaderIconButton
              label="Update from JSON - paste or upload what the AI returned"
              icon={<FileUploadOutlined />}
              onClick={() => setJsonOpen(true)}
            />
            <Box sx={{ width: 1, height: 22, mx: 0.25, bgcolor: 'rgba(46,125,50,0.22)' }} />
            <RoutineHeaderButton
              label="Cancel"
              variant="ghost"
              onClick={() => navigate('/routines/catalog')}
            />
            <RoutineHeaderButton
              label="Save"
              variant="primary"
              disabled={!canSave}
              onClick={() => void handleSave()}
            />
          </>
        )}
      />

      <Box sx={{ flex: 1, overflow: 'auto', px: wide ? 3 : 0, py: wide ? 3 : 0, pb: wide ? 5 : 0, ...thinScrollSx }}>
        <Box
          sx={{
            maxWidth: 1040,
            mx: 'auto',
            bgcolor: dutyColors.card,
            border: `1px solid ${dutyColors.ink08}`,
            borderRadius: wide ? '16px' : 0,
            boxShadow: wide ? '0 1px 3px rgba(29,36,64,0.07)' : 'none',
          }}
        >
          <RoutineSettingsFields
            value={settings}
            onChange={patchSettings}
            wide={wide}
            departments={departments.data ?? []}
            people={assignees.data ?? []}
            autoFocusTitle={!editingId}
            locked={locked}
          />

          <FormSection
            wide={wide}
            title="Checklist"
            description={kind === 'checklist'
              ? `${definition.sections.length} section${definition.sections.length === 1 ? '' : 's'}, ${checkTotal} check${checkTotal === 1 ? '' : 's'}, in the order they appear on the phone.`
              : 'This routine has a purpose-built runner. Its schedule and owner are yours to change; its questions are not.'}
          >
            {kind !== 'checklist' ? null : (
            <Stack spacing={2}>
              {definition.sections.map((section, sectionIndex) => (
                <Box
                  key={section.id}
                  sx={{ borderRadius: '12px', border: `1px solid ${dutyColors.ink15}`, overflow: 'hidden' }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.25,
                      py: 1.25,
                      bgcolor: dutyColors.paper,
                      borderBottom: `1px solid ${dutyColors.ink15}`,
                    }}
                  >
                    <TextField
                      value={section.title}
                      onChange={(e) => edit((draft) => {
                        draft.sections[sectionIndex].title = e.target.value;
                      })}
                      placeholder="Section name"
                      size="small"
                      fullWidth
                      sx={fieldSx}
                    />
                    <TextField
                      value={section.title_es || ''}
                      onChange={(e) => edit((draft) => {
                        draft.sections[sectionIndex].title_es = e.target.value;
                      })}
                      placeholder="Spanish title"
                      size="small"
                      fullWidth
                      sx={fieldSx}
                    />
                    <IconAction
                      label={definition.sections.length > 1 ? 'Remove section' : 'Keep at least one section'}
                      disabled={definition.sections.length <= 1}
                      onClick={() => edit((draft) => {
                        draft.sections.splice(sectionIndex, 1);
                      })}
                    />
                  </Box>

                  <Stack spacing={1} sx={{ p: 1.25, bgcolor: dutyColors.card }}>
                    {section.checks.map((check, checkIndex) => (
                      <CheckEditorRow
                        key={check.id}
                        check={check}
                        index={checkIndex}
                        wide={wide}
                        autoFocus={focusCheckId === check.id}
                        canRemove={section.checks.length > 1}
                        canMoveUp={checkIndex > 0}
                        canMoveDown={checkIndex < section.checks.length - 1}
                        onPatch={(patch) => edit((draft) => {
                          Object.assign(draft.sections[sectionIndex].checks[checkIndex], patch);
                        })}
                        onEnter={() => insertCheckAfter(sectionIndex, checkIndex)}
                        onMove={(delta) => edit((draft) => {
                          const rows = draft.sections[sectionIndex].checks;
                          const [row] = rows.splice(checkIndex, 1);
                          rows.splice(checkIndex + delta, 0, row);
                        })}
                        onRemove={() => edit((draft) => {
                          draft.sections[sectionIndex].checks.splice(checkIndex, 1);
                        })}
                      />
                    ))}
                    <DashedButton
                      label="Add check  ·  or press Enter in a check"
                      onClick={() => insertCheckAfter(sectionIndex, section.checks.length - 1)}
                    />
                  </Stack>
                </Box>
              ))}
              <DashedButton
                label="Add section"
                onClick={() => edit((draft) => {
                  const stamp = Date.now();
                  draft.sections.push({
                    id: `section-${stamp}`,
                    title: 'New section',
                    checks: [{
                      id: `check-${stamp}`,
                      label: '',
                      control: 'pass_fail',
                      hint: '',
                      hint_es: '',
                      label_es: '',
                      unit: '',
                      critical: false,
                      verify_prev: false,
                    }],
                  });
                })}
              />
            </Stack>
            )}
          </FormSection>
        </Box>
      </Box>

      <RoutineJsonDialog
        open={jsonOpen}
        current={currentDoc}
        context={briefContext}
        onClose={() => setJsonOpen(false)}
        onApply={applyDoc}
      />
    </Box>
  );
}

function CheckEditorRow({
  check,
  index,
  wide,
  autoFocus,
  canRemove,
  canMoveUp,
  canMoveDown,
  onPatch,
  onEnter,
  onMove,
  onRemove,
}: {
  check: RoutineCheckDef;
  index: number;
  wide: boolean;
  autoFocus?: boolean;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPatch: (patch: Partial<RoutineCheckDef>) => void;
  onEnter: () => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const arrow = (up: boolean) => {
    const enabled = up ? canMoveUp : canMoveDown;
    return (
      <Box
        component="button"
        type="button"
        aria-label={up ? 'Move up' : 'Move down'}
        disabled={!enabled}
        onClick={() => onMove(up ? -1 : 1)}
        sx={{
          width: 24,
          height: 16,
          p: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          bgcolor: 'transparent',
          cursor: enabled ? 'pointer' : 'default',
          color: enabled ? dutyColors.ink40 : dutyColors.ink08,
          '&:hover': { color: enabled ? dutyColors.ink : dutyColors.ink08 },
        }}
      >
        {up ? <KeyboardArrowUpRounded sx={{ fontSize: 18 }} /> : <KeyboardArrowDownRounded sx={{ fontSize: 18 }} />}
      </Box>
    );
  };

  return (
    <>
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: wide ? CHECK_COLUMNS_WIDE : CHECK_COLUMNS_NARROW,
        gridTemplateAreas: wide ? CHECK_AREAS_WIDE : CHECK_AREAS_NARROW,
        gap: 1,
        alignItems: 'center',
        px: 1,
        py: 1,
        borderRadius: '10px',
        bgcolor: '#FCFCFA',
        border: `1px solid ${dutyColors.ink08}`,
        '&:focus-within': { borderColor: 'rgba(46,125,50,0.35)', bgcolor: dutyColors.card },
      }}
    >
      <Box
        sx={{
          gridArea: 'move',
          alignSelf: 'stretch',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
        }}
      >
        {arrow(true)}
        {arrow(false)}
      </Box>
      <TextField
        value={check.label}
        onChange={(e) => onPatch({ label: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter();
          }
        }}
        autoFocus={autoFocus}
        placeholder={`Check ${index + 1}`}
        label={wide ? undefined : `Check ${index + 1}`}
        size="small"
        fullWidth
        sx={{ ...fieldSx, gridArea: 'label' }}
      />
      <TextField
        value={check.hint || ''}
        onChange={(e) => onPatch({ hint: e.target.value })}
        placeholder={wide ? 'Hint (optional)' : 'Optional'}
        label={wide ? undefined : 'Hint'}
        size="small"
        fullWidth
        sx={{ ...fieldSx, gridArea: 'hint' }}
      />
      <TextField
        select
        value={check.control}
        onChange={(e) => onPatch({ control: e.target.value as RoutineControl })}
        label={wide ? undefined : 'Answer'}
        size="small"
        fullWidth
        sx={{ ...fieldSx, gridArea: 'answer' }}
      >
        {(Object.keys(CONTROL_LABELS) as RoutineControl[]).map((value) => (
          <MenuItem key={value} value={value}>{CONTROL_LABELS[value]}</MenuItem>
        ))}
      </TextField>
      <TextField
        value={check.unit || ''}
        onChange={(e) => onPatch({ unit: e.target.value })}
        disabled={check.control !== 'number'}
        placeholder={check.control === 'number' ? 'Unit' : '-'}
        label={wide ? undefined : 'Unit'}
        size="small"
        fullWidth
        sx={{ ...fieldSx, gridArea: 'unit' }}
      />
      <Box sx={{ gridArea: 'crit', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Tooltip title={check.critical ? 'Critical - one fail fails the run' : 'Mark critical'}>
          <Box
            component="button"
            type="button"
            aria-label="Toggle critical"
            aria-pressed={Boolean(check.critical)}
            onClick={() => onPatch({ critical: !check.critical })}
            sx={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRadius: '9px',
              border: `1.5px solid ${check.critical ? dutyColors.red : dutyColors.ink15}`,
              bgcolor: check.critical ? dutyColors.red : dutyColors.card,
              color: check.critical ? '#fff' : dutyColors.ink40,
              '&:hover': { borderColor: check.critical ? dutyColors.red : dutyColors.ink40 },
            }}
          >
            <PriorityHighRounded sx={{ fontSize: 18 }} />
          </Box>
        </Tooltip>
      </Box>
      <Box sx={{ gridArea: 'del', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <IconAction
          label={canRemove ? 'Remove check' : 'Keep at least one check'}
          disabled={!canRemove}
          onClick={onRemove}
        />
      </Box>
    </Box>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr auto' }, gap: 1, mt: 1, px: 1 }}>
      <TextField
        value={check.label_es || ''}
        onChange={(e) => onPatch({ label_es: e.target.value })}
        placeholder="Spanish label"
        size="small"
        fullWidth
        sx={fieldSx}
      />
      <TextField
        value={check.hint_es || ''}
        onChange={(e) => onPatch({ hint_es: e.target.value })}
        placeholder="Spanish hint"
        size="small"
        fullWidth
        sx={fieldSx}
      />
      <Button
        size="small"
        variant={check.verify_prev ? 'contained' : 'outlined'}
        onClick={() => onPatch({ verify_prev: !check.verify_prev })}
        sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
      >
        Next shift confirms
      </Button>
    </Box>
    </>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip title={label}>
      <span>
        <IconButton
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          sx={{
            width: 36,
            height: 36,
            borderRadius: '9px',
            color: dutyColors.ink40,
            '&:hover': { color: dutyColors.red, bgcolor: 'rgba(192,48,28,0.06)' },
          }}
        >
          <DeleteOutline sx={{ fontSize: 19 }} />
        </IconButton>
      </span>
    </Tooltip>
  );
}
