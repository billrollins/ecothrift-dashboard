import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import Download from '@mui/icons-material/Download';
import Print from '@mui/icons-material/Print';
import Refresh from '@mui/icons-material/Refresh';
import Speed from '@mui/icons-material/Speed';
import { keyframes } from '@mui/material/styles';
import { useSnackbar } from 'notistack';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getPrintServerVersion } from '../../../api/core.api';
import { localPrintService } from '../../../services/localPrintService';
import type {
  HealthResponse,
  LabelSizePreset,
  PrinterInfo,
  PrinterSettings,
} from '../../../services/localPrintService';

interface PrintServerReleaseData {
  available: boolean;
  version?: string;
  released_at?: string;
  s3_file_info?: {
    filename: string;
    size: number;
    url: string | null;
  };
}

const psSpin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const FIELD_H = 56;

const BG_SERVER = '#F7F5F1';
const BG_CLIENT = '#E8F0F6';
const BG_SPECS = '#F4F1E8';
const FIELD_FILL = '#fff';

const assignmentRowSx = {
  display: 'grid',
  gridTemplateColumns: {
    xs: '1fr',
    sm: 'minmax(0, 1fr) minmax(160px, 220px) minmax(160px, 220px)',
  },
  gap: 2,
  alignItems: 'stretch',
} as const;

const solidFieldSx = {
  '& .MuiInputBase-root': {
    bgcolor: FIELD_FILL,
  },
  '& .MuiInputBase-root.Mui-disabled': {
    bgcolor: FIELD_FILL,
  },
} as const;

const actionSx = {
  height: FIELD_H,
  minHeight: FIELD_H,
  whiteSpace: 'nowrap',
  bgcolor: FIELD_FILL,
  color: 'text.primary',
  borderColor: 'grey.400',
  '&:hover': {
    bgcolor: FIELD_FILL,
    color: 'text.primary',
    borderColor: 'grey.600',
  },
  '&.Mui-disabled': {
    bgcolor: FIELD_FILL,
    color: 'text.disabled',
    borderColor: 'grey.300',
  },
} as const;

