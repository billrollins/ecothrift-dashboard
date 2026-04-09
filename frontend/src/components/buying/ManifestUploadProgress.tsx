import { Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import type { BuyingUploadManifestResponse } from '../../types/buying.types';

export type ManifestMappingPhase =
  | 'idle'
  | 'uploading'
  | 'mapping'
  | 'complete'
  | 'cancelled'
  | 'ai_unavailable';

interface ManifestUploadProgressProps {
  phase: ManifestMappingPhase;
  step1: BuyingUploadManifestResponse | null;
  isUploadPending: boolean;
  unmappedKeyCountStart: number;
  keysRemaining: number | null;
  totalCostUsd: number;
  latestMapping: string | null;
  showCancel: boolean;
  onCancel: () => void;
}

export function ManifestUploadProgress({
  phase,
  step1,
  isUploadPending,
  unmappedKeyCountStart,
  keysRemaining,
  totalCostUsd,
  latestMapping,
  showCancel,
  onCancel,
}: ManifestUploadProgressProps) {
  const showStep1Done = step1 != null && !isUploadPending;
  const showStep2 =
    step1 != null &&
    step1.unmapped_key_count > 0 &&
    (phase === 'mapping' || phase === 'complete' || phase === 'cancelled' || phase === 'ai_unavailable');

  const progressPct =
    unmappedKeyCountStart > 0 && keysRemaining != null
      ? Math.min(
          100,
          Math.max(0, ((unmappedKeyCountStart - keysRemaining) / unmappedKeyCountStart) * 100)
        )
      : 0;

  const mappedSoFar =
    unmappedKeyCountStart > 0 && keysRemaining != null ? unmappedKeyCountStart - keysRemaining : 0;

  if (phase === 'idle' && !isUploadPending && !showStep1Done) {
    return null;
  }

  return (
    <Box
      sx={{
        flexShrink: 0,
        p: 1.5,
        borderRadius: 1,
        bgcolor: 'action.hover',
        border: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
        Upload progress
      </Typography>

      <Stack spacing={1.25} sx={{ flex: 1, minHeight: 0 }}>
        <Box>
          {isUploadPending ? (
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="body2" color="text.secondary">
                Processing manifest…
              </Typography>
            </Stack>
          ) : showStep1Done && step1 ? (
            <Stack spacing={0.5}>
              <Typography variant="body2" color="success.main">
                ✓{' '}
                {step1.template_source === 'ai_created'
                  ? `New template created by AI — mapped columns; ${step1.rows_saved} rows saved`
                  : `Template matched: ${step1.template_display_name} — ${step1.rows_saved} rows saved`}
              </Typography>
            </Stack>
          ) : null}
        </Box>

        {showStep2 ? (
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {step1!.unmapped_key_count} unique category keys need AI mapping
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              {step1!.total_batches} batch(es) of up to 10 keys · Est. cost: ${totalCostUsd.toFixed(4)}
            </Typography>
            <LinearProgress variant="determinate" value={progressPct} sx={{ mb: 0.75, height: 8, borderRadius: 1 }} />
            <Typography variant="caption" color="text.secondary" display="block">
              {mappedSoFar}/{unmappedKeyCountStart} keys mapped
              {latestMapping ? ` · Latest: ${latestMapping}` : ''}
            </Typography>
            {phase === 'ai_unavailable' ? (
              <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                AI categorization unavailable. Configure ANTHROPIC_API_KEY to enable automatic category mapping.
              </Typography>
            ) : null}
            {phase === 'cancelled' ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Cancelled — some keys may still show as not yet categorized.
              </Typography>
            ) : null}
            {phase === 'complete' && step1!.unmapped_key_count > 0 ? (
              <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
                Complete: category mapping finished. Est. total ${totalCostUsd.toFixed(4)}
              </Typography>
            ) : null}
          </Box>
        ) : null}
      </Stack>

      {showCancel && phase === 'mapping' ? (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1.5, mt: 'auto' }}>
          <Button size="small" variant="outlined" color="inherit" onClick={onCancel}>
            Cancel mapping
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
