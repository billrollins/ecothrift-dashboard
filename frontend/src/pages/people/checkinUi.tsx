import { Box, Chip, Typography } from '@mui/material';
import { getCheckinPdf, type CheckInAnswers, type CheckInForm } from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { errorText } from './peopleUi';

const RATING_COLOR: Record<string, 'success' | 'info' | 'warning' | 'default'> = {
  'Doing well': 'success',
  'On track': 'info',
  'Needs work': 'warning',
};

/** A signed check-in, read-only: the answers, each area's rating and note, and the employee's comments. */
export function CheckInReadout({
  form,
  answers,
  employeeComments,
}: {
  form: CheckInForm;
  answers: CheckInAnswers;
  employeeComments: string;
}) {
  return (
    <Box>
      {form.questions.map((q) => (
        <Box key={q.key} sx={{ mb: 1.5 }}>
          <Typography variant="caption" sx={{ color: ccTokens.ink2, fontWeight: 700 }}>
            {q.label}
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{answers.questions?.[q.key] || '—'}</Typography>
        </Box>
      ))}
      {form.areas.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" sx={{ color: ccTokens.ink2, fontWeight: 700 }}>
            Areas
          </Typography>
          {form.areas.map((area) => {
            const given = answers.areas?.[area];
            return (
              <Box key={area} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap', py: 0.25 }}>
                <Typography sx={{ fontSize: 14, minWidth: 220 }}>{area}</Typography>
                {given?.rating ? (
                  <Chip size="small" label={given.rating} color={RATING_COLOR[given.rating] ?? 'default'} />
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    not rated
                  </Typography>
                )}
                {given?.note && (
                  <Typography variant="body2" color="text.secondary">
                    {given.note}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      )}
      {form.pay_review && answers.pay?.decision && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" sx={{ color: ccTokens.ink2, fontWeight: 700 }}>
            Pay review
          </Typography>
          <Typography sx={{ fontWeight: 600 }}>
            {answers.pay.decision === 'raise'
              ? `Raise: $${answers.pay.current || '?'} to $${answers.pay.new_rate} an hour, starting ${new Date(
                  `${answers.pay.effective}T12:00`,
                ).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}`
              : `No change yet ($${answers.pay.current || '?'} an hour)`}
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{answers.pay.note}</Typography>
        </Box>
      )}
      <Typography variant="caption" sx={{ color: ccTokens.ink2, fontWeight: 700 }}>
        The employee&rsquo;s comments
      </Typography>
      <Typography sx={{ whiteSpace: 'pre-wrap' }}>{employeeComments || '—'}</Typography>
    </Box>
  );
}

export async function openCheckinPdf(id: number, onError: (msg: string) => void) {
  const popup = window.open('', '_blank');
  try {
    const { data } = await getCheckinPdf(id);
    const url = URL.createObjectURL(data);
    if (popup) popup.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    popup?.close();
    onError(errorText(err, 'Could not open the PDF.'));
  }
}
