import FactCheck from '@mui/icons-material/FactCheck';
import ListAlt from '@mui/icons-material/ListAlt';
import { Box, Button, Paper, Tab, Tabs, useMediaQuery, useTheme } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';

type View = 'count' | 'sessions';
const PATH: Record<View, string> = { count: '/inventory/count', sessions: '/inventory/count/days' };

/**
 * The switch between running a count and looking at the sessions (managers and up; everyone else only counts).
 * Tabs across the top on a desk; two thumb-size buttons fixed to the bottom on a phone (owner, 2026-10-02).
 */
export function CountNav({ current }: { current: View }) {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  if (!(hasRole('Manager') || user?.is_superuser)) return null;

  if (!phone) {
    return (
      <Tabs value={current} onChange={(_e, next: View) => navigate(PATH[next])} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="count" label="Count" icon={<FactCheck fontSize="small" />} iconPosition="start" sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }} />
        <Tab value="sessions" label="Sessions" icon={<ListAlt fontSize="small" />} iconPosition="start" sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }} />
      </Tabs>
    );
  }
  const button = (view: View, label: string, icon: React.ReactNode) => (
    <Button
      variant={current === view ? 'contained' : 'outlined'}
      color={current === view ? 'primary' : 'inherit'}
      startIcon={icon}
      onClick={() => navigate(PATH[view])}
      aria-current={current === view ? 'page' : undefined}
      sx={{ textTransform: 'none', fontWeight: 800, minHeight: 48, borderColor: 'divider' }}
    >
      {label}
    </Button>
  );
  return (
    <>
      {/* Room at the end of the page so the fixed bar never covers the last row. */}
      <Box sx={{ height: 76, order: 99 }} aria-hidden />
      <Paper
        elevation={8}
        square
        sx={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: (t) => t.zIndex.appBar,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, p: 1, pb: 'max(8px, env(safe-area-inset-bottom))',
        }}
      >
        {button('count', 'Count', <FactCheck />)}
        {button('sessions', 'Sessions', <ListAlt />)}
      </Paper>
    </>
  );
}
