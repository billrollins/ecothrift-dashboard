import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import Download from '@mui/icons-material/Download';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Print from '@mui/icons-material/Print';
import Refresh from '@mui/icons-material/Refresh';
import Save from '@mui/icons-material/Save';
import Speed from '@mui/icons-material/Speed';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { getSettings, updateSetting, getAppVersion, getPrintServerVersion } from '../../api/core.api';
import { localPrintService } from '../../services/localPrintService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PrinterSettings, PrinterInfo, HealthResponse } from '../../services/localPrintService';

interface PrintServerReleaseData {
  available: boolean;
  version?: string;
  release_notes?: string;
  released_at?: string;
  s3_file_info?: {
    filename: string;
    size: number;
    url: string | null;
  };
}

export default function SettingsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [responseTime, setResponseTime] = useState<number | null>(null);

  // --- App settings ---
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await getSettings();
      return Array.isArray(data) ? data : (data as { results?: unknown[] })?.results ?? [];
    },
  });

  const { data: appVersion } = useQuery({
    queryKey: ['appVersion'],
    queryFn: async () => {
      const { data } = await getAppVersion();
      return data;
    },
    staleTime: Infinity,
  });

  const { data: printServerRelease } = useQuery<PrintServerReleaseData>({
    queryKey: ['printServerVersion'],
    queryFn: async () => {
      const { data } = await getPrintServerVersion();
      return data as unknown as PrintServerReleaseData;
    },
  });

  // --- Print server health (polled) ---
  const { data: isOnline = false } = useQuery({
    queryKey: ['ps-available'],
    queryFn: () => localPrintService.isAvailable(),
    refetchInterval: 15_000,
    retry: false,
  });

  const {
    data: healthData,
    isLoading: healthLoading,
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

  // --- Printer assignment mutations ---
  const saveLabelPrinter = useMutation({
    mutationFn: (name: string) =>
      localPrintService.updateSettings({
        label_printer: name || null,
        receipt_printer: psSettings?.receipt_printer ?? null,
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
      }),
    onSuccess: () => {
      refetchPsSettings();
      enqueueSnackbar('Receipt printer saved', { variant: 'success' });
    },
  });

  // --- Test mutations ---
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

  const handleRefreshAll = () => {
    refetchHealth();
    refetchPrinters();
    refetchPsSettings();
  };

  // --- App setting helpers ---
  const handleSave = async (key: string) => {
    try {
      await updateSetting(key, { value: editValue });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      enqueueSnackbar('Setting saved', { variant: 'success' });
      setEditingKey(null);
      setEditValue('');
    } catch {
      enqueueSnackbar('Failed to save setting', { variant: 'error' });
    }
  };

  const handleEdit = (key: string, value: unknown) => {
    setEditingKey(key);
    setEditValue(String(value ?? ''));
  };

  const settingList = (settings ?? []) as Array<{
    key: string;
    value: unknown;
    description?: string;
  }>;

  if (isLoading && !settings) return <LoadingScreen message="Loading settings..." />;

  const isServerOnline = isOnline && !!healthData;

  return (
    <Box>
      <PageHeader title="Settings" subtitle="System configuration" />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Application version */}
        {appVersion && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Application
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, mt: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Version
                  </Typography>
                  <Typography variant="h5" fontWeight={600}>
                    {appVersion.version}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Build Date
                  </Typography>
                  <Typography variant="body1">
                    {appVersion.build_date
                      ? new Date(appVersion.build_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Description
                  </Typography>
                  <Typography variant="body1">{appVersion.description || '—'}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* App settings */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              App Settings
            </Typography>
            {settingList.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No settings
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                {settingList.map((s) => (
                  <Box
                    key={s.key}
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                      gap: 2,
                      p: 2,
                      borderRadius: 1,
                      bgcolor: 'action.hover',
                    }}
                  >
                    <Box sx={{ flex: '1 1 200px' }}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {s.key}
                      </Typography>
                      {s.description && (
                        <Typography variant="caption" color="text.secondary">
                          {s.description}
                        </Typography>
                      )}
                    </Box>
                    {editingKey === s.key ? (
                      <Box sx={{ display: 'flex', gap: 1, flex: '1 1 300px' }}>
                        <TextField
                          size="small"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          fullWidth
                        />
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Save />}
                          onClick={() => handleSave(s.key)}
                        >
                          Save
                        </Button>
                        <Button size="small" onClick={() => setEditingKey(null)}>
                          Cancel
                        </Button>
                      </Box>
                    ) : (
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 300px' }}
                      >
                        <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                          {String(s.value ?? '')}
                        </Typography>
                        <Button size="small" onClick={() => handleEdit(s.key, s.value)}>
                          Edit
                        </Button>
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Print Server                                                      */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <CardContent>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 2,
              }}
            >
              <Box>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Print /> Print Server
                </Typography>
                {isServerOnline && (
                  <Typography variant="caption" color="text.secondary">
                    Manage auto-start, updates, and uninstall at{' '}
                    <Box
                      component="a"
                      href="http://127.0.0.1:8888/manage"
                      target="_blank"
                      rel="noreferrer"
                      sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                    >
                      127.0.0.1:8888/manage
                    </Box>
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {isServerOnline ? (
                  <Tooltip title="Open Print Server management page" arrow>
                    <Chip
                      label="Online"
                      color="success"
                      size="small"
                      icon={<OpenInNew style={{ fontSize: 14 }} />}
                      onClick={() => window.open('http://127.0.0.1:8888/manage', '_blank')}
                      sx={{ cursor: 'pointer' }}
                    />
                  </Tooltip>
                ) : (
                  <Chip label="Offline" color="error" size="small" />
                )}
                <Button
                  size="small"
                  startIcon={<Refresh />}
                  onClick={handleRefreshAll}
                  disabled={healthLoading}
                >
                  Refresh
                </Button>
              </Box>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* Status cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 6, md: 3 }}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Status
                  </Typography>
                  <Typography
                    variant="h6"
                    color={isServerOnline ? 'success.main' : 'error.main'}
                  >
                    {isServerOnline ? 'Online' : 'Offline'}
                  </Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Version
                  </Typography>
                  <Typography variant="h6">{healthData?.version ?? '—'}</Typography>
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
                    {responseTime != null ? `${responseTime}ms` : '—'}
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

            {!isServerOnline && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Print server is offline. Start the Eco-Thrift Print Server on this machine
                (localhost:8888) to configure printers.
              </Alert>
            )}

            {/* Printer assignment dropdowns */}
            {isServerOnline && printers.length > 0 && (
              <>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                  Printer Assignment
                </Typography>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', mb: 2 }}>
                  <FormControl fullWidth>
                    <InputLabel>Label Printer</InputLabel>
                    <Select
                      value={psSettings?.label_printer ?? ''}
                      label="Label Printer"
                      onChange={(e: SelectChangeEvent) => saveLabelPrinter.mutate(e.target.value)}
                    >
                      <MenuItem value="">
                        <em>(not set — uses system default)</em>
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
                    size="small"
                    sx={{ minWidth: 120, height: 40 }}
                    startIcon={
                      testLabel.isPending ? <CircularProgress size={16} /> : <Print />
                    }
                    onClick={() => testLabel.mutate()}
                    disabled={testLabel.isPending}
                  >
                    Test Label
                  </Button>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', mb: 2 }}>
                  <FormControl fullWidth>
                    <InputLabel>Receipt Printer</InputLabel>
                    <Select
                      value={psSettings?.receipt_printer ?? ''}
                      label="Receipt Printer"
                      onChange={(e: SelectChangeEvent) =>
                        saveReceiptPrinter.mutate(e.target.value)
                      }
                    >
                      <MenuItem value="">
                        <em>(not set — uses system default)</em>
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
                    size="small"
                    sx={{ minWidth: 120, height: 40 }}
                    startIcon={
                      testReceipt.isPending ? <CircularProgress size={16} /> : <Print />
                    }
                    onClick={() => testReceipt.mutate()}
                    disabled={testReceipt.isPending}
                  >
                    Test Receipt
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    sx={{ minWidth: 120, height: 40 }}
                    onClick={() => testDrawer.mutate()}
                    disabled={testDrawer.isPending}
                  >
                    Open Drawer
                  </Button>
                </Box>

                <Alert severity="info" sx={{ mt: 1 }}>
                  Printer assignments are saved on this machine's print server. Every browser on
                  this workstation shares the same settings.
                </Alert>
              </>
            )}

            {isServerOnline && printers.length === 0 && (
              <Alert severity="warning">No printers detected by the print server.</Alert>
            )}

            {/* Release download */}
            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
              Client Download
            </Typography>

            {printServerRelease?.available && printServerRelease.version ? (
              <Box>
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Latest Version
                      </Typography>
                      <Typography variant="h6">v{printServerRelease.version}</Typography>
                    </Paper>
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        File Size
                      </Typography>
                      <Typography variant="h6">
                        {printServerRelease.s3_file_info?.size
                          ? `${(printServerRelease.s3_file_info.size / 1024 / 1024).toFixed(1)} MB`
                          : '—'}
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Filename
                      </Typography>
                      <Typography variant="body1" noWrap>
                        {printServerRelease.s3_file_info?.filename ?? '—'}
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Released
                      </Typography>
                      <Typography variant="body1">
                        {printServerRelease.released_at
                          ? new Date(printServerRelease.released_at).toLocaleDateString()
                          : '—'}
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>

                {printServerRelease.release_notes && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {printServerRelease.release_notes}
                  </Typography>
                )}

                <Button
                  variant="contained"
                  startIcon={<Download />}
                  disabled={!printServerRelease.s3_file_info?.url}
                  onClick={() => {
                    if (printServerRelease.s3_file_info?.url) {
                      window.open(printServerRelease.s3_file_info.url, '_blank');
                    }
                  }}
                >
                  Download Print Server v{printServerRelease.version}
                </Button>

                {healthData?.version && healthData.version !== printServerRelease.version && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    The running print server (v{healthData.version}) does not match the latest
                    release (v{printServerRelease.version}). Download and install the update.
                  </Alert>
                )}
              </Box>
            ) : (
              <Alert severity="info">
                No print server releases available yet. Upload a release through the admin panel.
              </Alert>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