function formatFileSize(bytes?: number): string {
  if (!bytes) return '-';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatReleasedAt(iso?: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function SpecStat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <Box sx={{ minWidth: 96, textAlign: 'center' }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', letterSpacing: 0.3 }}
      >
        {label}
      </Typography>
      <Typography
        variant="body1"
        fontWeight={600}
        color={warn ? 'warning.main' : 'text.primary'}
        sx={{ minHeight: 24 }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export function PrintingPanel() {
  const { enqueueSnackbar } = useSnackbar();
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [titleSpinning, setTitleSpinning] = useState(false);

  const { data: printServerRelease } = useQuery<PrintServerReleaseData>({
    queryKey: ['printServerVersion'],
    queryFn: async () => {
      const { data } = await getPrintServerVersion();
      return data as unknown as PrintServerReleaseData;
    },
  });

  const { data: isOnline = false } = useQuery({
    queryKey: ['ps-available'],
    queryFn: () => localPrintService.isAvailable(),
    refetchInterval: 15_000,
    retry: false,
  });

  const {
    data: healthData,
    isFetching: healthFetching,
    refetch: refetchHealth,
  } = useQuery<HealthResponse>({
    queryKey: ['ps-health'],
    queryFn: async () => {
      const t0 = performance.now();
      const result = await localPrintService.getHealth();
      setResponseTime(Math.round(performance.now() - t0));
      return result;
    },
    enabled: isOnline,
    refetchInterval: 15_000,
    retry: false,
  });

  const { data: printers = [], refetch: refetchPrinters } = useQuery<PrinterInfo[]>({
    queryKey: ['ps-printers'],
    queryFn: () => localPrintService.listPrinters(),
    enabled: isOnline,
    retry: false,
  });

  const { data: psSettings, refetch: refetchPsSettings } = useQuery<PrinterSettings>({
    queryKey: ['ps-settings'],
    queryFn: () => localPrintService.getSettings(),
    enabled: isOnline,
    retry: false,
  });

  const saveLabelPrinter = useMutation({
    mutationFn: (name: string) =>
      localPrintService.updateSettings({
        label_printer: name || null,
        receipt_printer: psSettings?.receipt_printer ?? null,
        label_size_preset: psSettings?.label_size_preset ?? '3x2',
      }),
    onSuccess: () => {
      refetchPsSettings();
      enqueueSnackbar('Label printer saved', { variant: 'success' });
    },
  });

  const saveReceiptPrinter = useMutation({
    mutationFn: (name: string) =>
      localPrintService.updateSettings({
        label_printer: psSettings?.label_printer ?? null,
        receipt_printer: name || null,
        label_size_preset: psSettings?.label_size_preset ?? '3x2',
      }),
    onSuccess: () => {
      refetchPsSettings();
      enqueueSnackbar('Receipt printer saved', { variant: 'success' });
    },
  });

  const saveLabelSizePreset = useMutation({
    mutationFn: (preset: LabelSizePreset) =>
      localPrintService.updateSettings({
        label_printer: psSettings?.label_printer ?? null,
        receipt_printer: psSettings?.receipt_printer ?? null,
        label_size_preset: preset,
      }),
    onSuccess: () => {
      refetchPsSettings();
      enqueueSnackbar('Label paper size saved', { variant: 'success' });
    },
    onError: () => enqueueSnackbar('Failed to save label size', { variant: 'error' }),
  });

  const testLabel = useMutation({
    mutationFn: () => localPrintService.printTest(),
    onSuccess: (r) =>
      enqueueSnackbar(r.success ? 'Test label sent' : r.error ?? r.message, {
        variant: r.success ? 'success' : 'error',
      }),
    onError: () => enqueueSnackbar('Test label failed', { variant: 'error' }),
  });

  const testReceipt = useMutation({
    mutationFn: () => localPrintService.printTestReceipt(),
    onSuccess: (r) =>
      enqueueSnackbar(r.success ? 'Test receipt sent' : r.error ?? r.message, {
        variant: r.success ? 'success' : 'error',
      }),
    onError: () => enqueueSnackbar('Test receipt failed', { variant: 'error' }),
  });

  const testDrawer = useMutation({
    mutationFn: () => localPrintService.openCashDrawer(),
    onSuccess: (r) =>
      enqueueSnackbar(r.success ? 'Drawer opened' : r.error ?? r.message, {
        variant: r.success ? 'success' : 'error',
      }),
    onError: () => enqueueSnackbar('Drawer open failed', { variant: 'error' }),
  });

  const isServerOnline = isOnline && !!healthData;
  const latestVersion = printServerRelease?.available ? printServerRelease.version : undefined;
  const downloadUrl = printServerRelease?.s3_file_info?.url ?? null;
  const installedVersion = healthData?.version;
  const updateAvailable = Boolean(
    installedVersion && latestVersion && installedVersion !== latestVersion,
  );

  const workstationLine = installedVersion ? `v${installedVersion}` : 'Not running';
  const titleRefreshing = titleSpinning || healthFetching;

  const refreshPrintServer = () => {
    if (titleSpinning) return;
    setTitleSpinning(true);
    refetchHealth();
    refetchPrinters();
    refetchPsSettings();
    window.setTimeout(() => setTitleSpinning(false), 800);
  };

  const assignmentStatus = !isServerOnline
    ? 'Start the print server on this machine to assign printers.'
    : printers.length === 0
      ? 'No printers detected on this machine.'
      : `${printers.length} printer${printers.length === 1 ? '' : 's'} available.`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card
        elevation={0}
        sx={{
          bgcolor: '#fff',
          border: '1px solid',
          borderColor: '#E5E5EA',
        }}
      >
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
            Printer Assignment
          </Typography>
          <Box sx={{ ...assignmentRowSx, mb: 2 }}>
            <FormControl fullWidth disabled={!isServerOnline} sx={solidFieldSx}>
              <InputLabel>Label printer</InputLabel>
              <Select
                value={psSettings?.label_printer ?? ''}
                label="Label printer"
                onChange={(e: SelectChangeEvent) => saveLabelPrinter.mutate(e.target.value)}
              >
                <MenuItem value="">
                  <em>(not set - uses system default)</em>
                </MenuItem>
                {printers.map((p) => (
                  <MenuItem key={p.name} value={p.name}>
                    {p.name}
                    {p.is_default ? ' (System Default)' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth disabled={!isServerOnline} sx={solidFieldSx}>
              <InputLabel>Paper size</InputLabel>
              <Select
                value={psSettings?.label_size_preset ?? '3x2'}
                label="Paper size"
                onChange={(e: SelectChangeEvent<LabelSizePreset>) =>
                  saveLabelSizePreset.mutate(e.target.value as LabelSizePreset)
                }
              >
                <MenuItem value="3x2">3″ × 2″ (testing / large)</MenuItem>
                <MenuItem value="1.5x1">1.5″ × 1″ (production)</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              sx={actionSx}
              startIcon={testLabel.isPending ? <CircularProgress size={16} /> : <Print />}
              onClick={() => testLabel.mutate()}
              disabled={!isServerOnline || testLabel.isPending}
            >
              Test
            </Button>
          </Box>
          <Box sx={assignmentRowSx}>
            <FormControl fullWidth disabled={!isServerOnline} sx={solidFieldSx}>
              <InputLabel>Receipt printer</InputLabel>
              <Select
                value={psSettings?.receipt_printer ?? ''}
                label="Receipt printer"
                onChange={(e: SelectChangeEvent) => saveReceiptPrinter.mutate(e.target.value)}
              >
                <MenuItem value="">
                  <em>(not set - uses system default)</em>
                </MenuItem>
                {printers.map((p) => (
                  <MenuItem key={p.name} value={p.name}>
                    {p.name}
                    {p.is_default ? ' (System Default)' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              sx={actionSx}
              startIcon={testReceipt.isPending ? <CircularProgress size={16} /> : <Print />}
              onClick={() => testReceipt.mutate()}
              disabled={!isServerOnline || testReceipt.isPending}
            >
              Test receipt
            </Button>
            <Button
              variant="outlined"
              sx={actionSx}
              onClick={() => testDrawer.mutate()}
              disabled={!isServerOnline || testDrawer.isPending}
            >
              Open drawer
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, minHeight: 24 }}>
            {assignmentStatus}
          </Typography>
        </CardContent>
      </Card>

      <Card sx={{ bgcolor: BG_SERVER }}>
        <CardContent>
          <Box sx={{ mb: 2, minHeight: 56 }}>
            <Box
              component="button"
              type="button"
              onClick={refreshPrintServer}
              aria-label="Refresh print server"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                m: 0,
                ml: -1,
                px: 1,
                py: 0.5,
                border: 0,
                borderRadius: 1,
                bgcolor: 'transparent',
                cursor: titleRefreshing ? 'default' : 'pointer',
                color: 'text.primary',
                font: 'inherit',
                '&:hover': {
                  bgcolor: 'rgba(0, 0, 0, 0.06)',
                  '& .ps-refresh': { opacity: 0.85 },
                },
              }}
            >
              <Print />
              <Typography variant="h6" component="span">
                Print Server
              </Typography>
              <Refresh
                className="ps-refresh"
                sx={{
                  fontSize: 16,
                  opacity: titleRefreshing ? 0.7 : 0.28,
                  animation: titleRefreshing ? `${psSpin} 0.8s linear infinite` : 'none',
                }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Manage auto-start, updates, and uninstall at{' '}
              <Link
                href="http://127.0.0.1:8888/manage"
                target="_blank"
                rel="noopener noreferrer"
              >
                127.0.0.1:8888/manage
              </Link>
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 3 }}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Status
                </Typography>
                <Typography variant="h6" color={isServerOnline ? 'success.main' : 'error.main'}>
                  {isServerOnline ? 'Online' : 'Offline'}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Version
                </Typography>
                <Typography variant="h6">{healthData?.version ?? '-'}</Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Response Time
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}
                >
                  <Speed fontSize="small" />
                  {responseTime != null ? `${responseTime}ms` : '-'}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Printers
                </Typography>
                <Typography variant="h6">{healthData?.printers_available ?? 0}</Typography>
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                md: 'minmax(220px, 1fr) minmax(0, 2fr) minmax(200px, 1fr)',
              },
              alignItems: 'stretch',
              minHeight: 112,
            }}
          >
            <Box
              sx={{
                px: 2.5,
                py: 2,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                minHeight: 112,
                bgcolor: BG_CLIENT,
              }}
            >
              <Typography variant="subtitle1" fontWeight={600}>
                Print Server installer
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Windows · this workstation
              </Typography>
            </Box>

            <Box
              sx={{
                px: 2,
                py: 2,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                bgcolor: BG_SPECS,
                borderLeft: { md: '1px solid' },
                borderRight: { md: '1px solid' },
                borderTop: { xs: '1px solid', md: 'none' },
                borderBottom: { xs: '1px solid', md: 'none' },
                borderColor: 'divider',
                minHeight: 112,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: { xs: 2, md: 4 },
                }}
              >
                <SpecStat label="Version" value={latestVersion ? `v${latestVersion}` : '-'} />
                <SpecStat label="Size" value={formatFileSize(printServerRelease?.s3_file_info?.size)} />
                <SpecStat label="Released" value={formatReleasedAt(printServerRelease?.released_at)} />
                <SpecStat label="This workstation" value={workstationLine} warn={updateAvailable} />
              </Box>
            </Box>

            <Box
              sx={{
                px: 2.5,
                py: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                minHeight: 112,
                bgcolor: BG_CLIENT,
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ letterSpacing: 0.8, textTransform: 'uppercase' }}
              >
                Download
              </Typography>
              <Button
                variant="contained"
                startIcon={<Download />}
                disabled={!downloadUrl}
                onClick={() => {
                  if (downloadUrl) window.open(downloadUrl, '_blank');
                }}
                sx={{ height: 40, minWidth: 160 }}
              >
                {latestVersion ? `Download v${latestVersion}` : 'Download'}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
