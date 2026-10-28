/**
 * "Print server: Online / Needs update / Offline" (owner, 2026-10-28), next to print buttons. Needs update (this
 * computer runs a version below the published one) links to the download. Online and Offline open a mini window with
 * the label printer, the label size, Print a test label and Reprint last label: the same pieces as Settings → Printing.
 */
import { useState } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  type SxProps,
  type Theme,
  useTheme,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getPrintServerVersion } from '../../api/core.api';
import { localPrintService } from '../../services/localPrintService';
import { printServerState, type PrintServerState } from '../../printing/printServerState';
import { LabelPrinterSelect } from './LabelPrinterSelect';
import { LabelSizeCard } from './LabelSizeCard';
import { IconClose as Close, IconPrint as Print } from '../../icons/ecoIcons';

interface ReleaseData {
  available?: boolean;
  version?: string;
  s3_file_info?: { url: string | null } | null;
}

const LOOK: Record<PrintServerState, { label: string; color: 'success' | 'warning' | 'error'; tip: string }> = {
  online: { label: 'Print server: Online', color: 'success', tip: 'Label size, printer and a test label' },
  needs_update: { label: 'Print server: Needs update', color: 'warning', tip: 'Click here to download the latest' },
  offline: { label: 'Print server: Offline', color: 'error', tip: 'Not running on this computer. Click for help.' },
};

/** The chip's state from the print server's health and the published release. */
export function usePrintServerState() {
  const { data: health, isFetched } = useQuery({
    queryKey: ['ps-chip-health'],
    queryFn: () => localPrintService.getHealth(),
    refetchInterval: 30_000,
    retry: false,
  });
  const { data: release } = useQuery<ReleaseData>({
    queryKey: ['printServerVersion'],
    queryFn: async () => (await getPrintServerVersion()).data as unknown as ReleaseData,
    staleTime: 10 * 60_000,
  });
  const latest = release?.available ? release.version : undefined;
  return {
    state: printServerState(health?.status === 'ok', health?.version, latest),
    checked: isFetched,
    installed: health?.version,
    latest,
    downloadUrl: release?.s3_file_info?.url ?? null,
  };
}

export function PrintServerChip({ sx }: { sx?: SxProps<Theme> }) {
  const { state, checked, installed, latest, downloadUrl } = usePrintServerState();
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  if (!checked) return null;
  const look = LOOK[state];

  const onClick = () => {
    if (state === 'needs_update' && downloadUrl) window.open(downloadUrl, '_blank', 'noopener');
    else setOpen(true);
  };

  return (
    <>
      <Tooltip title={look.tip}>
        <Chip
          size="small"
          variant="outlined"
          color={look.color}
          icon={<Print />}
          label={look.label}
          onClick={onClick}
          aria-label={`${look.label}. ${look.tip}`}
          sx={sx}
        />
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" fullScreen={phone}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
          Printing
          <Typography component="span" variant="body2" color={`${look.color}.main`}>
            {state === 'offline' ? 'print server offline' : `print server v${installed}`}
          </Typography>
          <IconButton aria-label="Close" onClick={() => setOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {state === 'offline' && (
              <Typography variant="body2">
                The print server is not running on this computer. Start <b>Eco-Thrift Print Server</b> from the Start
                menu{downloadUrl ? (
                  <>, or <Link href={downloadUrl} target="_blank" rel="noopener">download v{latest}</Link> and install it</>
                ) : null}.
              </Typography>
            )}
            <LabelPrinterSelect online={state !== 'offline'} />
            <LabelSizeCard compact />
            <Box>
              <Link component={RouterLink} to="/admin/settings?tab=printing" onClick={() => setOpen(false)}>
                All printing settings
              </Link>
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
