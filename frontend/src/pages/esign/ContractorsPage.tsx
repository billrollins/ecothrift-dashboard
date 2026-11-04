/**
 * Contractors (/admin/contractors; Dash Updates #21, initiative contractor_agreements). The owner fills in the
 * contractor agreement from its template and sends it; the contractor signs on a phone from a single-use link (no
 * Dash account); the owner countersigns; both get the same PDF with its audit page. Owner only and kept off the staff
 * side: a contractor never gets an employee record, onboarding, schedule, time clock or login.
 */
import { Box, Typography } from '@mui/material';
import DocumentsPage from './DocumentsPage';
import { CONTRACTOR_SCOPE } from './scope';

export default function ContractorsPage() {
  return (
    <Box data-testid="contractors-page">
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>Contractors</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Agreements to e-sign. The contractor signs by a private link, then you countersign. Only you see this page.
      </Typography>
      <DocumentsPage scope={CONTRACTOR_SCOPE} />
    </Box>
  );
}

