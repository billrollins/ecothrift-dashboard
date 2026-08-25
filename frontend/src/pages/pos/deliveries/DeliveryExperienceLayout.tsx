import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Box, useMediaQuery } from '@mui/material';
import type { DeliveryExperience } from '../../../utils/delivery/experiencePreference';
import { FieldListBottomNav } from './field/FieldListBottomNav';
import {
  deliveryDayIdFromPath,
  deliveryDayPath,
  deliveryListPath,
  isDeliveryDayDetailPath,
  isDeliveryTablePath,
} from './deliveryPaths';

type Props = {
  experience: DeliveryExperience;
};

/**
 * Thin shell for Desk/Field delivery routes.
 * Experience is viewport-driven (no Desk/Field toggle).
 * Desk switches Schedule/Table from the sidebar. Field list pages keep a
 * bottom bar so a phone can change page without opening the drawer.
 */
export default function DeliveryExperienceLayout({ experience }: Props) {
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width:767px)');
  const expected: DeliveryExperience = isMobile ? 'field' : 'desk';
  const onTable = isDeliveryTablePath(location.pathname);
  const onDayDetail = isDeliveryDayDetailPath(location.pathname);
  const showFieldListBar = experience === 'field' && !onDayDetail;

  if (experience !== expected) {
    const dayId = deliveryDayIdFromPath(location.pathname);
    const target = dayId
      ? deliveryDayPath(expected, dayId)
      : deliveryListPath(expected, onTable ? 'table' : 'schedule');
    return <Navigate to={`${target}${location.search}`} replace />;
  }

  if (onDayDetail && experience === 'field') {
    return (
      <Box sx={{ px: 1, pt: 0.5, pb: 'calc(8px + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </Box>
    );
  }

  if (showFieldListBar) {
    return (
      <Box
        sx={{
          px: 1,
          pt: 0.5,
          pb: 'calc(72px + env(safe-area-inset-bottom))',
        }}
      >
        <Outlet />
        <FieldListBottomNav />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        px: { xs: 1.5, md: 2 },
        pt: { xs: 1, md: 2 },
        pb: 2,
      }}
    >
      <Outlet />
    </Box>
  );
}
