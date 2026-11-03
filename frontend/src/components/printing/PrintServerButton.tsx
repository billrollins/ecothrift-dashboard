/**
 * "Print server · v1.9.12 · Online" at the foot of the sidebar, under the Dash version (Bill, Dash Updates #9,
 * 2026-11-03). It opens the Printing window: the same Printing screen as Settings → Printing, on every page.
 */
import { useState } from 'react';
import { Box, ButtonBase, Dialog, DialogContent, DialogTitle, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import { IconClose as Close } from '../../icons/ecoIcons';
import { PrintingSurface } from './PrintingSurface';
import { usePrintServerState } from './usePrintServerState';

const LOOK = {
  online: { color: 'success.main', word: 'Online' },
  needs_update: { color: 'warning.main', word: 'Needs update' },
  offline: { color: 'error.main', word: 'Offline' },
} as const;

export function PrintServerButton() {
  const { state, checked, installed } = usePrintServerState();
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const look = LOOK[state];
  const words = !checked ? 'Checking…' : state === 'offline' ? look.word : `v${installed} · ${look.word}`;

  return (
    <>
      <ButtonBase
        onClick={() => setOpen(true)}
        aria-label={`Print server: ${words}. Open printing`}
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, px: 1, py: 0.25, borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: checked ? look.color : 'text.disabled', flexShrink: 0 }} />
        <Typography variant="caption" color="text.secondary" noWrap>
          Print server · {words}
        </Typography>
      </ButtonBase>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md" fullScreen={phone}>
        <DialogTitle sx={{ pr: 6 }}>
          Printing
          <IconButton aria-label="Close" onClick={() => setOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: 'grey.50' }}>
          <PrintingSurface />
        </DialogContent>
      </Dialog>
    </>
  );
}
