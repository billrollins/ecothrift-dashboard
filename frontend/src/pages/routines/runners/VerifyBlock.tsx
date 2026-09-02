import { Box, TextField, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import type { RoutineVerifyResponse, VerifyContext } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { ChoiceRow } from './ChoiceRow';
import { RunnerBand, runnerFieldSx } from './runnerParts';

function lastShiftLine(context: VerifyContext): string {
  if (!context.run_id || !context.completed_at) return 'Nobody completed it.';
  const when = format(parseISO(context.completed_at), 'EEE h:mma');
  const who = context.completed_by_name || 'Someone';
  const fails = context.failed_count
    ? ` · ${context.failed_count} fail${context.failed_count === 1 ? '' : 's'}`
    : '';
  return `${who}, ${when}${fails}`;
}

/**
 * The handover. Every shift signs off the one before it, so a corner cut at
 * closing is somebody's problem by ten the next morning instead of nobody's
 * problem all week.
 *
 * A missing previous shift is not hidden. Saying "nobody completed it" and
 * still asking for a verdict is the point.
 */
export function VerifyBlock({
  context,
  value,
  onChange,
  readOnly,
}: {
  context: VerifyContext;
  value: RoutineVerifyResponse;
  onChange: (next: RoutineVerifyResponse) => void;
  readOnly?: boolean;
}) {
  const missing = !context.run_id;
  return (
    <>
      <RunnerBand title="Before you start" hint={`Check the last ${context.routine_title}.`} />
      <Box
        sx={{
          mx: 1.25,
          mb: 0.75,
          px: 1.5,
          py: 1.25,
          bgcolor: dutyColors.card,
          border: `1px solid ${dutyColors.ink08}`,
          borderLeft: `4px solid ${missing ? dutyColors.red : dutyColors.blue}`,
          borderRadius: '10px',
        }}
      >
        <Typography sx={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.3, color: dutyColors.ink }}>
          Was it done to standard?
        </Typography>
        <Typography sx={{ fontSize: 12, color: missing ? dutyColors.red : dutyColors.ink40, mt: 0.35, minHeight: 16 }}>
          {lastShiftLine(context)}
        </Typography>
        <ChoiceRow
          value={value.result}
          disabled={readOnly}
          passLabel="Yes"
          failLabel="No"
          onChange={(result) => onChange({ ...value, result, run_id: context.run_id })}
        />
        <TextField
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          disabled={readOnly || value.result !== 'fail'}
          placeholder={value.result === 'fail' ? 'What was left undone?' : 'Say what was wrong, if it was'}
          multiline
          minRows={2}
          fullWidth
          size="small"
          sx={{ mt: 1, ...runnerFieldSx }}
        />
      </Box>
    </>
  );
}
