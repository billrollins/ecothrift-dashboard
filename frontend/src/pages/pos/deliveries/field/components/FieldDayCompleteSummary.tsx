import { Box, Stack, Typography } from '@mui/material';
import CheckRounded from '@mui/icons-material/CheckRounded';
import type { DeliveryRun } from '../../../../../types/pos.types';
import { formatElapsed } from '../fieldRunUtils';
import { ecoField } from '../ecoFieldTheme';
import { FieldStepSummaryShell } from './FieldStepSummaryShell';

type Props = {
  run: DeliveryRun;
  onDone: () => void;
};

/** Shared terminal day summary for today (Finish) and past-day review. */
export function FieldDayCompleteSummary({ run, onDone }: Props) {
  const completed = (run.stops ?? []).filter((s) => s.state === 'completed').length;
  const photos = (run.stops ?? []).reduce(
    (count, s) => count + (s.attachments?.length ?? 0),
    run.truck_photos?.length ?? 0,
  );
  const signatures = (run.stops ?? []).filter((s) => s.has_signature).length;
  const returned = (run.stops ?? []).filter((s) => s.state !== 'completed').length;
  const issueCount = (run.stops ?? []).filter(
    (s) => s.state === 'failed' || Boolean(s.hold_reason),
  ).length;
  const evidence = [
    ...(run.truck_photos ?? []),
    ...(run.stops ?? []).flatMap((s) => s.attachments ?? []),
  ];

  return (
    <FieldStepSummaryShell
      header={
        <Box>
          <Typography
            variant="caption"
            fontWeight={800}
            sx={{ color: ecoField.muted, letterSpacing: '.1em', textTransform: 'uppercase' }}
          >
            {run.date}
          </Typography>
          <Typography variant="h4" fontWeight={800} sx={{ color: ecoField.greenDeep }}>
            Day complete
          </Typography>
        </Box>
      }
      primaryLabel="Done"
      onPrimary={onDone}
      showChevron={false}
    >
      <Box
        sx={{
          bgcolor: ecoField.tint,
          borderRadius: 3,
          p: 3,
          textAlign: 'center',
          border: `1.5px solid ${ecoField.green}`,
        }}
      >
        <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              bgcolor: ecoField.green,
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <CheckRounded sx={{ fontSize: 18 }} />
          </Box>
          <Typography fontWeight={800} sx={{ color: ecoField.greenDeep }}>
            Day complete
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 52, fontWeight: 800, color: ecoField.greenDeep, lineHeight: 1.05 }}>
          {completed} / {run.stops.length}
        </Typography>
        <Typography sx={{ color: ecoField.greenDeep, fontWeight: 650 }}>stops delivered</Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mt: 1.5 }}>
        {[
          [formatElapsed(run.elapsed_seconds), 'day duration'],
          [photos, 'photos captured'],
          [returned, 'returned / held'],
          [signatures || issueCount, signatures ? 'signatures' : 'issues'],
        ].map(([value, label]) => (
          <Box
            key={String(label)}
            sx={{
              border: `1.5px solid ${ecoField.line}`,
              borderRadius: `${18}px`,
              p: 2,
              bgcolor: ecoField.paper,
            }}
          >
            <Typography variant="h5" fontWeight={800}>
              {value}
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={650}>
              {label}
            </Typography>
          </Box>
        ))}
      </Box>

      {evidence.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography fontWeight={800} sx={{ mb: 1 }}>
            Evidence
          </Typography>
          <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 1 }}>
            {evidence.map((attachment) => (
              <Box
                key={attachment.id}
                component="img"
                src={attachment.url}
                alt={attachment.kind}
                sx={{
                  width: 86,
                  height: 86,
                  objectFit: 'cover',
                  borderRadius: 2,
                  flexShrink: 0,
                  bgcolor: ecoField.ink,
                }}
              />
            ))}
          </Stack>
        </Box>
      )}
    </FieldStepSummaryShell>
  );
}
