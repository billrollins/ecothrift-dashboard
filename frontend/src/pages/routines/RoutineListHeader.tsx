import { Box, Typography } from '@mui/material';
import { dutyColors } from '../../components/duty/tokens';
import { useAuth } from '../../hooks/useAuth';
import { t } from '../../i18n/routines';
import { RoutineViewToggle } from './RoutineViewToggle';

export function RoutineListHeader({
  view,
  onView,
  desktop,
  error,
}: {
  view: 'mine' | 'catalog';
  onView: (view: 'mine' | 'catalog') => void;
  /** Kept for callers; the desk title now lives in the page band. */
  desktop?: boolean;
  error?: string;
}) {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  // The catalog is a superuser tool (Admin > Routines); staff see their list only.
  const showToggle = Boolean(user?.is_superuser);
  return (
    <Box
      sx={{
        flex: '0 0 auto',
        px: 2.5,
        pt: 1.5,
        pb: 1.25,
        bgcolor: dutyColors.card,
        borderBottom: `1px solid ${dutyColors.ink15}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {showToggle ? (
            <RoutineViewToggle view={view} onChange={onView} />
          ) : (
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: dutyColors.ink }}>{t('toDoToday', lang)}</Typography>
          )}
        </Box>
      </Box>
      <Typography
        noWrap
        sx={{
          fontSize: 12.5,
          fontWeight: error ? 600 : 400,
          color: error ? dutyColors.red : dutyColors.ink60,
          mt: 1,
          minHeight: 18,
        }}
      >
        {error || ' '}
      </Typography>
    </Box>
  );
}
