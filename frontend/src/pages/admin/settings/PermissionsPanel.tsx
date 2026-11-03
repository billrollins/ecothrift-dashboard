import { Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

/** Permissions moved to their own page (People → Permissions, Dash Update #53); this section points there. */
export function PermissionsPanel() {
  return (
    <Button component={RouterLink} to="/people/permissions" variant="outlined" size="small" sx={{ textTransform: 'none' }}>
      Open People → Permissions
    </Button>
  );
}
