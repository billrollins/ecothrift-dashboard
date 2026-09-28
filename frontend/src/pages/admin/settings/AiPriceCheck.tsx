import { LinearProgress, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getAiPriceCheck } from '../../../api/aiSettings.api';

/** While Update gets prices for newly added models: one quiet line, then the table shows them. */
export function AiPriceCheck() {
  const queryClient = useQueryClient();
  const check = useQuery({
    queryKey: ['ai-settings', 'price-check'],
    queryFn: getAiPriceCheck,
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 5000 : false),
  });
  const finished = check.data?.status === 'done' ? check.data.finished_at : undefined;
  useEffect(() => {
    if (finished) void queryClient.invalidateQueries({ queryKey: ['ai-settings', 'models'] });
  }, [finished, queryClient]);
  if (check.data?.status !== 'running') return null;
  return (
    <>
      <LinearProgress sx={{ mb: 0.5 }} />
      <Typography variant="caption" color="text.secondary">Getting prices for the new models...</Typography>
    </>
  );
}
