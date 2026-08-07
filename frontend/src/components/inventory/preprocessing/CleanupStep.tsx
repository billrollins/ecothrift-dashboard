import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Typography } from '@mui/material';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import ExpandMore from '@mui/icons-material/ExpandMore';
import type { CleanupCsvApplyRowPayload, CleanupCsvSoftWarning } from '../../../api/inventory.api';
import { RowProcessingPanel } from '../RowProcessingPanel';
import { WebAiCleanupPanel } from './WebAiCleanupPanel';

interface CleanupStepProps {
  orderId: number;
  orderNumber: string;
  standardizedRowCount: number;
  cleanedRowCount: number;
  completedStep: number;
  expectedRowIds: Set<number>;
  rowNumberById: Record<number, number>;
  validatedPayload: CleanupCsvApplyRowPayload[] | null;
  onValidatedPayloadChange: (rows: CleanupCsvApplyRowPayload[] | null) => void;
  lastApplySoftWarnings?: CleanupCsvSoftWarning[] | null;
  onDismissApplyWarnings?: () => void;
}

export function CleanupStep({
  orderId,
  orderNumber,
  standardizedRowCount,
  cleanedRowCount,
  completedStep,
  expectedRowIds,
  rowNumberById,
  validatedPayload,
  onValidatedPayloadChange,
  lastApplySoftWarnings,
  onDismissApplyWarnings,
}: CleanupStepProps) {
  const cleanupComplete = standardizedRowCount > 0 && cleanedRowCount >= standardizedRowCount;

  return (
    <Box>
      {cleanupComplete && (
        <Alert severity="success" icon={<CheckCircleOutline />} sx={{ mb: 2 }}>
          AI Cleanup complete - all {standardizedRowCount} row(s) cleaned.
        </Alert>
      )}
      {!cleanupComplete && validatedPayload && validatedPayload.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          CSV validated - {validatedPayload.length} rows ready. Click <strong>Run Cleanup</strong> in the toolbar to apply changes to preprocessing rows.
        </Alert>
      )}
      <WebAiCleanupPanel orderId={orderId} />
      <Accordion disableGutters elevation={0} sx={{ border: '1px solid #DDD5C9', borderRadius: '8px', '&::before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#1B4332' }}>
            Advanced - Offline CSV cleanup (Grok fallback)
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <RowProcessingPanel
            orderId={orderId}
            orderNumber={orderNumber}
            rowCount={standardizedRowCount}
            expectedRowIds={expectedRowIds}
            rowNumberById={rowNumberById}
            validatedPayload={validatedPayload}
            onValidatedPayloadChange={onValidatedPayloadChange}
            lastApplySoftWarnings={lastApplySoftWarnings}
            onDismissApplyWarnings={onDismissApplyWarnings}
          />
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
