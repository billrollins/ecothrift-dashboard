import { Alert, Button, Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import type { User } from '../../types/accounts.types';

type Flag = NonNullable<User['hours_flag']>;

/**
 * The big red flag when someone's week is past 40 plus their overtime allowance (owner 2026-10-20):
 * "Over their hours: 43.2 of 40. Forgot to clock out? Fix the time entry." with a link to their time entries.
 */
export function OverHoursAlert({ flag }: { flag: Flag }) {
  return (
    <Alert
      severity="error"
      variant="filled"
      data-testid="over-hours-flag"
      action={
        <Button color="inherit" size="small" component={RouterLink} to={flag.link} sx={{ fontWeight: 700 }}>
          Time entries
        </Button>
      }
      sx={{ fontWeight: 700, alignItems: 'center' }}
    >
      {flag.text}
    </Alert>
  );
}

/** The same flag as a small red chip for a table row. */
export function OverHoursChip({ flag }: { flag: Flag }) {
  return (
    <Chip
      size="small"
      color="error"
      component={RouterLink}
      to={flag.link}
      clickable
      onClick={(e) => e.stopPropagation()}
      label={`Over hours ${flag.hours}/${flag.limit}`}
      title={flag.text}
      data-testid="over-hours-chip"
      sx={{ fontWeight: 700, flexShrink: 0 }}
    />
  );
}
