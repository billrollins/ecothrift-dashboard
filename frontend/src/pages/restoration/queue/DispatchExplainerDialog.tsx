/**
 * Why this Dispatch choice cannot happen yet, and what to do instead.
 *
 * Always a modal. Putting this on the card would shove the row the hand is
 * already travelling toward.
 */
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { studio } from '../tars/studio/tarsStudioTheme';
import type { DispatchExplainer } from './queueDispatch';

export function DispatchExplainerDialog({
  open,
  explainer,
  onClose,
}: {
  open: boolean;
  explainer: DispatchExplainer | null;
  onClose: () => void;
}) {
  const title = explainer?.title ?? '';
  const whyNot = explainer?.whyNot ?? '';
  const steps = explainer?.steps ?? [];
  const occupyingSku = explainer?.occupyingSku;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 950 }}>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Box>
            <Typography
              sx={{
                fontSize: '0.62rem',
                fontWeight: 800,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                color: studio.inkLabel,
                mb: 0.4,
              }}
            >
              Why not
            </Typography>
            <Typography variant="body2" sx={{ color: studio.ink }}>
              {whyNot}
            </Typography>
          </Box>

          {occupyingSku ? (
            <Typography
              sx={{
                fontFamily: 'monospace',
                fontWeight: 900,
                fontSize: '0.85rem',
                color: studio.accentDark,
              }}
            >
              {occupyingSku}
            </Typography>
          ) : null}

          <Box>
            <Typography
              sx={{
                fontSize: '0.62rem',
                fontWeight: 800,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                color: studio.inkLabel,
                mb: 0.6,
              }}
            >
              What to do
            </Typography>
            <Box component="ol" sx={{ m: 0, pl: 2.25 }}>
              {steps.map((step) => (
                <Typography key={step} component="li" variant="body2" sx={{ color: studio.ink, mb: 0.4 }}>
                  {step}
                </Typography>
              ))}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button variant="contained" onClick={onClose} autoFocus sx={{ minWidth: 110, fontWeight: 800 }}>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
