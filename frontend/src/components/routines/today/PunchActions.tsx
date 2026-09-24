import FreeBreakfast from '@mui/icons-material/FreeBreakfast';
import PlayCircleOutline from '@mui/icons-material/PlayCircleOutline';
import Stop from '@mui/icons-material/Stop';
import { Button, Stack } from '@mui/material';
import { t } from '../../../i18n/routines';

export function PunchActions({
  onBreak,
  pendingBreak,
  pendingClockOut,
  onToggleBreak,
  onClockOut,
  lang,
}: {
  onBreak: boolean;
  pendingBreak: boolean;
  pendingClockOut: boolean;
  onToggleBreak: () => void;
  onClockOut: () => void;
  lang: string;
  /** Kept for callers; the two buttons always sit side by side now. */
  row?: boolean;
}) {
  return (
    <Stack direction="row" spacing={1}>
      <Button
        variant={onBreak ? 'contained' : 'outlined'}
        color="warning"
        startIcon={onBreak ? <PlayCircleOutline /> : <FreeBreakfast />}
        onClick={onToggleBreak}
        disabled={pendingBreak}
        sx={{ height: 48, flex: 1 }}
      >
        {t(onBreak ? 'endBreak' : 'takeBreak', lang)}
      </Button>
      <Button
        variant="contained"
        color="error"
        startIcon={<Stop />}
        onClick={onClockOut}
        disabled={pendingClockOut || onBreak}
        sx={{ height: 48, flex: 1 }}
      >
        {t('clockOut', lang)}
      </Button>
    </Stack>
  );
}
