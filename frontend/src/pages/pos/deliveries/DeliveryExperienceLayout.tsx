import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box, Button, useMediaQuery } from '@mui/material';
import type { DeliveryExperience } from '../../../utils/delivery/experiencePreference';
import { FieldListBottomNav } from './field/FieldListBottomNav';

type Props = {
  experience: DeliveryExperience;
};

/**
 * Thin shell for Desk/Field delivery routes.
 * Experience is viewport-driven (no Desk/Field toggle).
 * Field list pages use a bottom Days/Deliveries bar; open-day keeps its own shortcuts.
 */
export default function DeliveryExperienceLayout({ experience }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width:767px)');
  const expected: DeliveryExperience = isMobile ? 'field' : 'desk';
  const onTotal = location.pathname.includes('/total');
  const onDayDetail = /\/days\/\d+/.test(location.pathname);
  const showFieldListBar = experience === 'field' && !onDayDetail;

  if (experience !== expected) {
    // Preserve day detail id + query (bucket, q) when flipping experiences.
    const dayMatch = location.pathname.match(/\/days\/(\d+)/);
    const target = dayMatch
      ? `/pos/deliveries/${expected}/days/${dayMatch[1]}`
      : `/pos/deliveries/${expected}/${onTotal ? 'total' : 'days'}`;
    return <Navigate to={`${target}${location.search}`} replace />;
  }

  const toggleView = () => {
    navigate(`/pos/deliveries/${experience}/${onTotal ? 'days' : 'total'}${location.search}`);
  };

  // Field day detail / run shell: no list chrome (run shell owns bottom shortcuts).
  if (onDayDetail && experience === 'field') {
    return (
      <Box sx={{ px: 1, pt: 0.5, pb: 'calc(8px + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </Box>
    );
  }

  // Field list/search: bottom nav only — no wasteful top Days/Deliveries links.
  if (showFieldListBar) {
    return (
      <Box
        sx={{
          px: 1,
          pt: 0.5,
          // Clear fixed BottomNavigation (~56px) + home indicator.
          pb: 'calc(72px + env(safe-area-inset-bottom))',
        }}
      >
        <Outlet />
        <FieldListBottomNav />
      </Box>
    );
  }

  // Desk: compact Days/Deliveries control.
  return (
    <Box
      sx={{
        px: { xs: 1.5, md: 2 },
        pt: { xs: 1, md: 2 },
        pb: 2,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 0.5,
          mb: 1.5,
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
