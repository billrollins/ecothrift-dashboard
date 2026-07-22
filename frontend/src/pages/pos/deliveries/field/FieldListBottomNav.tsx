import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction } from '@mui/material';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import { useIncludeTestPreference } from '../../../../hooks/useIncludeTestPreference';

/**
 * Fixed bottom bar for Field Days / Total Deliveries list pages.
 * Matches open-day FieldBottomShortcuts visual language; separate so run shell
 * keeps its operational shortcuts without overlap.
 */
export function FieldListBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [includeTest, setIncludeTest] = useIncludeTestPreference();
  const onTotal = location.pathname.includes('/total');
  const value = onTotal ? 'deliveries' : 'days';

  return (
    <BottomNavigation
      showLabels
      value={value}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 12,
        borderTop: 1,
        borderColor: 'divider',
        pb: 'env(safe-area-inset-bottom)',
        '& .MuiBottomNavigationAction-root': {
          minWidth: 0,
          px: 1,
        },
        '& .Mui-selected': {
          color: 'primary.main',
        },
      }}
    >
      <BottomNavigationAction
        value="days"
        label="Days"
        icon={<CalendarMonthOutlined />}
        onClick={() => {
          if (onTotal) navigate(`/pos/deliveries/field/days${location.search}`);
        }}
      />
      <BottomNavigationAction
        value="deliveries"
        label="Deliveries"
        icon={<LocalShippingOutlined />}
        onClick={() => {
          if (!onTotal) navigate(`/pos/deliveries/field/total${location.search}`);
        }}
      />
      <BottomNavigationAction
        value={includeTest ? 'test-on' : 'test-off'}
        label={includeTest ? 'Test on' : 'Test'}
        icon={<ScienceOutlined />}
        onClick={() => setIncludeTest(!includeTest)}
        sx={{
          color: includeTest ? 'warning.dark' : undefined,
          '&.Mui-selected, &:not(.Mui-selected)': {
            color: includeTest ? 'warning.dark' : undefined,
          },
          '& .MuiBottomNavigationAction-label': {
            fontWeight: includeTest ? 700 : undefined,
          },
        }}
      />
    </BottomNavigation>
  );
}
