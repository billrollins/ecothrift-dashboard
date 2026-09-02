import { Box, InputBase, Tooltip } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { dutyColors } from '../../components/duty/tokens';
import { RoutinePaneHeader } from './RoutinePaneHeader';
import { RoutineViewToggle } from './RoutineViewToggle';

export function RoutineListHeader({
  view,
  onView,
  eyebrow,
  note,
  noteIsError,
  canCreate,
  onCreate,
  query,
  onQuery,
}: {
  view: 'mine' | 'catalog';
  onView: (view: 'mine' | 'catalog') => void;
  eyebrow: string;
  note: string;
  noteIsError?: boolean;
  canCreate: boolean;
  onCreate: () => void;
  query: string;
  onQuery: (query: string) => void;
}) {
  return (
    <RoutinePaneHeader
      eyebrow={eyebrow}
      title="Routines"
      note={note}
      noteIsError={noteIsError}
      actions={canCreate ? <NewRoutineButton onClick={onCreate} /> : null}
      below={(
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <RoutineViewToggle view={view} onChange={onView} />
          <FilterField value={query} onChange={onQuery} />
        </Box>
      )}
    />
  );
}

function NewRoutineButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip title="New routine">
      <Box
        component="button"
        type="button"
        aria-label="New routine"
        onClick={onClick}
        sx={{
          width: 34,
          height: 34,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          borderRadius: '10px',
          border: 'none',
          bgcolor: dutyColors.brand,
          color: '#fff',
          boxShadow: '0 1px 3px rgba(27,94,32,0.28)',
          '&:hover': { bgcolor: dutyColors.brandDark },
        }}
      >
        <AddRounded sx={{ fontSize: 20 }} />
      </Box>
    </Tooltip>
  );
}

function FilterField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        height: 34,
        px: 1.25,
        borderRadius: '9px',
        bgcolor: dutyColors.paper,
        border: `1px solid ${dutyColors.ink15}`,
        '&:focus-within': { borderColor: dutyColors.brand },
      }}
    >
      <SearchRounded sx={{ fontSize: 17, color: dutyColors.ink40 }} />
      <InputBase
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter routines"
        inputProps={{ 'aria-label': 'Filter routines' }}
        sx={{ flex: 1, fontSize: 13, color: dutyColors.ink }}
      />
    </Box>
  );
}
