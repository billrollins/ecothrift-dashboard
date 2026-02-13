import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Button,
  Typography,
  TextField,
  Grid,
} from '@mui/material';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Stop from '@mui/icons-material/Stop';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useCurrentEntry, useClockIn, useClockOut } from '../../hooks/useTimeClock';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';

export default function TimeClockPage() {
  const { data: currentEntry, isLoading } = useCurrentEntry();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const { enqueueSnackbar } = useSnackbar();
  const [breakMinutes, setBreakMinutes] = useState<string>('0');

  const isClockedIn = !!currentEntry;

  const handleClockIn = async () => {
    try {
      await clockIn.mutateAsync({});
      enqueueSnackbar('Clocked in successfully', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to clock in', { variant: 'error' });
    }
  };

  const handleClockOut = async () => {
    if (!currentEntry) return;
    const mins = parseInt(breakMinutes, 10) || 0;
    try {
      await clockOut.mutateAsync({ id: currentEntry.id, breakMinutes: mins });
      enqueueSnackbar('Clocked out successfully', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to clock out', { variant: 'error' });
    }
  };

  if (isLoading) return <LoadingScreen message="Loading..." />;

  const todayHours = currentEntry?.total_hours ?? null;

  return (
    <Box>
      <PageHeader title="Time Clock" subtitle="Clock in and out for your shift" />

      <Grid container spacing={3} justifyContent="center">
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 6 }}>
              {isClockedIn ? (
                <>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    Currently clocked in
                  </Typography>
                  <Typography variant="body1" color="success.main" fontWeight={600} gutterBottom>
                    Since {currentEntry.clock_in ? format(new Date(currentEntry.clock_in), 'h:mm a') : '—'}
                  </Typography>
                  {todayHours && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Today's hours: {todayHours}
                    </Typography>
                  )}
                  <Box sx={{ mt: 3, mb: 2 }}>
                    <TextField
                      label="Break minutes"
                      type="number"
                      value={breakMinutes}
                      onChange={(e) => setBreakMinutes(e.target.value)}
                      inputProps={{ min: 0 }}
                      size="small"
                      sx={{ width: 140, mr: 2 }}
                    />
                  </Box>
                  <Button
                    variant="contained"
                    color="error"
                    size="large"
                    startIcon={<Stop />}
                    onClick={handleClockOut}
                    disabled={clockOut.isPending}
                    sx={{ px: 4 }}
                  >
                    {clockOut.isPending ? 'Clocking out...' : 'Clock Out'}
                  </Button>
                </>
              ) : (
                <>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    Ready to start?
                  </Typography>
                  <Button
                    variant="contained"
                    color="success"
                    size="large"
                    startIcon={<PlayArrow />}
                    onClick={handleClockIn}
                    disabled={clockIn.isPending}
                    sx={{ mt: 2, px: 4 }}
                  >
                    {clockIn.isPending ? 'Clocking in...' : 'Clock In'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
