import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { getMyCheckins } from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { CheckInReadout, openCheckinPdf } from './checkinUi';
import { dayText, shortDate } from './peopleUi';

/** My check-ins: when the next ones are, and every signed one to read again. */
export default function MyCheckInsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const query = useQuery({ queryKey: ['hiring', 'my-checkins'], queryFn: async () => (await getMyCheckins()).data });
  if (query.isLoading) return <CircularProgress sx={{ m: 4 }} />;
  if (query.isError) return <Alert severity="error">Could not load your check-ins.</Alert>;
  const rows = query.data ?? [];
  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', p: { xs: 1.5, sm: 2 } }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
        My check-ins
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        You meet with your manager about 30, 60 and 90 days after you start. Each one you both sign shows up here.
      </Typography>
      {rows.length === 0 && <Alert severity="info">No check-ins scheduled.</Alert>}
      {rows.map((c) => (
        <Box key={c.id} sx={{ p: 2, mb: 1.5, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: c.status === 'done' ? 1.5 : 0 }}>
            <Typography fontWeight={700} sx={{ flex: 1 }}>
              {c.day}-day check-in
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {c.status === 'done' ? `Signed ${shortDate(c.signed_at)}` : `Around ${dayText(c.due_date)}`}
              {c.manager ? ` · with ${c.manager.name}` : ''}
            </Typography>
            {c.status === 'done' && c.has_pdf && (
              <Button size="small" onClick={() => openCheckinPdf(c.id, (m) => enqueueSnackbar(m, { variant: 'error' }))}>
                PDF
              </Button>
            )}
          </Box>
          {c.status === 'done' && c.form && c.answers && (
            <CheckInReadout form={c.form} answers={c.answers} employeeComments={c.employee_comments ?? ''} />
          )}
        </Box>
      ))}
    </Box>
  );
}
