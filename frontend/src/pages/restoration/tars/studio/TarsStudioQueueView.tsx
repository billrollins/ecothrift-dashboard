import PlayArrow from '@mui/icons-material/PlayArrow';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import type { RestorationJobDTO } from '../../../../types/inventory.types';
import { StudioSurface } from './TarsStudioPrimitives';
import { studio } from './tarsStudioTheme';

export function TarsStudioQueueView({
  job,
  onCheckIn,
  busy,
}: {
  job: RestorationJobDTO;
  onCheckIn: () => void;
  busy?: boolean;
}) {
  const handoff = job.processing_handoff;
  const unknowns = Array.isArray(handoff?.unknowns)
    ? handoff.unknowns
    : handoff?.unknowns ? [handoff.unknowns] : [];

  return (
    <StudioSurface sx={{ p: 1, height: '100%' }}>
      <Typography variant="caption" sx={{ color: studio.accentDark, fontWeight: 900 }}>
        Inbox
      </Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 900, lineHeight: 1.2 }}>{job.name}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {job.items[0]?.sku ?? job.sku} · {job.scale} · {job.purchase_order_number}
      </Typography>

      <Box
        sx={{
          px: 1,
          py: 0.75,
          mb: 1,
          borderRadius: `${studio.radius.sm}px`,
          bgcolor: studio.accentSoft,
          border: `1px solid ${studio.accentSoftBorder}`,
          minHeight: 56,
        }}
      >
        {handoff ?
          <>
            <Stack direction="row" gap={0.5} flexWrap="wrap">
              <Chip size="small" label={handoff.tested_status.replace(/_/g, ' ')} sx={{ height: 22, fontWeight: 800 }} />
              {handoff.quick_tests?.slice(0, 3).map((test, i) => (
                <Chip key={i} size="small" variant="outlined" label={`${test.name ?? test.test_id}: ${test.result}`} sx={{ height: 22 }} />
              ))}
            </Stack>
            {handoff.condition_evidence ?
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>{handoff.condition_evidence}</Typography>
            : null}
            {unknowns.length ?
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                Unknowns: {unknowns.join('; ')}
              </Typography>
            : null}
          </>
        :
          <Typography variant="caption" color="text.secondary">No Processing handoff on file.</Typography>
        }
      </Box>

      <Button
        variant="contained"
        size="small"
        startIcon={<PlayArrow />}
        disabled={busy}
        onClick={onCheckIn}
        sx={{
          fontWeight: 900,
          bgcolor: studio.accent,
          '&:hover': { bgcolor: studio.accentDark },
        }}
      >
        {job.needs_setup ? 'Check in (values missing)' : 'Check in to workbench'}
      </Button>
      {job.needs_setup ? (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: '#b45309', fontWeight: 700 }}>
          Grade values incomplete — you can still open the item and request valuations.
        </Typography>
      ) : null}
    </StudioSurface>
  );
}
