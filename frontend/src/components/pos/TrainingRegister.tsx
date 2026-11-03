import { Box, Button, Dialog, Stack } from '@mui/material';
import { useTopBarBanner, useTopBarHost, type TopBarBanner } from '../layout/TopBarBanners';

/** Training register (owner, 2026-10-10): looks and acts exactly as on launch day, but nothing real is written. */

const STRIPES = 'repeating-linear-gradient(-45deg, #FFD400 0 22px, #111 22px 44px)';

const TRAINING_TOP_BAR: TopBarBanner = {
  kind: 'training',
  text: 'TRAINING REGISTER: NOT A REAL SALE',
  detail: 'Practice only. Do not take money. Do not run a real card.',
  shortText: 'PRACTICE: not a real sale',
  priority: 20,
  tone: 'danger',
};

/**
 * Always on: nobody can mistake this register for a real one. It sits in the top bar's empty space (Bill 2026-11-03:
 * "put this in unused space between logo and on Shift so it doesn't push content down"), so the page below looks
 * exactly like the real register. With no top bar (a test, a field phone), it shows above the page instead.
 */
export function TrainingBanner() {
  const hasHost = useTopBarHost();
  useTopBarBanner(hasHost ? TRAINING_TOP_BAR : null);
  if (hasHost) return null;
  return (
    <Box
      role="alert"
      data-testid="training-banner"
      sx={{ flexShrink: 0, background: STRIPES, p: '4px', borderRadius: 1, maxWidth: 640 }}
    >
      <Box
        sx={{
          bgcolor: '#C62828', color: '#fff', textAlign: 'center', borderRadius: 0.5, py: 0.25, px: 1.5,
          lineHeight: 1.15,
        }}
      >
        <Box sx={{ fontSize: { xs: 13, md: 18 }, fontWeight: 900, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>TRAINING REGISTER: NOT A REAL SALE</Box>
          <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>PRACTICE</Box>
        </Box>
        <Box sx={{ fontSize: { xs: 11, md: 13 }, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Practice only. Do not take money. Do not run a real card.</Box>
          <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Not a real sale</Box>
        </Box>
      </Box>
    </Box>
  );
}

/** The second warning, at payment: the practice sale finishes only after this. */
export function TrainingPaymentDialog({
  open,
  onFinish,
  onBack,
}: {
  open: boolean;
  onFinish: () => void;
  onBack: () => void;
}) {
  return (
    <Dialog open={open} fullScreen onClose={onBack} data-testid="training-payment-dialog">
      <Box
        sx={{
          flex: 1, display: 'grid', placeItems: 'center', p: 3, background: STRIPES,
        }}
      >
        <Box
          sx={{
            bgcolor: '#C62828', color: '#fff', borderRadius: 2, p: { xs: 3, md: 6 }, textAlign: 'center',
            maxWidth: 760, width: '100%', boxShadow: 8,
          }}
        >
          <Box sx={{ fontSize: { xs: 40, md: 64 }, fontWeight: 900, lineHeight: 1.05, mb: 2 }}>
            THIS IS JUST A TEST
          </Box>
          <Box sx={{ fontSize: { xs: 18, md: 22 }, fontWeight: 700, mb: 1 }}>
            No money changes hands on this register.
          </Box>
          <Box sx={{ fontSize: { xs: 16, md: 19 }, mb: 4, opacity: 0.95 }}>
            Give back any cash or card. Nothing is sold, no ThriftBucks are given, and it is left out of every report.
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
            <Button
              variant="contained"
              size="large"
              onClick={onFinish}
              sx={{ bgcolor: '#fff', color: '#C62828', fontWeight: 900, fontSize: 18, '&:hover': { bgcolor: '#FFE9E9' } }}
            >
              Finish practice sale
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={onBack}
              sx={{ color: '#fff', borderColor: '#fff', fontWeight: 700, fontSize: 18 }}
            >
              Go back
            </Button>
          </Stack>
        </Box>
      </Box>
    </Dialog>
  );
}
