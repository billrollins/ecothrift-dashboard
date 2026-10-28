/**
 * The label printer pick, saved on this computer's print server (shared by every browser on the PC). Used on
 * Settings → Printing and in the print-server chip's mini window.
 */
import { FormControl, InputLabel, MenuItem, Select, type SxProps, type Theme } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useSnackbar } from 'notistack';
import { useMutation, useQuery } from '@tanstack/react-query';
import { localPrintService, type DrawerPin, type PrinterInfo, type PrinterSettings } from '../../services/localPrintService';

export function drawerPinValue(settings?: PrinterSettings): DrawerPin {
  const pin = settings?.drawer_pin;
  if (pin === 0 || pin === 1 || pin === 'both') return pin;
  return 'both';
}

/** The print server's settings with one change (it takes the whole object). */
export function withSetting(settings: PrinterSettings | undefined, change: Partial<PrinterSettings>): PrinterSettings {
  return {
    label_printer: settings?.label_printer ?? null,
    receipt_printer: settings?.receipt_printer ?? null,
    label_size_preset: settings?.label_size_preset ?? '3x2',
    drawer_pin: drawerPinValue(settings),
    ...change,
  };
}

export function LabelPrinterSelect({ online, sx }: { online: boolean; sx?: SxProps<Theme> }) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: printers = [] } = useQuery<PrinterInfo[]>({
    queryKey: ['ps-printers'],
    queryFn: () => localPrintService.listPrinters(),
    enabled: online,
    retry: false,
  });
  const { data: psSettings, refetch } = useQuery<PrinterSettings>({
    queryKey: ['ps-settings'],
    queryFn: () => localPrintService.getSettings(),
    enabled: online,
    retry: false,
  });
  const save = useMutation({
    mutationFn: (name: string) => localPrintService.updateSettings(withSetting(psSettings, { label_printer: name || null })),
    onSuccess: () => {
      refetch();
      enqueueSnackbar('Label printer saved', { variant: 'success' });
    },
    onError: () => enqueueSnackbar('Could not save the label printer', { variant: 'error' }),
  });

  return (
    <FormControl fullWidth disabled={!online} sx={sx}>
      <InputLabel>Label printer</InputLabel>
      <Select
        value={psSettings?.label_printer ?? ''}
        label="Label printer"
        onChange={(e: SelectChangeEvent) => save.mutate(e.target.value)}
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
  );
}
