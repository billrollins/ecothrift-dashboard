import { Box, InputBase, MenuItem, TextField } from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import type { ReactNode } from 'react';
import type { RoutineTrigger } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { TRIGGER_LABELS } from '../../routines/RoutineSettingsFields';
import {
  HEALTH_FLAG_LABELS,
  toggleFlag,
  type AdminHealthFlag,
  type AdminRoutineFilters,
  type AdminSort,
  type AdminStatusFilter,
} from './adminRoutineFilters';

const SORT_LABELS: Record<AdminSort, string> = {
  attention: 'Needs attention',
  title: 'Name',
  lastDone: 'Last performed',
  nextDue: 'Next due',
};

const STATUS_LABELS: Record<AdminStatusFilter, string> = {
  active: 'Active',
  retired: 'Retired',
  all: 'All',
};

const FLAG_ORDER: AdminHealthFlag[] = ['overdue', 'unassigned', 'neverRun', 'blocking'];

/** Fields on the ink header: white text, quiet borders, brand focus ring. */
const darkSelectSx = {
  minWidth: 0,
  '& .MuiOutlinedInput-root': {
    height: 34,
    borderRadius: '9px',
    fontSize: 12.5,
    fontWeight: 600,
    color: '#fff',
    bgcolor: 'rgba(255,255,255,0.06)',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.18)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.4)' },
    '&.Mui-focused fieldset': { borderColor: dutyColors.brand, borderWidth: 1.5 },
    '& .MuiSelect-icon': { color: 'rgba(255,255,255,0.6)' },
  },
} as const;

/**
 * Search, status, health chips, and the narrowing selects, all on the ink
 * header. The chips carry live counts so the owner sees where the trouble is
 * before clicking anything.
 */
export function AdminRoutineFilterBar({
  filters,
  onChange,
  counts,
  departments,
}: {
  filters: AdminRoutineFilters;
  onChange: (next: AdminRoutineFilters) => void;
  counts: Record<AdminHealthFlag, number>;
  departments: Array<{ id: number; name: string }>;
}) {
  const set = (patch: Partial<AdminRoutineFilters>) => onChange({ ...filters, ...patch });
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <SearchField value={filters.query} onChange={(query) => set({ query })} />
        <TextField
          select
          size="small"
          value={filters.department === 'all' ? 'all' : String(filters.department)}
          onChange={(e) => {
            const raw = e.target.value;
            set({ department: raw === 'all' || raw === 'none' ? raw : Number(raw) });
          }}
          inputProps={{ 'aria-label': 'Department' }}
          sx={{ ...darkSelectSx, width: 150 }}
        >
          <MenuItem value="all">All departments</MenuItem>
          <MenuItem value="none">No department</MenuItem>
          {departments.map((dept) => (
            <MenuItem key={dept.id} value={String(dept.id)}>{dept.name}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          value={filters.trigger}
          onChange={(e) => set({ trigger: e.target.value as 'all' | RoutineTrigger })}
          inputProps={{ 'aria-label': 'Repeats' }}
          sx={{ ...darkSelectSx, width: 140 }}
        >
          <MenuItem value="all">Any cadence</MenuItem>
          {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
            <MenuItem key={value} value={value}>{label}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value as AdminSort })}
          inputProps={{ 'aria-label': 'Sort' }}
          sx={{ ...darkSelectSx, width: 160 }}
        >
          {(Object.keys(SORT_LABELS) as AdminSort[]).map((value) => (
            <MenuItem key={value} value={value}>Sort: {SORT_LABELS[value]}</MenuItem>
          ))}
        </TextField>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Segmented
          value={filters.status}
          options={(Object.keys(STATUS_LABELS) as AdminStatusFilter[]).map((id) => ({ id, label: STATUS_LABELS[id] }))}
          onChange={(status) => set({ status })}
        />
        <Box sx={{ width: 1, height: 22, bgcolor: 'rgba(255,255,255,0.14)', mx: 0.25 }} />
        {FLAG_ORDER.map((flag) => (
          <Chip
            key={flag}
            selected={filters.flags.includes(flag)}
            count={counts[flag]}
            onClick={() => set({ flags: toggleFlag(filters.flags, flag) })}
            hot={flag === 'overdue'}
          >
            {HEALTH_FLAG_LABELS[flag]}
          </Chip>
        ))}
      </Box>
    </Box>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Box
      sx={{
        flex: '1 1 200px',
        minWidth: 180,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        height: 34,
        px: 1.25,
        borderRadius: '9px',
        bgcolor: dutyColors.card,
        border: `1px solid transparent`,
        '&:focus-within': { borderColor: dutyColors.brand, boxShadow: `0 0 0 3px rgba(46,125,50,0.25)` },
      }}
    >
      <SearchRounded sx={{ fontSize: 17, color: dutyColors.ink40 }} />
      <InputBase
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search name, context, department, who did it last"
        inputProps={{ 'aria-label': 'Search routines' }}
        sx={{ flex: 1, fontSize: 13, color: dutyColors.ink }}
      />
    </Box>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <Box
      role="tablist"
      sx={{
        display: 'flex',
        height: 32,
        p: '3px',
        borderRadius: '9px',
        bgcolor: 'rgba(255,255,255,0.10)',
      }}
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Box
            key={option.id}
            component="button"
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.id)}
            sx={{
              height: 26,
              px: 1.5,
              font: 'inherit',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              borderRadius: '7px',
              color: selected ? '#fff' : 'rgba(255,255,255,0.68)',
              bgcolor: selected ? dutyColors.brand : 'transparent',
              boxShadow: selected ? '0 1px 3px rgba(0,0,0,0.35)' : 'none',
              transition: 'background-color 120ms, color 120ms',
              '&:hover': { color: '#fff', bgcolor: selected ? dutyColors.brandDark : 'rgba(255,255,255,0.08)' },
            }}
          >
            {option.label}
          </Box>
        );
      })}
    </Box>
  );
}

function Chip({
  selected,
  count,
  hot,
  onClick,
  children,
}: {
  selected: boolean;
  count: number;
  /** Overdue: the count glows red when it is above zero, so it reads from across the room. */
  hot?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const warm = hot && count > 0;
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      sx={{
        height: 32,
        pl: 1.25,
        pr: 0.6,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        font: 'inherit',
        fontSize: 12.5,
        fontWeight: 700,
        cursor: 'pointer',
        borderRadius: 999,
        border: `1px solid ${selected ? '#fff' : 'rgba(255,255,255,0.22)'}`,
        color: selected ? dutyColors.ink : 'rgba(255,255,255,0.82)',
        bgcolor: selected ? '#fff' : 'transparent',
        transition: 'background-color 120ms, color 120ms, border-color 120ms',
        '&:hover': { borderColor: selected ? '#fff' : 'rgba(255,255,255,0.5)' },
      }}
    >
      {children}
      <Box
        component="span"
        sx={{
          minWidth: 22,
          height: 20,
          px: 0.6,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 999,
          fontSize: 11.5,
          fontWeight: 800,
          color: warm ? '#fff' : selected ? dutyColors.ink60 : 'rgba(255,255,255,0.7)',
          bgcolor: warm ? dutyColors.red : selected ? dutyColors.ink08 : 'rgba(255,255,255,0.12)',
        }}
      >
        {count}
      </Box>
    </Box>
  );
}
