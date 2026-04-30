import { Alert, Box } from '@mui/material';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import type { CleanupCsvApplyRowPayload } from '../../../api/inventory.api';
import { RowProcessingPanel } from '../RowProcessingPanel';

interface CleanupStepProps {
  orderId: number;
  orderNumber: string;
  standardizedRowCount: number;
  cleanedRowCount: number;
  completedStep: number;
  expectedRowIds: Set<number>;
  validatedPayload: CleanupCsvApplyRowPayload[] | null;
  onValidatedPayloadChange: (rows: CleanupCsvApplyRowPayload[] | null) => void;
}

export function CleanupStep({
  orderId,
  orderNumber,
  standardizedRowCount,
  cleanedRowCount,
  completedStep,
  expectedRowIds,
  validatedPayload,
  onValidatedPayloadChange,
}: CleanupStepProps) {
  const cleanupComplete = standardizedRowCount > 0 && cleanedRowCount >= standardizedRowCount;

  return (
    <Box>
      {cleanupComplete && (
        <Alert severity="success" icon={<CheckCircleOutline />} sx={{ mb: 2 }}>
          AI Cleanup complete — all {standardizedRowCount} row(s) cleaned.
        </Alert>
      )}
      {!cleanupComplete && validatedPayload && validatedPayload.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          CSV validated — {validatedPayload.length} rows ready. Click <strong>Run Cleanup</strong> in the toolbar to apply changes to preprocessing rows.
        </Alert>
      )}
      <RowProcessingPanel
        orderId={orderId}
        orderNumber={orderNumber}
        rowCount={standardizedRowCount}
        expectedRowIds={expectedRowIds}
        validatedPayload={validatedPayload}
        onValidatedPayloadChange={onValidatedPayloadChange}
      />
    </Box>
  );
}
