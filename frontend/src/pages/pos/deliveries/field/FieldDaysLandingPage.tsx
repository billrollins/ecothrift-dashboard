import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { useDeliveryDays } from '../../../../hooks/useDelivery';

export default function FieldDaysLandingPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const bucket = params.get('bucket');
  const listMode = bucket === 'past' || bucket === 'future';

  // Field phone QA uses named test datasets — always include them here.
  const { data: todayData, isLoading: todayLoading } = useDeliveryDays({
    bucket: 'today',
    page_size: 5,
    include_test: '1',
  });
  const { data: listData, isLoading: listLoading } = useDeliveryDays({
    bucket: listMode ? bucket : undefined,
    page_size: 50,
    include_test: '1',
  });
  const today = todayData?.results?.[0] ?? null;
  const list = listData?.results ?? [];

  if (listMode) {
    return (
      <Box>
        <Button component={RouterLink} to="/pos/deliveries/field/days" size="small" sx={{ mb: 1 }}>
          ← Today
        </Button>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
          {bucket === 'past' ? 'Past days' : 'Future days'}
        </Typography>
        {listLoading && <Typography color="text.secondary">Loading…</Typography>}
        <Stack spacing={1}>
          {list.map((day) => (
            <Card key={day.id} variant="outlined">
              <CardActionArea onClick={() => navigate(`/pos/deliveries/field/days/${day.id}`)}>
                <CardContent sx={{ py: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography fontWeight={700}>{day.date}</Typography>
                    <Chip size="small" label={day.display_state} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {day.delivery_count} deliveries · {day.items_booked} items
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
          {!listLoading && list.length === 0 && (
            <Typography color="text.secondary">No days found.</Typography>
          )}
        </Stack>
      </Box>
    );
  }

  return (
    <Box>
      {todayLoading && <Typography color="text.secondary">Loading…</Typography>}
      {!todayLoading && !today && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No delivery day for today yet.
        </Alert>
      )}
      {today && (
        <Card variant="outlined" sx={{ mb: 1.5 }}>
          <CardActionArea onClick={() => navigate(`/pos/deliveries/field/days/${today.id}`)}>
            <CardContent sx={{ py: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography fontWeight={700}>{today.date}</Typography>
                <Stack direction="row" spacing={0.5}>
                  {today.is_test && <Chip size="small" color="warning" label="TEST" />}
                  <Chip size="small" label={today.display_state} />
                </Stack>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {today.delivery_count} deliveries · {today.items_booked} items
              </Typography>
              <Typography variant="body2" color="primary" fontWeight={600} sx={{ mt: 1 }}>
                {today.display_state === 'planned' || today.display_state === 'active'
                  ? 'Open → Start Today'
                  : 'Open day'}
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>
      )}

      <Stack direction="row" spacing={1}>
        <Button
          fullWidth
          size="small"
          variant="outlined"
          component={RouterLink}
          to="/pos/deliveries/field/days?bucket=past"
        >
          Past
        </Button>
        <Button
          fullWidth
          size="small"
          variant="outlined"
          component={RouterLink}
          to="/pos/deliveries/field/days?bucket=future"
        >
          Future
        </Button>
      </Stack>
    </Box>
  );
}
