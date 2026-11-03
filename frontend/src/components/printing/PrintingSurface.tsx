/**
 * The one Printing screen (Bill, Dash Updates #9, 2026-11-03): the same pieces wherever it opens, as the sidebar's
 * Print server window and on Settings → Printing, top to bottom: this computer's print server (status, update); its
 * receipt printer, label printer and label size in one row, each with its test prints under it; the tags it prints,
 * with big live samples. Every choice here is this computer's.
 */
import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import thriftPlusGuest from '../../pages/admin/settings/receiptSamples/thriftplus_guest.json';
import thriftPlusMember from '../../pages/admin/settings/receiptSamples/thriftplus_member.json';
import { localPrintService, type PrinterInfo, type PrinterSettings } from '../../services/localPrintService';
import { LABEL_PRESETS, type LabelSize } from '../../printing/labelSize';
import type { PrintPrefs } from '../../printing/printPrefs';
import {
  lastPrintedTag,
  printTestLabel,
  printTestPriceTag,
  printTestRestorationTag,
  reprintLastTag,
  type PrintTagsResult,
} from '../../printing/printTags';
import { usePrintPrefs } from '../../printing/usePrintPrefs';
import { IconDownload as Download, IconPrint as Print, IconRefresh as Refresh } from '../../icons/ecoIcons';
import { LabelPrinterSelect, withSetting } from './LabelPrinterSelect';
import { SAMPLE_RESTORATION, TagsCard } from './TagsCard';
import { usePrintServerState } from './usePrintServerState';

/** The two test receipts (owner 2026-10-16: member and non-member only): the print server's samples (printserver/fixtures). */
const RECEIPT_SAMPLES: { label: string; data: Record<string, unknown> }[] = [
  { label: 'Member receipt', data: thriftPlusMember },
  { label: 'Non-member receipt', data: thriftPlusGuest },
];

const STATUS = {
  online: { color: 'success', word: 'Online' },
  needs_update: { color: 'warning', word: 'Needs update' },
  offline: { color: 'error', word: 'Offline' },
} as const;

const cardSx = { border: '1px solid', borderColor: '#E5E5EA' } as const;

type Outcome = { ok: boolean; error?: string };

/** Print server status on one line: what runs on this computer, and the update when there is one. */
function ServerBar() {
  const { state, installed, printers, latest, downloadUrl, refreshing, refresh } = usePrintServerState();
  const look = STATUS[state];
  const line = state === 'offline'
    ? 'Not running on this computer. Start Eco-Thrift Print Server from the Start menu, or install it.'
    : `v${installed} · ${printers ?? 0} printer${printers === 1 ? '' : 's'}`
      + (state === 'needs_update' && latest ? ` · v${latest} is out` : ' · up to date');
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap
      sx={{ ...cardSx, borderLeft: '4px solid', borderLeftColor: `${look.color}.main`, borderRadius: 1,
        bgcolor: 'background.paper', px: 1.5, py: 1, flexWrap: 'wrap' }}>
      <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: `${look.color}.main`, color: '#fff', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Print fontSize="small" />
      </Box>
      <Typography variant="subtitle2" fontWeight={600}>Print server</Typography>
      <Chip size="small" color={look.color} label={look.word} />
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 160 }}>{line}</Typography>
      <Tooltip title="Check again">
        <IconButton size="small" aria-label="Check the print server again" onClick={() => refresh()}>
          {refreshing ? <CircularProgress size={16} /> : <Refresh fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Link variant="caption" href="http://127.0.0.1:8888/manage" target="_blank" rel="noopener noreferrer">
        Manage
      </Link>
      {state !== 'online' && downloadUrl && (
        <Button size="small" variant="contained" color={look.color} startIcon={<Download />}
          onClick={() => window.open(downloadUrl, '_blank', 'noopener')}>
          {state === 'needs_update' ? `Update to v${latest}` : `Download v${latest}`}
        </Button>
      )}
    </Stack>
  );
}

