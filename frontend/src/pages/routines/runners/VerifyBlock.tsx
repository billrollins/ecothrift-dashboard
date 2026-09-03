import { Box, TextField, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import type { RoutineVerifyResponse, VerifyCheckResponse, VerifyContext } from '../../../api/routines.api';
import { useAuth } from '../../../hooks/useAuth';
import { pick, t } from '../../../i18n/routines';
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

function theirLine(row: VerifyCheckResponse, lang: string): string {
  const said = row.their_result === 'pass'
    ? t('pass', lang)
    : row.their_result === 'fail'
      ? t('fail', lang)
      : row.their_result === 'na'
        ? t('na', lang)
        : '-';
  return `${t('theySaid', lang)}: ${said}`;
}

/**
 * The handover, check by check. Every shift confirms the last one, so a
 * corner cut at closing is somebody's problem by ten the next morning.
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
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const missing = !context.run_id;
  const checks = value.checks?.length ? value.checks : context.checks || [];

  function patchCheck(checkId: string, patch: Partial<VerifyCheckResponse>) {
    onChange({
      run_id: context.run_id,
      checks: checks.map((row) => (row.check_id === checkId ? { ...row, ...patch } : row)),
    });
  }

  return (
    <>
      <RunnerBand title={t('verifyPrev', lang)} hint={`${context.routine_title}. ${lastShiftLine(context)}`} />
      <Box sx={{ mx: 1.25, mb: 0.5, minHeight: 18 }}>
        <Typography sx={{ fontSize: 12, color: missing ? dutyColors.red : dutyColors.ink40 }}>
          {lastShiftLine(context)}
        </Typography>
      </Box>
      {checks.map((row) => (
        <Box
          key={row.check_id}
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
          <Typography sx={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3, color: dutyColors.ink }}>
            {pick(row, 'label', lang) || row.label}
          </Typography>
          <Typography sx={{ fontSize: 12, color: dutyColors.ink40, mt: 0.35, minHeight: 16 }}>
            {theirLine(row, lang)}
          </Typography>
          <ChoiceRow
            value={row.result}
            disabled={readOnly}
            allowNa
            passLabel={t('pass', lang)}
            failLabel={t('fail', lang)}
            onChange={(result) => patchCheck(row.check_id, { result })}
          />
          <TextField
            value={row.note}
            onChange={(e) => patchCheck(row.check_id, { note: e.target.value })}
            disabled={readOnly || row.result !== 'fail'}
            placeholder={row.result === 'fail' ? t('yourCall', lang) : ' '}
            multiline
            minRows={2}
            fullWidth
            size="small"
            sx={{ mt: 1, ...runnerFieldSx }}
          />
        </Box>
      ))}
    </>
  );
}
