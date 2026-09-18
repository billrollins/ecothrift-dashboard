import {
  Box,
  Button,
  FormControl,
  InputLabel,
  Menu,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { DEFAULT_PROGRAM_DEPARTMENT_SLUG, getDepartments, mergeCurrentDepartments, programDepartmentSlug, type RosterAssignment, type RosterShift } from '../../../api/hr.api';
import { getSettings } from '../../../api/core.api';
import { dutyColors } from '../../../components/duty/tokens';
import { useRoutineAssignees } from '../../../hooks/useRoutines';
import {
  useDeleteRosterAssignment,
  useDeleteRosterShift,
  useRosterAssignments,
  useRosterShifts,
  useSaveRosterAssignment,
  useSaveRosterShift,
} from '../../../hooks/useRetailQa';
import {
  ALL_DAYS,
  DAY_LABELS,
  LAST_DEPT_KEY,
  asTime,
  byPersonName,
  hhmm,
  normalizeHhmm,
  personDays,
  sectionCountLabel,
  shiftDays,
  shiftSortKey,
  sortByPersonName,
} from './shiftsLayout';
import { DayChip, ShiftCard } from './ShiftCard';

type Draft = {
  name: string;
  department: number | '';
  timeIn: string;
  timeOut: string;
  weekdays: number[];
};

type Touched = {
  name?: boolean;
  weekdays?: boolean;
  department?: boolean;
};

type DeptRow = { id: number; name: string; slug: string };
type DeptGroup = { department: string; slug: string; shifts: RosterShift[] };

const EMPTY: Draft = {
  name: '',
  department: '',
  timeIn: '09:00',
  timeOut: '17:00',
  weekdays: [0, 1, 2, 3, 4],
};

function applyDepartment(draft: Draft, department: number | ''): Draft {
  return { ...draft, department };
}

function rememberDepartment(id: number) {
  sessionStorage.setItem(LAST_DEPT_KEY, String(id));
}

function canSaveDraft(draft: Draft) {
  return Boolean(draft.name.trim() && draft.department !== '' && draft.weekdays.length);
}

function isProgramDept(slug: string, programSlug: string) {
  return slug === programSlug;
}

export function ShiftsPanel() {
  const { enqueueSnackbar } = useSnackbar();
  const shifts = useRosterShifts();
  const assignments = useRosterAssignments();
  const departments = useQuery({
    queryKey: ['hr', 'departments'],
    queryFn: async () => (await getDepartments()).data,
  });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await getSettings()).data,
  });
  const programSlug = programDepartmentSlug(settings.data) || DEFAULT_PROGRAM_DEPARTMENT_SLUG;
  const people = useRoutineAssignees();
  const saveShift = useSaveRosterShift();
  const removeShift = useDeleteRosterShift();
  const saveAssign = useSaveRosterAssignment();
  const removeAssign = useDeleteRosterAssignment();

  const deptList = mergeCurrentDepartments(
    departments.data ?? [],
    (shifts.data ?? []).map((shift) => ({
      id: shift.department,
      name: shift.department_name,
    })),
  );

  const [view, setView] = useState<'shift' | 'day'>('shift');
  const [formOpen, setFormOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<Draft>(EMPTY);
  const [createTouched, setCreateTouched] = useState<Touched>({});
  const [pendingRemove, setPendingRemove] = useState<{ shift: RosterShift; count: number } | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<RosterShift | null>(null);
  const [menu, setMenu] = useState<{ shift: RosterShift; anchor: HTMLElement } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!deptList.length) return;
    setCreateDraft((prev) => {
      if (prev.department !== '' && deptList.some((row) => row.id === prev.department)) return prev;
      const only = deptList.length === 1 ? deptList[0].id : '';
      const stored = Number(sessionStorage.getItem(LAST_DEPT_KEY));
      const next = only || (deptList.some((row) => row.id === stored) ? stored : '');
      if (next === '' || next === prev.department) return prev;
      return applyDepartment(prev, next);
    });
  }, [deptList]);

  useEffect(() => {
    if (formOpen) nameRef.current?.focus();
  }, [formOpen]);

  const grouped = useMemo(() => {
    const rows = [...(shifts.data ?? [])].sort((a, b) => {
      const dept = (a.department_sort ?? 99) - (b.department_sort ?? 99);
      if (dept) return dept;
      const byName = a.department_name.localeCompare(b.department_name);
      if (byName) return byName;
      const [ap, at, an] = shiftSortKey(a);
      const [bp, bt, bn] = shiftSortKey(b);
      return ap - bp || at.localeCompare(bt) || an.localeCompare(bn);
    });
    const groups: DeptGroup[] = [];
    for (const shift of rows) {
      const last = groups[groups.length - 1];
      const slug = shift.department_slug || '';
      if (last && last.slug === slug) last.shifts.push(shift);
      else groups.push({ department: shift.department_name, slug, shifts: [shift] });
    }
    return groups;
  }, [shifts.data]);

  const leftGroups = grouped.filter((group) => isProgramDept(group.slug, programSlug));
  const rightGroups = grouped.filter((group) => !isProgramDept(group.slug, programSlug));
  const allAssignments = assignments.data ?? [];

  async function saveNew(draft: Draft, after?: () => void) {
    if (!canSaveDraft(draft)) return;
    try {
      await saveShift.mutateAsync({
        data: {
          name: draft.name.trim(),
          department: draft.department === '' ? undefined : draft.department,
          time_in: asTime(draft.timeIn),
          time_out: asTime(draft.timeOut),
          weekdays: draft.weekdays,
          is_active: true,
        },
      });
      if (draft.department !== '') rememberDepartment(draft.department);
      after?.();
    } catch {
      enqueueSnackbar('Could not save that shift', { variant: 'error' });
    }
  }

  async function patchShift(shift: RosterShift, patch: {
    name?: string;
    timeIn?: string;
    timeOut?: string;
    weekdays?: number[];
  }) {
    const name = (patch.name ?? shift.name).trim();
    const timeIn = patch.timeIn ?? hhmm(shift.time_in);
    const timeOut = patch.timeOut ?? hhmm(shift.time_out);
    const weekdays = patch.weekdays ?? shiftDays(shift);
    if (!name || !weekdays.length) return;
    if (
      name === shift.name
      && timeIn === hhmm(shift.time_in)
      && timeOut === hhmm(shift.time_out)
      && weekdays.length === shiftDays(shift).length
      && weekdays.every((day, index) => day === shiftDays(shift)[index])
    ) return;
    try {
      await saveShift.mutateAsync({
        id: shift.id,
        data: {
          name,
          department: shift.department,
          time_in: asTime(timeIn),
          time_out: asTime(timeOut),
          weekdays,
          is_active: shift.is_active,
        },
      });
    } catch {
      enqueueSnackbar('Could not save that shift', { variant: 'error' });
    }
  }

  async function setShiftActive(shift: RosterShift, isActive: boolean) {
    try {
      await saveShift.mutateAsync({
        id: shift.id,
        data: { is_active: isActive },
      });
    } catch {
      enqueueSnackbar('Could not update that shift', { variant: 'error' });
    }
  }

  async function toggleShiftDay(shift: RosterShift, day: number) {
    if (saveShift.isPending) return;
    const current = shiftDays(shift);
    const next = current.includes(day)
      ? current.filter((item) => item !== day)
      : [...current, day].sort((a, b) => a - b);
    if (!next.length) {
      enqueueSnackbar('A shift needs at least one day', { variant: 'info' });
      return;
    }
    await patchShift(shift, { weekdays: next });
  }

  async function togglePersonDay(row: RosterAssignment, shift: RosterShift, day: number) {
    if (saveAssign.isPending) return;
    if (!shiftDays(shift).includes(day)) return;
    const current = personDays(row, shift);
    const next = current.includes(day)
      ? current.filter((item) => item !== day)
      : [...current, day].sort((a, b) => a - b);
    try {
      await saveAssign.mutateAsync({ id: row.id, data: { weekdays: next } });
    } catch {
      enqueueSnackbar('Could not update those days', { variant: 'error' });
    }
  }

  const remainingFor = (shift: RosterShift) => sortByPersonName(
    (people.data ?? []).filter((person) => (
      !allAssignments.some((row) => row.shift === shift.id && row.employee === person.id)
    )),
    (person) => person.full_name,
  );

  function renderGroup(group: DeptGroup) {
    const personIds = new Set(
      allAssignments
        .filter((row) => group.shifts.some((shift) => shift.id === row.shift))
        .map((row) => row.employee),
    );
    return (
      <Box key={group.department}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 1,
            mt: 2.5,
            mb: 1,
            px: 2,
          }}
        >
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 'normal',
              textTransform: 'uppercase',
              color: dutyColors.ink40,
            }}
          >
            {group.department}
          </Typography>
          <Typography sx={{ fontSize: 12, color: dutyColors.ink40 }}>
            {sectionCountLabel(group.shifts.length, personIds.size)}
          </Typography>
        </Box>
        {group.shifts.map((shift) => {
          const assigned = sortByPersonName(
            allAssignments.filter((row) => row.shift === shift.id),
            (row) => row.employee_name,
          );
          return (
            <ShiftCard
              key={shift.id}
              shift={shift}
              assigned={assigned}
              onPatch={(patch) => void patchShift(shift, patch)}
              onToggleShiftDay={(day) => void toggleShiftDay(shift, day)}
              onMenu={(anchor) => {
                rememberDepartment(shift.department);
                setMenu({ shift, anchor });
              }}
              onToggleDay={(row, day) => void togglePersonDay(row, shift, day)}
              onUnassign={(id) => void removeAssign.mutateAsync(id)}
            />
          );
        })}
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 40 }}>
        <Typography sx={{ fontSize: 20, fontWeight: 750, flex: 1 }}>Shifts</Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={view}
          onChange={(_, next) => {
            if (!next) return;
            setView(next);
            if (next === 'day') setFormOpen(false);
          }}
        >
          <ToggleButton value="shift" sx={{ textTransform: 'none', px: 1.25, py: 0.25, fontSize: 13 }}>
            By shift
          </ToggleButton>
          <ToggleButton value="day" sx={{ textTransform: 'none', px: 1.25, py: 0.25, fontSize: 13 }}>
            By day
          </ToggleButton>
        </ToggleButtonGroup>
        <Button
          variant="contained"
          onClick={() => {
            setFormOpen((open) => !open);
            setView('shift');
          }}
        >
          + New shift
        </Button>
      </Box>
      <Typography sx={{ fontSize: 13, color: dutyColors.ink60, mt: 0.5, mb: formOpen ? 1.5 : 0 }}>
        Who should be in, which days, and when. Clock-in and the Command Center read these rows.
      </Typography>

      {formOpen ? (
        <Box
          component="form"
          sx={{ mb: 1 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSaveDraft(createDraft)) {
              setCreateTouched({ name: true, weekdays: true, department: true });
              return;
            }
            void saveNew(createDraft, () => {
              setCreateDraft(applyDepartment({ ...EMPTY }, createDraft.department));
              setCreateTouched({});
              setFormOpen(false);
            });
          }}
        >
          <ShiftFields
            draft={createDraft}
            departments={deptList}
            touched={createTouched}
            nameRef={nameRef}
            submitLabel="Add"
            onTouched={(next) => setCreateTouched((prev) => ({ ...prev, ...next }))}
            onChange={setCreateDraft}
            onCancel={() => {
              setFormOpen(false);
              setCreateTouched({});
            }}
          />
        </Box>
      ) : null}

      {view === 'day' ? (
        <ByDayGrid groups={grouped} assignments={allAssignments} />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 1px minmax(0,1fr)' },
            alignItems: 'start',
          }}
        >
          <Box sx={{ pr: { lg: 3.5 } }}>
            {leftGroups.map(renderGroup)}
          </Box>
          <Box
            sx={{
              display: { xs: 'none', lg: 'block' },
              alignSelf: 'stretch',
              minHeight: 280,
              width: '1px',
              bgcolor: dutyColors.ink15,
            }}
          />
          <Box sx={{ pl: { lg: 3.5 } }}>
            {rightGroups.map(renderGroup)}
          </Box>
        </Box>
      )}

      <Menu
        open={menu != null}
        anchorEl={menu?.anchor}
        onClose={() => setMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem disabled sx={{ opacity: 1, fontWeight: 600, fontSize: 12 }}>
          Assign someone
        </MenuItem>
        {(menu ? remainingFor(menu.shift) : []).map((person) => (
          <MenuItem
            key={person.id}
            onClick={() => {
              if (!menu) return;
              rememberDepartment(menu.shift.department);
              void saveAssign.mutateAsync({
                data: { employee: person.id, shift: menu.shift.id, weekdays: [] },
              });
              setMenu(null);
            }}
          >
            {person.full_name}
          </MenuItem>
        ))}
        {menu && !remainingFor(menu.shift).length ? (
          <MenuItem disabled>Everyone is assigned</MenuItem>
        ) : null}
        {menu ? (
          <MenuItem
            onClick={() => {
              if (menu.shift.is_active) {
                setPendingDeactivate(menu.shift);
              } else {
                void setShiftActive(menu.shift, true);
              }
              setMenu(null);
            }}
          >
            {menu.shift.is_active ? 'Deactivate' : 'Activate'}
          </MenuItem>
        ) : null}
        {menu && !menu.shift.locked ? (
          <MenuItem
            onClick={() => {
              setPendingRemove({
                shift: menu.shift,
                count: allAssignments.filter((row) => row.shift === menu.shift.id).length,
              });
              setMenu(null);
            }}
          >
            Remove
          </MenuItem>
        ) : null}
      </Menu>

      <ConfirmDialog
        open={pendingDeactivate != null}
        title={pendingDeactivate ? `Deactivate ${pendingDeactivate.name}?` : 'Deactivate shift?'}
        message="Clock-in will hide this tile. Assigned people stay on the roster."
        confirmLabel="Deactivate"
        severity="warning"
        onCancel={() => setPendingDeactivate(null)}
        onConfirm={() => {
          if (pendingDeactivate) void setShiftActive(pendingDeactivate, false);
          setPendingDeactivate(null);
        }}
      />

      <ConfirmDialog
        open={pendingRemove != null}
        title={pendingRemove ? `Remove ${pendingRemove.shift.name}?` : 'Remove shift?'}
        message={
          pendingRemove?.count === 1
            ? 'This unassigns 1 person.'
            : `This unassigns ${pendingRemove?.count ?? 0} people.`
        }
        confirmLabel="Remove"
        severity="warning"
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          if (pendingRemove) void removeShift.mutateAsync(pendingRemove.shift.id);
          setPendingRemove(null);
        }}
      />
    </Box>
  );
}

