import { Alert, Card, CardContent, Chip, Stack, Typography } from '@mui/material';

import QrCodeScanner from '@mui/icons-material/QrCodeScanner';

import type { RestorationJobDTO } from '../../../types/inventory.types';



interface TarsQueuePreviewContentProps {
  job: RestorationJobDTO;
}



/** Content below the item header when a check-in queue item is selected. */

export function TarsQueuePreviewContent({ job }: TarsQueuePreviewContentProps) {
  const handoff = job.processing_handoff;
  const unknowns =
    Array.isArray(handoff?.unknowns) ? handoff.unknowns
    : handoff?.unknowns ? [handoff.unknowns]
    : [];

  if (job.needs_setup) {

    return (

      <Card variant="outlined">

        <CardContent sx={{ py: 1.25, px: 1.25, '&:last-child': { pb: 1.25 } }}>

          <Alert severity="warning" sx={{ py: 0.75 }}>

            <Typography variant="body2" fontWeight={800}>

              Needs processing prices

            </Typography>

            <Typography variant="caption">

              A processor must enter grade values before this item can go to the bench.

            </Typography>

          </Alert>

        </CardContent>

      </Card>

    );

  }



  return (

    <Card variant="outlined">

      <CardContent sx={{ py: 1.25, px: 1.25, '&:last-child': { pb: 1.25 } }}>

        <Alert severity="info" icon={<QrCodeScanner fontSize="small" />} sx={{ py: 0.75 }}>
          <Stack spacing={0.35}>
            <Typography variant="body2" fontWeight={900}>
              Scan this item&apos;s tag to move it to the bench
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Or use Check in to bench in the header above.
            </Typography>
          </Stack>
        </Alert>
        <Stack spacing={0.65} sx={{ mt: 1 }}>
          <Typography variant="overline" fontWeight={800} color="text.secondary">
            Processing handoff
          </Typography>
          {handoff ? <>
              <Chip
                size="small"
                sx={{ alignSelf: 'flex-start' }}
                label={`Tested status: ${handoff.tested_status.replace(/_/g, ' ')}`}
              />
              {handoff.condition_evidence ?
                <Typography variant="body2"><strong>Evidence:</strong> {handoff.condition_evidence}</Typography>
              : null}
              {unknowns.length ?
                <Typography variant="body2"><strong>Unknowns:</strong> {unknowns.join('; ')}</Typography>
              : null}
              {handoff.quick_tests?.length ?
                <Stack direction="row" gap={0.5} flexWrap="wrap">
                  {handoff.quick_tests.map((test, index) => (
                    <Chip
                      key={`${test.test_id ?? test.name ?? 'test'}-${index}`}
                      size="small"
                      variant="outlined"
                      label={`${test.name ?? test.test_id ?? 'Quick test'}: ${test.result.replace(/_/g, ' ')}`}
                    />
                  ))}
                </Stack>
              : null}
            </>
          : <Typography variant="body2" color="text.secondary">
              No structured handoff saved. Mike will verify the item at the bench.
            </Typography>}
        </Stack>

      </CardContent>

    </Card>

  );

}


