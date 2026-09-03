import { Box, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { format } from 'date-fns';
import type {
  Routine,
  RoutineAssignee,
  RoutineAudienceType,
  RoutineExpireRule,
  RoutineExpireUnit,
  RoutineLateAfter,
} from '../../api/routines.api';
import { dutyColors } from '../../components/duty/tokens';
import { SHIFT_OPTIONS } from '../../i18n/routines';
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
export const AUDIENCE_TYPES: RoutineAudienceType[] = ['person', 'shift', 'department'];
const AUDIENCE_TYPE_LABELS: Record<RoutineAudienceType, string> = {
  person: 'Person',
  shift: 'Shift',
  department: 'Department',
};

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
  expireRule: RoutineExpireRule;
  expireCount: string;
  expireUnit: RoutineExpireUnit;
  /** HH:mm. Hours start at; blank is midnight. */
  expireFromTime: string;
  assignment: string;
  audienceType: RoutineAudienceType;
  audienceAll: boolean;
  assignedShifts: string[];
  assignedDepartmentIds: number[];
  assignedUserIds: number[];
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
    expireRule: 'never',
    expireCount: '1',
    expireUnit: 'hours',
    expireFromTime: '',
    assignment: 'pooled',
    audienceType: 'person',
    audienceAll: true,
    assignedShifts: [],
    assignedDepartmentIds: [],
    assignedUserIds: [],
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
    expireRule: routine.expire_rule,
    expireCount: String(routine.expire_count || 1),
    expireUnit: routine.expire_unit,
    expireFromTime: (routine.expire_from_time || '').slice(0, 5),
    assignment: routine.assignment,
    audienceType: routine.audience_type,
    audienceAll: routine.audience_all,
    assignedShifts: routine.assigned_shifts || [],
    assignedDepartmentIds: routine.assigned_department_ids?.length
      ? routine.assigned_department_ids
      : (routine.assigned_department ? [routine.assigned_department] : []),
    assignedUserIds: routine.assigned_user_ids || [],
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
    expire_rule: settings.expireRule,
    expire_count: Math.max(Number(settings.expireCount) || 1, 1),
    expire_unit: settings.expireUnit,
    expire_from_time: settings.expireFromTime ? `${settings.expireFromTime}:00` : null,
    audience_all: settings.audienceAll,
    assigned_shifts: settings.assignedShifts,
    assigned_department_ids: settings.assignedDepartmentIds,
    assigned_department: settings.assignedDepartmentIds[0] ?? null,
    assigned_user_ids: settings.assignedUserIds,
    is_blocking: settings.isBlocking,
  };
  if (!opts?.locked) {
    payload.trigger = settings.trigger as Routine['trigger'];
    payload.assignment = settings.assignment as Routine['assignment'];
    payload.audience_type = settings.audienceType;
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
          <TextField
            select
            label="Missed if not done"
            value={value.expireRule}
            onChange={(e) => onChange({ expireRule: e.target.value as RoutineExpireRule })}
            size="small"
            fullWidth
            helperText="After this, the run is Missed and cannot be filled. Counts as late is only the grade."
            sx={fieldSx}
          >
            <MenuItem value="never">Never (can still fill it late)</MenuItem>
            <MenuItem value="end_of_day">End of that day</MenuItem>
            <MenuItem value="end_of_week">End of that week</MenuItem>
            <MenuItem value="after">After a duration</MenuItem>
          </TextField>
          <TextField
            label="After count"
            type="number"
            value={value.expireCount}
            onChange={(e) => onChange({ expireCount: e.target.value })}
            size="small"
            fullWidth
            disabled={value.expireRule !== 'after'}
            inputProps={{ min: 1, max: 99 }}
            helperText={value.expireRule === 'after'
              ? 'How many hours, days, weeks, or months.'
              : 'Used only by After a duration.'}
            sx={fieldSx}
          />
          <TextField
            select
            label="After unit"
            value={value.expireUnit}
            onChange={(e) => onChange({ expireUnit: e.target.value as RoutineExpireUnit })}
            size="small"
            fullWidth
            disabled={value.expireRule !== 'after'}
            helperText={value.expireRule === 'after'
              ? 'Hours start at the time below. Days start at the end of the due day.'
              : 'Used only by After a duration.'}
            sx={fieldSx}
          >
            <MenuItem value="hours">Hours</MenuItem>
            <MenuItem value="days">Days</MenuItem>
            <MenuItem value="weeks">Weeks</MenuItem>
            <MenuItem value="months">Months</MenuItem>
          </TextField>
          <TextField
            label="Hours start at"
            type="time"
            value={value.expireFromTime}
            onChange={(e) => onChange({ expireFromTime: e.target.value })}
            size="small"
            fullWidth
            disabled={value.expireRule !== 'after' || value.expireUnit !== 'hours'}
            InputLabelProps={{ shrink: true }}
            helperText={value.expireRule === 'after' && value.expireUnit === 'hours'
              ? 'Blank is midnight of the due day.'
              : 'Used only when the duration is hours.'}
            sx={fieldSx}
          />
        </FieldGrid>
      </FormSection>

      <FormSection
        wide={wide}
        title="Owner"
        description="Who the run is for: people, a shift, or a department. One shared is one run. Each gives everyone their own."
      >
        <FieldGrid wide={wide}>
          <TextField
            select
            label="Type"
            value={value.audienceType}
            onChange={(e) => onChange({ audienceType: e.target.value as RoutineAudienceType })}
            fullWidth
            size="small"
            disabled={locked}
            helperText={locked
              ? 'Program routines keep the type they shipped with.'
              : 'Person is standing. Shift follows the punch. Department is home department.'}
            sx={fieldSx}
          >
            {AUDIENCE_TYPES.map((kind) => (
              <MenuItem key={kind} value={kind}>{AUDIENCE_TYPE_LABELS[kind]}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Share"
            value={value.assignment}
            onChange={(e) => onChange({ assignment: e.target.value })}
            fullWidth
            size="small"
            disabled={locked}
            helperText={locked
              ? 'Program routines keep one shared or each as seeded.'
              : value.audienceType === 'shift'
                ? 'One shared: anyone on that punch. Each: everyone currently on it.'
                : 'One shared: anyone matching can fill it. Each: everyone matching owes their own.'}
            sx={fieldSx}
          >
            <MenuItem value="pooled">One shared</MenuItem>
            <MenuItem value="per_person">Each</MenuItem>
          </TextField>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Toggle
              label={value.audienceType === 'shift'
                ? 'All shifts'
                : value.audienceType === 'department'
                  ? 'All departments'
                  : 'All staff'}
              hint={value.audienceType === 'shift'
                ? 'Anyone clocked into any shift. Clocked out hides this routine.'
                : value.audienceType === 'department'
                  ? 'Anyone whose home department is set.'
                  : 'Every Employee, Manager, and Admin.'}
              checked={value.audienceAll}
              disabled={locked}
              onChange={(audienceAll) => onChange({ audienceAll })}
            />
          </Box>
          <TextField
            select
            SelectProps={{ multiple: true }}
            label="Who"
            value={
              value.audienceType === 'shift'
                ? value.assignedShifts
                : value.audienceType === 'department'
                  ? value.assignedDepartmentIds
                  : value.assignedUserIds
            }
            onChange={(e) => {
              const raw = e.target.value as unknown as Array<string | number>;
              if (value.audienceType === 'shift') {
                onChange({ assignedShifts: raw.map(String) });
              } else if (value.audienceType === 'department') {
                onChange({ assignedDepartmentIds: raw.map(Number) });
              } else {
                onChange({ assignedUserIds: raw.map(Number) });
              }
            }}
            fullWidth
            size="small"
            disabled={locked || value.audienceAll}
            helperText={value.audienceAll
              ? 'Used only when All is off.'
              : value.audienceType === 'shift'
                ? 'The clock-in tiles. Clocked out hides this routine.'
                : value.audienceType === 'department'
                  ? 'Standing HR department, not today\'s punch.'
                  : 'Named people only.'}
            sx={fieldSx}
          >
            {value.audienceType === 'shift'
              ? SHIFT_OPTIONS.map((row) => (
                <MenuItem key={row.key} value={row.key}>{row.en}</MenuItem>
              ))
              : value.audienceType === 'department'
                ? departments.map((dept) => (
                  <MenuItem key={dept.id} value={dept.id}>{dept.name}</MenuItem>
                ))
                : people.map((row) => (
                  <MenuItem key={row.id} value={row.id}>{row.full_name}</MenuItem>
                ))}
          </TextField>
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
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tone?: 'brand' | 'violet';
  disabled?: boolean;
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
      <Switch checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </Box>
  );
}
