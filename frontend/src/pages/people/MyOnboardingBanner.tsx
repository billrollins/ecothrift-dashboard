import { Box, Button, LinearProgress, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getMyOnboarding } from '../../api/hiring.api';

/** On Today, while a new hire's onboarding is in progress: how far along it is, and a way in. */
export function MyOnboardingBanner() {
  const query = useQuery({
    queryKey: ['hiring', 'my-onboarding'],
    queryFn: async () => (await getMyOnboarding()).data,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const o = query.data?.onboarding;
  if (!o || o.status !== 'active') return null;
  const handbookToSign = Boolean(query.data?.handbook && !query.data.handbook.signed);
  return (
    <Box sx={{ mx: { xs: 1.5, md: 3 }, mt: 1.5, p: 1.5, borderRadius: '10px', bgcolor: '#e7f0ff', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
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
