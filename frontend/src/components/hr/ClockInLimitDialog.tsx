import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { t } from '../../i18n/routines';
import { dutyColors } from '../duty/tokens';

/**
 * Clocking in at the weekly limit. No overtime is approved, so it says so and asks; it never
 * blocks, because the hours can be wrong (a forgotten clock-out) and a manager may say yes.
 */
export function ClockInLimitDialog({
  open,
  lang,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  lang: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ color: dutyColors.red, fontWeight: 800 }}>{t('atLimitClockIn', lang)}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 14, color: dutyColors.ink60 }}>{t('atLimitClockInHelp', lang)}</Typography>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onCancel}>{t('cancel', lang)}</Button>
        <Button color="error" disabled={busy} onClick={onConfirm}>{t('clockInAnyway', lang)}</Button>
      </DialogActions>
    </Dialog>
  );
}