function ByDayGrid({
  groups,
  assignments,
}: {
  groups: DeptGroup[];
  assignments: RosterAssignment[];
}) {
  return (
    <Box
      sx={{
        mt: 3,
        display: 'grid',
        gridTemplateColumns: '160px repeat(7, minmax(0, 1fr))',
        border: `1px solid ${dutyColors.ink08}`,
        borderRadius: '12px',
        overflow: 'hidden',
        bgcolor: dutyColors.card,
      }}
    >
      <Box />
      {DAY_LABELS.map((label) => (
        <Typography
          key={label}
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: dutyColors.ink40,
            px: 1,
            py: 1,
            borderLeft: `1px solid ${dutyColors.ink08}`,
          }}
        >
          {label}
        </Typography>
      ))}
      {groups.map((group) => (
        <Box key={group.department} sx={{ display: 'contents' }}>
          <Box sx={{ px: 1.25, py: 1.25, borderTop: `1px solid ${dutyColors.ink08}` }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 'normal',
                textTransform: 'uppercase',
                color: dutyColors.ink40,
              }}
            >
              {group.department}
            </Typography>
          </Box>
          {ALL_DAYS.map((day) => {
            const running = group.shifts.filter((shift) => shift.is_active && shiftDays(shift).includes(day));
            const names: string[] = [];
            let hole = false;
            for (const shift of running) {
              const on = assignments.filter((row) => (
                row.shift === shift.id && personDays(row, shift).includes(day)
              ));
              if (!on.length) hole = true;
              for (const row of on) {
                if (!names.includes(row.employee_name)) names.push(row.employee_name);
              }
            }
            names.sort(byPersonName);
            return (
              <Box
                key={day}
                sx={{
                  minHeight: 56,
                  px: 1,
                  py: 1,
                  borderTop: `1px solid ${dutyColors.ink08}`,
                  borderLeft: `1px solid ${dutyColors.ink08}`,
                  bgcolor: running.length > 0 && hole ? 'rgba(192,48,28,0.12)' : 'transparent',
                }}
              >
                {names.map((name) => (
                  <Typography key={name} sx={{ fontSize: 12, lineHeight: 1.35 }}>
                    {name}
                  </Typography>
                ))}
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

function ShiftFields({
  draft,
  departments,
  touched = {},
  nameRef,
  submitLabel,
  onTouched,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  departments: DeptRow[];
  touched?: Touched;
  nameRef?: Ref<HTMLInputElement>;
  submitLabel: string;
  onTouched?: (next: Touched) => void;
  onChange: (next: Draft) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
}) {
  const nameError = Boolean(touched.name && !draft.name.trim());
  const daysError = Boolean(touched.weekdays && !draft.weekdays.length);
  const deptError = Boolean(touched.department && draft.department === '');
  const hideDept = departments.length === 1;
  const allOn = ALL_DAYS.every((day) => draft.weekdays.includes(day));

  function toggleDay(day: number) {
    onTouched?.({ weekdays: true });
    onChange({
      ...draft,
      weekdays: draft.weekdays.includes(day)
        ? draft.weekdays.filter((item) => item !== day)
        : [...draft.weekdays, day].sort((a, b) => a - b),
    });
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 1.25,
      }}
    >
      <TextField
        size="small"
        name="shift-name"
        label="Shift name"
        value={draft.name}
        placeholder="Retail Mid"
        inputRef={nameRef}
        InputLabelProps={{ shrink: true }}
        error={nameError}
        helperText={nameError ? 'Shift name is required' : undefined}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        onBlur={() => onTouched?.({ name: true })}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel?.();
          }
        }}
        sx={{ width: 200 }}
      />
      {hideDept ? null : (
        <FormControl
          size="small"
          error={deptError}
          onBlur={() => onTouched?.({ department: true })}
          sx={{ minWidth: 160 }}
        >
          <InputLabel shrink>Department</InputLabel>
          <Select
            label="Department"
            notched
            displayEmpty
            value={draft.department}
            onChange={(e) => {
              onTouched?.({ department: true });
              const next = e.target.value as number;
              rememberDepartment(next);
              onChange(applyDepartment(draft, next));
            }}
          >
            <MenuItem value="" disabled>Select</MenuItem>
            {departments.map((row) => (
              <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <DayChip
            label="All"
            selected={allOn}
            onClick={() => {
              onTouched?.({ weekdays: true });
              onChange({
                ...draft,
                weekdays: allOn ? [] : [...ALL_DAYS],
              });
            }}
          />
          {ALL_DAYS.map((day) => (
            <DayChip
              key={day}
              label={DAY_LABELS[day]}
              selected={draft.weekdays.includes(day)}
              onClick={() => toggleDay(day)}
            />
          ))}
        </Box>
        <Typography sx={{ fontSize: 12, color: daysError ? dutyColors.red : 'transparent', minHeight: 20 }}>
          {daysError ? 'Pick at least one day' : ' '}
        </Typography>
      </Box>
      <TextField
        size="small"
        label="In"
        value={draft.timeIn}
        placeholder="09:00"
        InputLabelProps={{ shrink: true }}
        inputProps={{ inputMode: 'numeric', maxLength: 5, 'aria-label': 'In' }}
        onChange={(e) => onChange({ ...draft, timeIn: e.target.value })}
        onBlur={() => onChange({ ...draft, timeIn: normalizeHhmm(draft.timeIn, '09:00') })}
        sx={{ width: 88 }}
      />
      <TextField
        size="small"
        label="Out"
        value={draft.timeOut}
        placeholder="17:00"
        InputLabelProps={{ shrink: true }}
        inputProps={{ inputMode: 'numeric', maxLength: 5, 'aria-label': 'Out' }}
        onChange={(e) => onChange({ ...draft, timeOut: e.target.value })}
        onBlur={() => onChange({ ...draft, timeOut: normalizeHhmm(draft.timeOut, '17:00') })}
        sx={{ width: 88 }}
      />
      <Box sx={{ display: 'flex', gap: 1, pt: '4px' }}>
        <Button
          type={onSubmit ? 'button' : 'submit'}
          variant="contained"
          disabled={!canSaveDraft(draft)}
          onClick={onSubmit}
        >
          {submitLabel}
        </Button>
      </Box>
    </Box>
  );
}

