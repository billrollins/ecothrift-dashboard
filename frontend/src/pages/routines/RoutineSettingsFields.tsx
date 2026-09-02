import { Box, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { format } from 'date-fns';
import type { Routine, RoutineAssignee, RoutineLateAfter } from '../../api/routines.api';
import { dutyColors } from '../../components/duty/tokens';
import { FieldGrid, FormSection, fieldSx, titleFieldSx } from './editorStyles';
import { biweeklyMaxDate, nextBiweeklyDate } from './nextBiweeklyDate';

export const TRIGGER_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  on_demand: 'On demand',
};
const TRIGGERS = Object.keys(TRIGGER_LABELS);
export const ROLE_OPTIONS = ['Staff', 'Employee', 'Manager', 'Admin'];

/**
 * Everything about a routine except its checklist, in the shape the form
 * holds it. The Catalog editor and Admin's quick edit both fill these fields.
 */
export interface RoutineSettings {
  title: string;
  intro: string;
  trigger: string;
  /** HH:mm. Soft nag; blank starts at the top of the day. */
  remindTime: string;
  /** HH:mm. Hard nag; blank means the nag waits for clock-out. */
  dueTime: string;
  /** Blank `dueTime` is a deliberate choice, so the form holds it separately. */
  dueAtClockOut: boolean;
  lateAfter: RoutineLateAfter;
  /** yyyy-MM-dd; only sent for bi-weekly. */
  nextDue: string;
  graceDays: string;
  assignment: string;
  assignedRole: string;
  assignedDepartment: number | '';
  assignedUserIds: number[];
  /** One subject per line. */
  subjectPool: string;
  isBlocking: boolean;
}

export function defaultRoutineSettings(today: Date): RoutineSettings {
  return {
    title: '',
    intro: '',
    trigger: 'daily',
    remindTime: '',
    dueTime: '17:00',
    dueAtClockOut: false,
    lateAfter: 'end_of_day',
    nextDue: format(today, 'yyyy-MM-dd'),
    graceDays: '0',
    assignment: 'pooled',
    assignedRole: 'Staff',
    assignedDepartment: '',
    assignedUserIds: [],
    subjectPool: '',
    isBlocking: false,
  };
}

export function settingsFromRoutine(routine: Routine, today: Date): RoutineSettings {
  return {
    title: routine.title,
    intro: routine.intro,
    trigger: routine.trigger,
    remindTime: (routine.remind_time || '').slice(0, 5),
    dueTime: (routine.due_time || '17:00:00').slice(0, 5),
    dueAtClockOut: routine.due_time == null,
    lateAfter: routine.late_after,
    nextDue: nextBiweeklyDate(routine.anchor_date, today),
    graceDays: String(routine.grace_days),
    assignment: routine.assignment,
    assignedRole: routine.assigned_role || 'Staff',
    assignedDepartment: routine.assigned_department ?? '',
    assignedUserIds: routine.assigned_user_ids || [],
    subjectPool: (routine.subject_pool || []).join('\n'),
    isBlocking: routine.is_blocking,
  };
}

/** The API fields these settings stand for. Checklist and active flag are the caller's. */
export function settingsToPayload(
  settings: RoutineSettings,
  opts?: { locked?: boolean },
): Partial<Routine> {
  const payload: Partial<Routine> = {
    title: settings.title,
    intro: settings.intro,
    remind_time: settings.remindTime ? `${settings.remindTime}:00` : null,
    due_time: settings.dueAtClockOut ? null : `${settings.dueTime}:00`,
    late_after: settings.lateAfter,
    anchor_date: settings.trigger === 'biweekly' ? settings.nextDue : null,
    grace_days: Number(settings.graceDays) || 0,
    assigned_role: settings.assignedRole,
    assigned_department: settings.assignedDepartment === '' ? null : settings.assignedDepartment,
    assigned_user_ids: settings.assignedUserIds,
    subject_pool: settings.subjectPool.split('\n').map((row) => row.trim()).filter(Boolean),
    is_blocking: settings.isBlocking,
  };
  if (!opts?.locked) {
    payload.trigger = settings.trigger as Routine['trigger'];
    payload.assignment = settings.assignment as Routine['assignment'];
  }
  return payload;
}

