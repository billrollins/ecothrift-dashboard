import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  ButtonGroup,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import {
  type DeliveryExperience,
  writeDeliveryExperiencePreference,
} from '../../../utils/delivery/experiencePreference';

type Props = {
  experience: DeliveryExperience;
};

export default function DeliveryExperienceLayout({ experience }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const base = `/pos/deliveries/${experience}`;
  const onTotal = location.pathname.includes('/total');
  const tab = onTotal ? 'total' : 'days';

  const switchExperience = (next: DeliveryExperience) => {
    writeDeliveryExperiencePreference(next);
    const suffix = onTotal ? 'total' : 'days';
    navigate(`/pos/deliveries/${next}/${suffix}`);
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 }, pb: { xs: 10, md: 2 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {experience === 'desk' ? 'Delivery Desk' : 'Delivery Field'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {experience === 'desk'
              ? 'Office planning, search, and review'
              : 'Mobile field workflow — calls, load, route, deliver'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <ButtonGroup size="small" variant="outlined">
            <Button
              variant={experience === 'desk' ? 'contained' : 'outlined'}
              onClick={() => switchExperience('desk')}
            >
              Desk
            </Button>
            <Button
              variant={experience === 'field' ? 'contained' : 'outlined'}
              onClick={() => switchExperience('field')}
            >
              Field
            </Button>
          </ButtonGroup>
          <Button
            size="small"
            component={RouterLink}
            to="/pos/deliveries/legacy"
            color="warning"
            variant="text"
          >
            Legacy board
          </Button>
        </Stack>
      </Stack>

      <Tabs
        value={tab}
        onChange={(_, value: string) => {
          navigate(`${base}/${value === 'total' ? 'total' : 'days'}`);
        }}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="days" label="Days" />
        <Tab value="total" label="Total Deliveries" />
      </Tabs>

      <Outlet />
    </Box>
  );
}
