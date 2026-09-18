import { Box, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MoreVert from '@mui/icons-material/MoreVert';
import { useEffect, useState } from 'react';
import type { RosterAssignment, RosterShift } from '../../../api/hr.api';
import { dutyColors } from '../../../components/duty/tokens';
import {
  ALL_DAYS,
  DAY_CHIP,
  DAY_CHIP_GAP,
  DAY_LABELS,
  DAYS_COL,
  TITLE_COL,
  coverageSummary,
  dayAssignedCount,
  dayCovered,
  hhmm,
  lockTooltip,
  normalizeHhmm,
  personDays,
  shiftDays,
} from './shiftsLayout';

const fieldSx = {
  '& .MuiInputBase-root': {
    fontSize: 20,
    fontWeight: 750,
    '&:before, &:after': { display: 'none' },
    '& fieldset': { borderColor: 'transparent' },
    '&:hover fieldset': { borderColor: dutyColors.ink15 },
    '&.Mui-focused fieldset': { borderColor: dutyColors.brand },
  },
  '& .MuiInputBase-input': { py: 0.25, px: 0.5 },
};

const timeSx = {
  width: 88,
  '& .MuiInputBase-root': {
    fontSize: 16,
    fontWeight: 650,
    '&:before, &:after': { display: 'none' },
    '& fieldset': { borderColor: 'transparent' },
    '&:hover fieldset': { borderColor: dutyColors.ink15 },
    '&.Mui-focused fieldset': { borderColor: dutyColors.brand },
  },
  '& .MuiInputBase-input': { py: 0.4, px: 0.5, textAlign: 'center' },
};

export function ShiftCard({
  shift,
  assigned,
  readOnly = false,
  onPatch,
  onToggleShiftDay,
  onMenu,
  onToggleDay,
  onUnassign,
}: {
  shift: RosterShift;
  assigned: RosterAssignment[];
  readOnly?: boolean;
  onPatch?: (patch: { name?: string; timeIn?: string; timeOut?: string }) => void;
  onToggleShiftDay?: (day: number) => void;
  onMenu?: (anchor: HTMLElement) => void;
  onToggleDay?: (row: RosterAssignment, day: number) => void;
  onUnassign?: (id: number) => void;
}) {
  const days = shiftDays(shift);
  const cover = coverageSummary(days, assigned.map((row) => ({ days: personDays(row, shift) })));
  const locked = Boolean(shift.locked);
  const [name, setName] = useState(shift.name);
  const [timeIn, setTimeIn] = useState(hhmm(shift.time_in));
  const [timeOut, setTimeOut] = useState(hhmm(shift.time_out));

  useEffect(() => { setName(shift.name); }, [shift.name]);
  useEffect(() => { setTimeIn(hhmm(shift.time_in)); }, [shift.time_in]);
  useEffect(() => { setTimeOut(hhmm(shift.time_out)); }, [shift.time_out]);

  return (
    <Box
      sx={{
        mb: 1,
        p: 2,
        borderRadius: '12px',
        bgcolor: dutyColors.card,
        border: `1px solid ${dutyColors.ink08}`,
        opacity: shift.is_active ? 1 : 0.55,
        overflow: 'visible',
        display: 'grid',
        gridTemplateColumns: `${TITLE_COL} ${DAYS_COL}px minmax(72px, 1fr)`,
        columnGap: 2,
        rowGap: 0.75,
        alignItems: 'start',
      }}
    >
      <Box sx={{ gridColumn: 1, gridRow: '1 / 3', width: TITLE_COL, minWidth: 0, alignSelf: 'center' }}>
        {readOnly ? (
          <Typography
            title={shift.name}
            sx={{
              fontSize: 20,
              fontWeight: 750,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {shift.name}
          </Typography>
        ) : (
          <TextField
            variant="outlined"
            size="small"
            value={name}
            title={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              const next = name.trim() || shift.name;
              setName(next);
              onPatch?.({ name: next });
            }}
            inputProps={{ 'aria-label': `${shift.name} name` }}
            sx={{
              ...fieldSx,
              width: '100%',
              '& .MuiInputBase-input': {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            }}
          />
        )}
      </Box>
      <Box sx={{ gridColumn: 2, gridRow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 36, width: DAYS_COL }}>
        {readOnly ? (
          <Typography sx={{ fontSize: 16, fontWeight: 650 }}>
            {hhmm(shift.time_in)}
            <Box component="span" sx={{ color: dutyColors.ink40, px: 0.5 }}>to</Box>
            {hhmm(shift.time_out)}
          </Typography>
        ) : (
          <>
            <TextField
              variant="outlined"
              size="small"
              value={timeIn}
              onChange={(event) => setTimeIn(event.target.value)}
              onBlur={() => {
                const next = normalizeHhmm(timeIn, hhmm(shift.time_in));
                setTimeIn(next);
                onPatch?.({ timeIn: next });
              }}
              inputProps={{ inputMode: 'numeric', maxLength: 5, 'aria-label': `${shift.name} in` }}
              sx={timeSx}
            />
            <Typography sx={{ fontSize: 16, color: dutyColors.ink40, px: 0.5 }}>to</Typography>
            <TextField
              variant="outlined"
              size="small"
              value={timeOut}
              onChange={(event) => setTimeOut(event.target.value)}
              onBlur={() => {
                const next = normalizeHhmm(timeOut, hhmm(shift.time_out));
                setTimeOut(next);
                onPatch?.({ timeOut: next });
              }}
              inputProps={{ inputMode: 'numeric', maxLength: 5, 'aria-label': `${shift.name} out` }}
              sx={timeSx}
            />
          </>
        )}
      </Box>
      <Box sx={{ gridColumn: 3, gridRow: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: 32 }}>
        {shift.is_active ? null : (
          <Typography sx={{ fontSize: 12, fontWeight: 650, color: dutyColors.ink40, mr: 0.75 }}>
            Inactive
          </Typography>
        )}
        {locked ? (
          <Tooltip title={lockTooltip(shift.locked_title || shift.name)}>
            <LockOutlined sx={{ fontSize: 14, color: dutyColors.ink40 }} />
          </Tooltip>
        ) : null}
        {readOnly || !onMenu ? null : (
          <IconButton
            size="small"
            aria-label={`More for ${shift.name}`}
            onClick={(event) => onMenu(event.currentTarget)}
          >
            <MoreVert fontSize="small" />
          </IconButton>
        )}
      </Box>
      <Box sx={{ gridColumn: 2, gridRow: 2 }}>
        <DayPills
          mode="coverage"
          shiftDaysOn={days}
          assigned={assigned.map((row) => ({ days: personDays(row, shift) }))}
          onToggle={readOnly ? undefined : onToggleShiftDay}
        />
      </Box>
      <Typography
        sx={{
          gridColumn: 3,
          gridRow: 2,
          fontSize: 12,
          textAlign: 'right',
          lineHeight: '26px',
          whiteSpace: 'nowrap',
          color: !shift.is_active
            ? dutyColors.ink40
            : cover.tone === 'bad' ? dutyColors.red : dutyColors.green,
        }}
      >
        {shift.is_active ? cover.text : 'Hidden from clock-in'}
      </Typography>

      {assigned.map((row) => (
        <Box
          key={row.id}
          sx={{
            display: 'contents',
            '& .person-name, & .person-days, & .unassign': {
              borderTop: `1px solid ${dutyColors.ink08}`,
              pt: 0.75,
            },
            '& .unassign': { opacity: 0 },
            '&:hover .unassign, &:focus-within .unassign': { opacity: 1 },
          }}
        >
          <Typography
            className="person-name"
            title={row.employee_name}
            sx={{
              fontSize: 14,
              lineHeight: '26px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {row.employee_name}
          </Typography>
          <Box className="person-days">
            <DayPills
              mode="person"
              shiftDaysOn={days}
              active={personDays(row, shift)}
              onToggle={readOnly || !onToggleDay ? undefined : (day) => onToggleDay(row, day)}
            />
          </Box>
          {readOnly || !onUnassign ? (
            <Box />
          ) : (
            <Box
              component="button"
              type="button"
              className="unassign"
              onClick={() => onUnassign(row.id)}
              sx={{
                border: 0,
                background: 'none',
                fontSize: 13,
                color: dutyColors.ink40,
                cursor: 'pointer',
                p: 0,
                justifySelf: 'end',
                lineHeight: '26px',
                '&:hover, &:focus-visible': { color: dutyColors.red },
              }}
            >
              Unassign
            </Box>
          )}
        </Box>
      ))}

      {!assigned.length ? (
        <Typography sx={{ gridColumn: '1 / -1', fontSize: 13, color: dutyColors.ink40, mt: 0.5 }}>
          No one assigned yet
        </Typography>
      ) : null}
    </Box>
  );
}

function DayPills({
  mode,
  shiftDaysOn,
  assigned = [],
  active = [],
  onToggle,
}: {
  mode: 'coverage' | 'person';
  shiftDaysOn: number[];
  assigned?: Array<{ days: number[] }>;
  active?: number[];
  onToggle?: (day: number) => void;
}) {
  const on = new Set(active);
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(7, ${DAY_CHIP}px)`,
        gap: `${DAY_CHIP_GAP}px`,
        width: DAYS_COL,
        flex: 'none',
        overflow: 'visible',
      }}
    >
      {ALL_DAYS.map((day) => {
        const onShift = shiftDaysOn.includes(day);
        if (mode === 'coverage') {
          const cover = dayCovered(day, shiftDaysOn, assigned);
          return (
            <DayChip
              key={day}
              label={DAY_LABELS[day]}
              kind="shift"
              selected={onShift}
              disabled={!onShift}
              count={dayAssignedCount(day, assigned)}
              tone={cover === 'covered' ? 'good' : cover === 'uncovered' ? 'bad' : undefined}
              onClick={onToggle ? () => onToggle(day) : undefined}
            />
          );
        }
        return (
          <DayChip
            key={day}
            label={DAY_LABELS[day]}
            kind="staff"
            selected={onShift && on.has(day)}
            disabled={!onShift}
            onClick={onShift && onToggle ? () => onToggle(day) : undefined}
          />
        );
      })}
    </Box>
  );
}

function chipLook({
  kind,
  selected,
  tone,
  disabled,
}: {
  kind: 'shift' | 'staff';
  selected: boolean;
  tone?: 'good' | 'bad';
  disabled?: boolean;
}) {
  if (disabled && !tone) {
    return { bg: 'transparent', border: dutyColors.ink15, color: dutyColors.ink40 };
  }
  if (tone === 'good') {
    return { bg: dutyColors.brandSoft, border: 'rgba(46,125,50,0.42)', color: dutyColors.green };
  }
  if (tone === 'bad') {
    return { bg: 'rgba(192,48,28,0.08)', border: 'rgba(192,48,28,0.38)', color: dutyColors.red };
  }
  if (kind === 'staff' && selected) {
    return { bg: 'rgba(47,95,168,0.10)', border: 'rgba(47,95,168,0.40)', color: dutyColors.blue };
  }
  if (selected) {
    return { bg: dutyColors.brandSoft, border: 'rgba(46,125,50,0.42)', color: dutyColors.green };
  }
  return { bg: 'transparent', border: dutyColors.ink15, color: dutyColors.ink60 };
}

export function DayChip({
  label,
  selected,
  disabled,
  tone,
  kind = 'shift',
  count = 0,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  tone?: 'good' | 'bad';
  kind?: 'shift' | 'staff';
  count?: number;
  onClick?: () => void;
}) {
  const look = chipLook({ kind, selected, tone, disabled });
  const showCount = count > 1;
  return (
    <Box
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={showCount ? `${label}, ${count} assigned` : undefined}
      aria-pressed={onClick ? selected : undefined}
      aria-disabled={disabled && !onClick ? true : undefined}
      onClick={onClick ? (event) => {
        event.stopPropagation();
        onClick();
      } : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      sx={{
        position: 'relative',
        width: DAY_CHIP,
        minWidth: DAY_CHIP,
        height: 26,
        px: 0,
        borderRadius: '7px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 750,
        lineHeight: 1,
        userSelect: 'none',
        overflow: 'visible',
        opacity: disabled && !tone ? 0.4 : 1,
        border: `1px solid ${look.border}`,
        bgcolor: look.bg,
        color: look.color,
        cursor: onClick ? 'pointer' : 'default',
        outline: '2px solid transparent',
        outlineOffset: 2,
        '&:focus-visible': onClick ? { outline: `2px solid ${dutyColors.brand}` } : undefined,
      }}
    >
      {label}
      {showCount ? (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: -6,
            right: -6,
            minWidth: 14,
            height: 14,
            px: '3px',
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 750,
            lineHeight: 1,
            bgcolor: dutyColors.brandSoft,
            border: '1px solid rgba(46,125,50,0.42)',
            color: dutyColors.green,
            pointerEvents: 'none',
          }}
        >
          {count}
        </Box>
      ) : null}
    </Box>
  );
}
