import { Box, Chip, Stack } from '@mui/material';
import { PageHeader } from '../../../components/common/PageHeader';
import { TarsBenchPanel } from './TarsBenchPanel';
import { TarsExecutePanel } from './TarsExecutePanel';

/** TARS bench and verb queues (mock — not redesigned yet). */
export default function TarsPage() {
  return (
    <Box>
      <PageHeader
        title="TARS"
        subtitle="Check in, evaluate paths, and work verb queues."
        action={
          <Chip label="Phase 0 — client mock" size="small" variant="outlined" color="warning" />
        }
      />
      <Stack spacing={4}>
        <TarsBenchPanel />
        <TarsExecutePanel />
      </Stack>
    </Box>
  );
}
