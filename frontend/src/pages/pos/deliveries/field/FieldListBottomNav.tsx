import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction } from '@mui/material';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';

/**
 * Fixed bottom bar for Field Days / Total Deliveries list pages.
 * Hidden on day-detail / run shell so the step rail owns the active-run chrome.
 */
export function FieldListBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
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
    </BottomNavigation>
  );
}
