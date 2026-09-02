/**
 * The two history filter rows: Actions and Non-actions.
 *
 * Always the same height. Colour tells you which chip is on; size does not.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { ACTION_WASH, DESK_WASH, historyTypeMeta } from './tarsActions';
import {
  DESK_HISTORY_FILTERS,
  WORK_HISTORY_FILTERS,
  type TarsHistoryFilter,
} from './tarsBenchHistory';
import { PANEL, RADIUS, TYPE } from './studio/benchScale';

export const FILTER_ROW_HEIGHT = 30;
const LEADING_FILTER_SLOT = 118;

const WORK_LABELS: Record<(typeof WORK_HISTORY_FILTERS)[number], string> = {
  inspect: 'Inspect',
  test: 'Test',
  assemble: 'Assemble',
  repair: 'Repair',
  salvage: 'Salvage',
};

const DESK_LABELS: Record<(typeof DESK_HISTORY_FILTERS)[number], string> = {
  notes: 'Notes',
  grades: 'Grades',
  estimates: 'Estimates',
  parts: 'Parts',
  progress: 'Progress',
};

/** First click turns a chip on. The same chip again turns it off - all off is everything. */
export function toggleHistoryFilter(
  current: TarsHistoryFilter,
  next: TarsHistoryFilter,
): TarsHistoryFilter {
  return current === next ? 'all' : next;
}

export function HistoryFilterRows({
  filter,
  onFilter,
}: {
  filter: TarsHistoryFilter;
  onFilter: (filter: TarsHistoryFilter) => void;
}) {
  return (
    <Stack spacing={0.4} sx={{ width: '100%', minHeight: FILTER_ROW_HEIGHT * 2 + 4, flexShrink: 0 }}>
      <FilterRow
        wash={ACTION_WASH}
        lead={{ id: 'actions', label: 'Actions' }}
        chips={WORK_HISTORY_FILTERS.map((id) => ({ id, label: WORK_LABELS[id] }))}
        selected={filter}
        onSelect={onFilter}
      />
      <FilterRow
        wash={DESK_WASH}
        lead={{ id: 'non_actions', label: 'Non-actions' }}
        chips={DESK_HISTORY_FILTERS.map((id) => ({ id, label: DESK_LABELS[id] }))}
        selected={filter}
        onSelect={onFilter}
      />
    </Stack>
  );
}

export function FilterSlotButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onClick={onClick}
      sx={{
        ...TYPE.meta,
        px: 0.6,
        height: 28,
        border: 'none',
        bgcolor: 'transparent',
        color: disabled ? PANEL.faint : PANEL.inkMuted,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </Box>
  );
}

function FilterRow({
  wash,
  lead,
  chips,
  selected,
  onSelect,
}: {
  wash: { soft: string; border: string };
  lead: { id: TarsHistoryFilter; label: string };
  chips: Array<{ id: TarsHistoryFilter; label: string }>;
  selected: TarsHistoryFilter;
  onSelect: (filter: TarsHistoryFilter) => void;
}) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ width: '100%', minHeight: FILTER_ROW_HEIGHT }}>
      <Box sx={{ width: LEADING_FILTER_SLOT, flexShrink: 0 }}>
        <FilterBar wash={wash} selected={selected} onSelect={onSelect} chips={[lead]} />
      </Box>
      <Box
        aria-hidden
        sx={{
          width: '1px',
          alignSelf: 'stretch',
          my: 0.45,
          bgcolor: PANEL.border,
          flexShrink: 0,
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <FilterBar wash={wash} selected={selected} onSelect={onSelect} chips={chips} />
      </Box>
    </Stack>
  );
}

function filterChipColor(id: TarsHistoryFilter): string {
  if (id === 'all' || id === 'actions' || id === 'non_actions') return PANEL.ink;
  return historyTypeMeta(id).color;
}

function FilterBar({
  wash,
  selected,
  onSelect,
  chips,
  fill = true,
}: {
  wash: { soft: string; border: string };
  selected: TarsHistoryFilter;
  onSelect: (filter: TarsHistoryFilter) => void;
  chips: Array<{ id: TarsHistoryFilter; label: string }>;
  fill?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        width: '100%',
        minHeight: FILTER_ROW_HEIGHT,
        p: '3px',
        borderRadius: `${RADIUS.md}px`,
        bgcolor: wash.soft,
        border: `1px solid ${wash.border}`,
        overflowX: 'auto',
      }}
    >
      {chips.map((chip) => {
        const on = chip.id === selected;
        const fg = filterChipColor(chip.id);
        const anyOn = chips.some((item) => item.id === selected);
        return (
          <Box
            key={chip.id}
            component="button"
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(toggleHistoryFilter(selected, chip.id))}
            sx={{
              ...TYPE.micro,
              letterSpacing: '0.04em',
              flex: fill ? 1 : undefined,
              minWidth: fill ? 64 : undefined,
              height: 26,
              px: fill ? 0.75 : 1.15,
              cursor: 'pointer',
              borderRadius: `${RADIUS.sm}px`,
              border: '1px solid',
              borderColor: on ? fg : 'transparent',
              bgcolor: on ? '#ffffff' : 'transparent',
              color: fg,
              opacity: !anyOn || on ? 1 : 0.6,
              '&:hover': { opacity: 1 },
            }}
          >
            {chip.label}
          </Box>
        );
      })}
    </Box>
  );
}
