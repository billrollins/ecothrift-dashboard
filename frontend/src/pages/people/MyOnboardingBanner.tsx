import { Box, Button, LinearProgress, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getMyCheckins, getMyOnboarding } from '../../api/hiring.api';
import { dayText } from './peopleUi';

const DAY = 86_400_000;

/**
 * On Today: while a new hire's onboarding is in progress, how far along it is. Otherwise, a check-in coming up this
 * week, or one signed in the last two weeks to read.
 */
export function MyOnboardingBanner() {
  const query = useQuery({
    queryKey: ['hiring', 'my-onboarding'],
    queryFn: async () => (await getMyOnboarding()).data,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const checkins = useQuery({
    queryKey: ['hiring', 'my-checkins'],
    queryFn: async () => (await getMyCheckins()).data,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const o = query.data?.onboarding;
  const box = { mx: { xs: 1.5, md: 3 }, mt: 1.5, p: 1.5, borderRadius: '10px', bgcolor: '#e7f0ff', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' } as const;

  if (o && o.status === 'active') {
    const handbookToSign = Boolean(query.data?.handbook && !query.data.handbook.signed);
    return (
      <Box sx={box}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography fontWeight={700} sx={{ fontSize: 15 }}>
            Your onboarding: {o.done} of {o.total} done
            {handbookToSign ? ' · the handbook is ready to sign' : ''}
          </Typography>
          <LinearProgress variant="determinate" value={o.total ? (100 * o.done) / o.total : 0} sx={{ mt: 0.75, height: 6, borderRadius: 3 }} />
        </Box>
        <Button variant="contained" component={RouterLink} to="/onboarding">
          Open
        </Button>
      </Box>
    );
  }

  const now = Date.now();
  const rows = checkins.data ?? [];
  const soon = rows.find((c) => c.status === 'scheduled' && new Date(`${c.due_date}T12:00`).getTime() - now < 7 * DAY);
  const fresh = rows.find((c) => c.status === 'done' && c.signed_at && now - new Date(c.signed_at).getTime() < 14 * DAY);
  if (!soon && !fresh) return null;
  return (
    <Box sx={box}>
      <Typography fontWeight={700} sx={{ fontSize: 15, flex: 1, minWidth: 200 }}>
        {soon
          ? `Your ${soon.day}-day check-in with ${soon.manager?.name ?? 'your manager'} is around ${dayText(soon.due_date)}.`
          : `Your ${fresh!.day}-day check-in is signed. Read it any time.`}
      </Typography>
      <Button variant="contained" component={RouterLink} to="/check-ins">
        My check-ins
      </Button>
    </Box>
  );
}
