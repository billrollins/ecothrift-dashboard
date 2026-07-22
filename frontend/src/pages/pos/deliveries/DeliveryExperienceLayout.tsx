import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box, Button, useMediaQuery } from '@mui/material';
import type { DeliveryExperience } from '../../../utils/delivery/experiencePreference';

type Props = {
  experience: DeliveryExperience;
};

/**
 * Thin shell for Desk/Field delivery routes.
 * Experience is viewport-driven (no Desk/Field toggle). Field keeps chrome minimal.
 */
export default function DeliveryExperienceLayout({ experience }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width:767px)');
  const expected: DeliveryExperience = isMobile ? 'field' : 'desk';
  const onTotal = location.pathname.includes('/total');
  const onDayDetail = /\/days\/\d+/.test(location.pathname);

  if (experience !== expected) {
    // Preserve day detail id when flipping experiences.
    const dayMatch = location.pathname.match(/\/days\/(\d+)/);
    const target = dayMatch
      ? `/pos/deliveries/${expected}/days/${dayMatch[1]}`
      : `/pos/deliveries/${expected}/${onTotal ? 'total' : 'days'}`;
    return <Navigate to={target} replace />;
  }

  const toggleView = () => {
    navigate(`/pos/deliveries/${experience}/${onTotal ? 'days' : 'total'}`);
  };

  // Day detail (esp. Field run shell): no secondary chrome.
  if (onDayDetail && experience === 'field') {
    return (
      <Box sx={{ px: 1, pt: 0.5, pb: 'calc(8px + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        px: experience === 'field' ? 1 : { xs: 1.5, md: 2 },
        pt: experience === 'field' ? 0.5 : { xs: 1, md: 2 },
        pb: experience === 'field' ? 'calc(8px + env(safe-area-inset-bottom))' : 2,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          mb: experience === 'field' ? 0.75 : 1.5,
          minHeight: 28,
        }}
      >
        <Button
          size="small"
          variant="text"
          onClick={toggleView}
          sx={{
            minWidth: 0,
            px: 1,
            py: 0.25,
            fontSize: '0.8rem',
            fontWeight: 600,
            textTransform: 'none',
          }}
        >
          {onTotal ? 'Days' : 'Deliveries'}
        </Button>
      </Box>
      <Outlet />
    </Box>
  );
}
