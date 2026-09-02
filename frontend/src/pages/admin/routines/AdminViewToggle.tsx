import { Box, Button } from '@mui/material';

export type AdminRoutineView = 'routines' | 'sections' | 'grades';

export const ADMIN_VIEWS: Array<[AdminRoutineView, string]> = [
  ['routines', 'Routines'],
  ['sections', 'Sections'],
  ['grades', 'Grades'],
];

export function parseAdminView(raw: string | null): AdminRoutineView {
  return ADMIN_VIEWS.some(([id]) => id === raw) ? (raw as AdminRoutineView) : 'routines';
}

/** Segmented switch for the three rooms of Routine Control, on the dark head. */
export function AdminViewToggle({
  view,
  onChange,
}: {
  view: AdminRoutineView;
  onChange: (view: AdminRoutineView) => void;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        height: 36,
        p: '3px',
        borderRadius: '10px',
        bgcolor: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.10)',
      }}
    >
      {ADMIN_VIEWS.map(([id, label]) => {
        const selected = view === id;
        return (
          <Button
            key={id}
            onClick={() => onChange(id)}
            sx={{
              flex: 1,
              height: 30,
              minWidth: 0,
              borderRadius: '8px',
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: '0.01em',
              color: selected ? '#0F1611' : 'rgba(255,255,255,0.66)',
              bgcolor: selected ? '#8FD694' : 'transparent',
              '&:hover': { bgcolor: selected ? '#8FD694' : 'rgba(255,255,255,0.10)' },
            }}
          >
            {label}
          </Button>
        );
      })}
    </Box>
  );
}
