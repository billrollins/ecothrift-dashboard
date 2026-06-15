import { useCallback, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import LocalPrintshopOutlinedIcon from '@mui/icons-material/LocalPrintshopOutlined';
import { processingTokens } from '../processing/processingTokens';

export type SavePrintChoice = 'print' | 'no_print' | 'cancel';

export type WorkbenchSavePrintOptions = {
  title: string;
  message: string;
  printLabel?: string;
  noPrintLabel?: string;
  cancelLabel?: string;
};

export function useWorkbenchSavePrintDialog() {
  const resolverRef = useRef<((value: SavePrintChoice) => void) | null>(null);
  const [options, setOptions] = useState<WorkbenchSavePrintOptions | null>(null);

  const confirmSavePrint = useCallback((opts: WorkbenchSavePrintOptions) => {
    return new Promise<SavePrintChoice>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const close = useCallback((choice: SavePrintChoice) => {
    resolverRef.current?.(choice);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const SavePrintDialogHost = options ? (
    <Dialog
      open
      onClose={() => close('cancel')}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 2 } } }}
    >
      <DialogTitle sx={{ fontWeight: 800 }}>{options.title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ color: 'text.secondary' }}>
          {options.message}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, pt: 0, flexWrap: 'wrap', gap: 1 }}>
        <Button
          onClick={() => close('cancel')}
          variant="outlined"
          color="inherit"
          sx={{ mr: 'auto' }}
        >
          {options.cancelLabel ?? 'Cancel save'}
        </Button>
        <Button onClick={() => close('no_print')} variant="outlined" color="inherit">
          {options.noPrintLabel ?? 'No print'}
        </Button>
        <Button
          onClick={() => close('print')}
          variant="contained"
          startIcon={<LocalPrintshopOutlinedIcon />}
          sx={{ bgcolor: processingTokens.primary, '&:hover': { bgcolor: processingTokens.primaryDark } }}
        >
          {options.printLabel ?? 'Print'}
        </Button>
      </DialogActions>
    </Dialog>
  ) : null;

  return { confirmSavePrint, SavePrintDialogHost };
}
