import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { RoutineRun } from '../../api/routines.api';
import { useAuth } from '../../hooks/useAuth';
import { pick, t } from '../../i18n/routines';
import { todayHref } from '../../pages/routines/todayRunner';
import { dueState, workLabel, workState } from '../../pages/routines/myWork';
import { StatusTag } from '../duty/StatusTag';
import { dutyColors } from '../duty/tokens';
import { STATE_BORDER, STATE_TAG } from './MyWorkList';

/**
 * The last word before someone walks out: the same "to do today" list as Today, in the same
 * words. It warns and never blocks; a shift can end for reasons the app knows nothing about.
 */
export function ClockOutRoutineGuard({
  runs,
  open,
  onClose,
  onClockOut,
  busy,
}: {
  runs: RoutineRun[];
  open: boolean;
  onClose: () => void;
  onClockOut: () => void;
  busy?: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        {t('stillOwed', lang)} ({runs.length})
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, color: dutyColors.ink60, mb: 1.5 }}>
          {t('stillOwedHelp', lang)}
        </Typography>
        {runs.map((run) => {
          const state = workState(run);
          return (
            <Box
              key={run.id}
              component="button"
              type="button"
              onClick={() => {
                onClose();
                navigate(todayHref(run.href || `/routines/run/${run.id}`));
              }}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 0.75,
                px: 1.5,
                py: 1.25,
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: '10px',
                border: `1px solid ${STATE_BORDER[state]}`,
                bgcolor: dutyColors.card,
                '&:hover': { borderColor: dutyColors.brand, bgcolor: dutyColors.brandTint },
              }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontSize: 14, fontWeight: 650, color: dutyColors.ink }}>
                  {pick(run, 'title', lang) || run.title}
                </Typography>
                {run.section_name || run.subject ? (
                  <Typography noWrap sx={{ fontSize: 12, color: dutyColors.ink60 }}>
                    {run.section_name || run.subject}
                  </Typography>
                ) : null}
              </Box>
              <StatusTag small label={workLabel(run, dueState(run), lang)} tone={STATE_TAG[state]} />
            </Box>
          );
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('doThemNow', lang)}</Button>
        <Button color="error" disabled={busy} onClick={onClockOut}>
          {t('clockOutAnyway', lang)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
