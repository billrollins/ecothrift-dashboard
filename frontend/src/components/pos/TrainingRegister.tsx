import { Box, Button, Dialog, Stack } from '@mui/material';

/** Training register (owner, 2026-10-10): looks and acts exactly as on launch day, but nothing real is written. */

const STRIPES = 'repeating-linear-gradient(-45deg, #FFD400 0 22px, #111 22px 44px)';

/** Always on: nobody can mistake this register for a real one. */
export function TrainingBanner() {
  return (
    <Box
      role="alert"
      data-testid="training-banner"
      sx={{ flexShrink: 0, background: STRIPES, p: '6px' }}
    >
      <Box
        sx={{
          bgcolor: '#C62828', color: '#fff', textAlign: 'center', borderRadius: 1, py: 1, px: 2,
          lineHeight: 1.2,
        }}
      >
        <Box sx={{ fontSize: { xs: 22, md: 30 }, fontWeight: 900, letterSpacing: '0.04em' }}>
          TRAINING REGISTER: NOT A REAL SALE
        </Box>
        <Box sx={{ fontSize: { xs: 14, md: 17 }, fontWeight: 700 }}>
          Practice only. Do not take money. Do not run a real card.
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
