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
  row,
}: {
  onBreak: boolean;
  pendingBreak: boolean;
  pendingClockOut: boolean;
  onToggleBreak: () => void;
  onClockOut: () => void;
  lang: string;
  row?: boolean;
}) {
  return (
    <Stack direction={row ? 'row' : 'column'} spacing={1}>
      <Button
        variant={onBreak ? 'contained' : 'outlined'}
        color="warning"
        startIcon={onBreak ? <PlayCircleOutline /> : <FreeBreakfast />}
        onClick={onToggleBreak}
        disabled={pendingBreak}
        sx={{ height: 56, flex: row ? 1 : undefined }}
      >
        {t(onBreak ? 'endBreak' : 'takeBreak', lang)}
      </Button>
      <Button
        variant="contained"
        color="error"
        startIcon={<Stop />}
        onClick={onClockOut}
        disabled={pendingClockOut || onBreak}
        sx={{ height: 56, flex: row ? 1 : undefined }}
      >
        {t('clockOut', lang)}
      </Button>
    </Stack>
  );
}
