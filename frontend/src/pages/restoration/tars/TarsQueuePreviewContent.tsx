import { Alert, Card, CardContent, Stack, Typography } from '@mui/material';

import QrCodeScanner from '@mui/icons-material/QrCodeScanner';

import type { RestorationJobDTO } from '../../../types/inventory.types';



interface TarsQueuePreviewContentProps {
  job: RestorationJobDTO;
}



/** Content below the item header when a check-in queue item is selected. */

export function TarsQueuePreviewContent({ job }: TarsQueuePreviewContentProps) {

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

      </CardContent>

    </Card>

  );

}


