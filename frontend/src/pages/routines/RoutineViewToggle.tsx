import { Box, Button } from '@mui/material';
import { dutyColors } from '../../components/duty/tokens';
import { useAuth } from '../../hooks/useAuth';
import { t } from '../../i18n/routines';

export function RoutineViewToggle({
  view,
  onChange,
}: {
  view: 'mine' | 'catalog';
  onChange: (view: 'mine' | 'catalog') => void;
}) {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  return (
    <Box
      sx={{
        display: 'flex',
        height: 40,
        p: '3px',
        borderRadius: '10px',
        bgcolor: dutyColors.ink08,
      }}
    >
      {([
        ['mine', t('myRoutines', lang)],
        ['catalog', t('catalog', lang)],
      ] as const).map(([id, label]) => {
        const selected = view === id;
        return (
          <Button
            key={id}
            onClick={() => onChange(id)}
            sx={{
              flex: 1,
              height: 34,
              minWidth: 0,
              borderRadius: '8px',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.01em',
              color: selected ? '#fff' : dutyColors.ink60,
              bgcolor: selected ? dutyColors.brand : 'transparent',
              boxShadow: selected ? '0 1px 3px rgba(27,94,32,0.28)' : 'none',
              '&:hover': { bgcolor: selected ? dutyColors.brandDark : 'rgba(46,125,50,0.08)' },
            }}
          >
            {label}
          </Button>
        );
      })}
    </Box>
  );
}