export function sameSettings(a: RoutineSettings, b: RoutineSettings): boolean {
  return JSON.stringify(settingsToPayload(a)) === JSON.stringify(settingsToPayload(b));
}

/**
 * Name, Schedule, and Owner bands. Whoever renders this owns the state; the
 * bands only report edits, so the editor's AI import and Admin's per-row
 * reset can both replace the whole value.
 */
export function RoutineSettingsFields({
  value,
  onChange,
  wide,
  departments,
  people,
  autoFocusTitle,
  locked,
}: {
  value: RoutineSettings;
  onChange: (patch: Partial<RoutineSettings>) => void;
  wide: boolean;
  departments: Array<{ id: number; name: string }>;
  people: RoutineAssignee[];
  autoFocusTitle?: boolean;
  /** Program routines: repeats and assignment stay as seeded. */
  locked?: boolean;
}) {
  const today = new Date();
  const biweekly = value.trigger === 'biweekly';
  return (
    <>
      <FormSection
        first
        wide={wide}
        title="Name"
        description="What staff see at the top of the phone."
      >
        <Stack spacing={1.75}>
          <TextField
            value={value.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Retail opening checklist"
            fullWidth
            autoFocus={autoFocusTitle}
            sx={titleFieldSx}
          />
          <TextField
            value={value.intro}
            onChange={(e) => onChange({ intro: e.target.value })}
            placeholder="One line of context"
            fullWidth
            size="small"
            sx={fieldSx}
          />
        </Stack>
      </FormSection>

      <FormSection
        wide={wide}
        title="Schedule"
        description="The run sits on the list all day. Three moments decide how loud it gets: a soft badge, a hard app-bar nag, then the deadline that counts against the day."
      >
        <FieldGrid wide={wide}>
          <TextField
            select
            label="Repeats"
            value={value.trigger}
            onChange={(e) => onChange({ trigger: e.target.value })}
            fullWidth
            size="small"
            disabled={locked}
            helperText={locked ? 'Program routines keep the repeat they shipped with.' : undefined}
            sx={fieldSx}
          >
            {TRIGGERS.map((trigger) => (
              <MenuItem key={trigger} value={trigger}>{TRIGGER_LABELS[trigger]}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Next due"
            type="date"
            value={value.nextDue}
            onChange={(e) => onChange({ nextDue: e.target.value })}
            fullWidth
            size="small"
            disabled={!biweekly}
            helperText={biweekly ? 'Repeats every 14 days from here.' : 'Bi-weekly only.'}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: format(today, 'yyyy-MM-dd'), max: biweeklyMaxDate(today) }}
            sx={fieldSx}
          />
          <TextField
            label="Remind at"
            type="time"
            value={value.remindTime}
            onChange={(e) => onChange({ remindTime: e.target.value })}
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
            helperText="Soft: a badge on the Routines link. Blank starts at the top of the day."
            sx={fieldSx}
          />
          <TextField
            label="Hard nag at"
            type="time"
            value={value.dueTime}
            onChange={(e) => onChange({ dueTime: e.target.value })}
            size="small"
            fullWidth
            disabled={value.dueAtClockOut}
            InputLabelProps={{ shrink: true }}
            helperText={value.dueAtClockOut
              ? 'The time clock asks for it on the way out.'
              : 'The app-bar alert. Nothing else interrupts anyone.'}
            sx={fieldSx}
          />
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Toggle
              label="Nag at clock-out instead"
              hint="For work that has all day: the alert waits until someone tries to leave."
              checked={value.dueAtClockOut}
              onChange={(dueAtClockOut) => onChange({ dueAtClockOut })}
            />
          </Box>
          <TextField
            select
            label="Counts as late"
            value={value.lateAfter}
            onChange={(e) => onChange({ lateAfter: e.target.value as RoutineLateAfter })}
            size="small"
            fullWidth
            helperText="When the run starts costing the day its score."
            sx={fieldSx}
          >
            <MenuItem value="due_time">As soon as the hard nag starts</MenuItem>
            <MenuItem value="end_of_day">End of the day it was due</MenuItem>
            <MenuItem value="grace_days">After the grace days</MenuItem>
          </TextField>
          <TextField
            label="Grace days"
            type="number"
            value={value.graceDays}
            onChange={(e) => onChange({ graceDays: e.target.value })}
            size="small"
            fullWidth
            disabled={value.lateAfter !== 'grace_days'}
            inputProps={{ min: 0, max: 30 }}
            helperText={value.lateAfter === 'grace_days'
              ? 'Days after the hard nag before it counts as late.'
              : 'Used only by the grace-days rule.'}
            sx={fieldSx}
          />
        </FieldGrid>
      </FormSection>

      <FormSection
        wide={wide}
        title="Owner"
        description="Named people win over role and department."
      >
        <FieldGrid wide={wide}>
          <TextField
            select
            label="Assignment"
            value={value.assignment}
            onChange={(e) => onChange({ assignment: e.target.value })}
            fullWidth
            size="small"
            disabled={locked}
            helperText={locked
              ? 'Program routines keep pooled or per person as seeded.'
              : 'Pooled shares one run. Per person gives everyone their own.'}
            sx={fieldSx}
          >
            <MenuItem value="pooled">Pooled</MenuItem>
            <MenuItem value="per_person">Per person</MenuItem>
          </TextField>
          <TextField
            select
            label="Role"
            value={value.assignedRole}
            onChange={(e) => onChange({ assignedRole: e.target.value })}
            size="small"
            fullWidth
            sx={fieldSx}
          >
            {ROLE_OPTIONS.map((role) => (
              <MenuItem key={role} value={role}>{role}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Department"
            value={value.assignedDepartment}
            onChange={(e) => onChange({ assignedDepartment: e.target.value === '' ? '' : Number(e.target.value) })}
            size="small"
            fullWidth
            sx={fieldSx}
          >
            <MenuItem value="">None</MenuItem>
            {departments.map((dept) => (
              <MenuItem key={dept.id} value={dept.id}>{dept.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            SelectProps={{ multiple: true }}
            label="People"
            value={value.assignedUserIds}
            onChange={(e) => onChange({ assignedUserIds: e.target.value as unknown as number[] })}
            fullWidth
            size="small"
            sx={fieldSx}
          >
            {people.map((row) => (
              <MenuItem key={row.id} value={row.id}>{row.full_name}</MenuItem>
            ))}
          </TextField>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <TextField
              label="Subject pool"
              value={value.subjectPool}
              onChange={(e) => onChange({ subjectPool: e.target.value })}
              multiline
              minRows={2}
              fullWidth
              size="small"
              helperText="One area per line. Each run draws one."
              sx={fieldSx}
            />
          </Box>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Toggle
              label="Blocking"
              hint="Pins at the top of everyone's list and cannot be dismissed."
              tone="violet"
              checked={value.isBlocking}
              onChange={(isBlocking) => onChange({ isBlocking })}
            />
          </Box>
        </FieldGrid>
      </FormSection>
    </>
  );
}

/** A switch that reads as a setting, not a stray control: name, consequence, state. */
function Toggle({
  label,
  hint,
  checked,
  onChange,
  tone = 'brand',
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tone?: 'brand' | 'violet';
}) {
  const on = tone === 'violet'
    ? { border: dutyColors.violet, bg: '#F3EEFA' }
    : { border: dutyColors.brand, bg: dutyColors.brandTint };
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        px: 1.75,
        py: 1,
        borderRadius: '10px',
        border: `1px solid ${checked ? on.border : dutyColors.ink15}`,
        bgcolor: checked ? on.bg : dutyColors.card,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: dutyColors.ink }}>{label}</Typography>
        <Typography sx={{ fontSize: 11.5, color: dutyColors.ink60 }}>{hint}</Typography>
      </Box>
      <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </Box>
  );
}
