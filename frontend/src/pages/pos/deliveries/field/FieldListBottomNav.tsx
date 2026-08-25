import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction } from '@mui/material';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import { deliveryListPath, isDeliveryTablePath } from '../deliveryPaths';

/**
 * Fixed bottom bar for Field Schedule / Table list pages.
 * Hidden on day-detail / run shell so the step rail owns the active-run chrome.
 */
export function FieldListBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const onTable = isDeliveryTablePath(location.pathname);
  const value = onTable ? 'table' : 'schedule';

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
        value="schedule"
        label="Schedule"
        icon={<CalendarMonthOutlined />}
        onClick={() => {
          if (onTable) navigate(deliveryListPath('field', 'schedule', location.search));
        }}
      />
      <BottomNavigationAction
        value="table"
        label="Table"
        icon={<TableChartOutlined />}
        onClick={() => {
          if (!onTable) navigate(deliveryListPath('field', 'table', location.search));
        }}
      />
    </BottomNavigation>
  );
}