/** This computer: receipt printer, label printer and label size in one row, each with its test prints under it. */
function ComputerPart({ online, size, prefs, savePrefs }: {
  online: boolean; size: LabelSize; prefs: PrintPrefs; savePrefs: (c: Partial<PrintPrefs>) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: printers = [] } = useQuery<PrinterInfo[]>({
    queryKey: ['ps-printers'], queryFn: () => localPrintService.listPrinters(), enabled: online, retry: false,
  });
  const { data: settings, refetch } = useQuery<PrinterSettings>({
    queryKey: ['ps-settings'], queryFn: () => localPrintService.getSettings(), enabled: online, retry: false,
  });
  const save = useMutation({
    mutationFn: (change: Partial<PrinterSettings>) => localPrintService.updateSettings(withSetting(settings, change)),
    onSuccess: () => {
      refetch();
      enqueueSnackbar('Saved on this computer', { variant: 'success' });
    },
    onError: () => enqueueSnackbar('Could not save on this computer', { variant: 'error' }),
  });

  const run = async (name: string, job: () => Promise<Outcome>) => {
    setBusy(name);
    try {
      const r = await job();
      enqueueSnackbar(r.ok ? `${name}: sent` : `${name} did not print: ${r.error ?? 'is the print server running?'}`,
        { variant: r.ok ? 'success' : 'error' });
    } catch (err) {
      enqueueSnackbar(`${name} did not print: ${err instanceof Error ? err.message : String(err)}`, { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };
  const tags = (r: PrintTagsResult): Outcome => ({ ok: !r.failed && r.printed > 0, error: r.error });
  const server = (r: { success: boolean; error?: string; message?: string }): Outcome => ({ ok: r.success, error: r.error ?? r.message });

  const testButtons = (list: { label: string; disabled?: boolean; job: () => Promise<Outcome> }[]) => (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
      {list.map((t) => (
        <Button key={t.label} size="small" variant="outlined" disabled={!online || !!busy || t.disabled}
          startIcon={busy === t.label ? <CircularProgress size={14} /> : <Print />}
          onClick={() => run(t.label, t.job)} sx={{ textTransform: 'none' }}>
          {t.label}
        </Button>
      ))}
    </Stack>
  );

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>This computer</Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 1fr) 160px' } }}>
        <Box>
          <FormControl fullWidth disabled={!online} size="small">
            <InputLabel>Receipt printer</InputLabel>
            <Select value={settings?.receipt_printer ?? ''} label="Receipt printer"
              onChange={(e: SelectChangeEvent) => save.mutate({ receipt_printer: e.target.value || null })}>
              <MenuItem value=""><em>(not set - uses system default)</em></MenuItem>
              {printers.map((p) => (
                <MenuItem key={p.name} value={p.name}>{p.name}{p.is_default ? ' (System Default)' : ''}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {testButtons(RECEIPT_SAMPLES.map((s) => ({
            label: s.label, job: async () => server(await localPrintService.printReceipt(s.data, false)),
          })))}
        </Box>
        <Box>
          <LabelPrinterSelect online={online} size="small" />
          {testButtons([
            { label: 'Price tag', job: async () => tags(await printTestPriceTag()) },
            { label: 'Restoration tag', job: async () => tags(await printTestRestorationTag(size, SAMPLE_RESTORATION)) },
            { label: 'Reprint last', disabled: !lastPrintedTag(), job: async () => tags(await reprintLastTag()) },
          ])}
        </Box>
        <Box>
          <TextField select fullWidth size="small" label="Label size" value={prefs.size}
            onChange={(e) => savePrefs({ size: e.target.value })}>
            {LABEL_PRESETS.map((p) => (
              <MenuItem key={p.key} value={p.key}>{p.w_in} x {p.h_in} in</MenuItem>
            ))}
          </TextField>
          {testButtons([{ label: 'Test label', job: async () => tags(await printTestLabel(size)) }])}
        </Box>
      </Box>
    </Box>
  );
}

export function PrintingSurface() {
  const { state } = usePrintServerState();
  const { prefs, size, save } = usePrintPrefs();
  return (
    <Stack spacing={1.5}>
      <ServerBar />
      <Card elevation={0} sx={cardSx}>
        <CardContent sx={{ '&:last-child': { pb: 2 } }}>
          <ComputerPart online={state !== 'offline'} size={size} prefs={prefs} savePrefs={save} />
        </CardContent>
      </Card>
      <Card elevation={0} sx={cardSx}>
        <CardContent sx={{ '&:last-child': { pb: 2 } }}>
          <TagsCard prefs={prefs} size={size} save={save} />
        </CardContent>
      </Card>
    </Stack>
  );
}
