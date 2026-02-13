import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import WarningAmber from '@mui/icons-material/WarningAmber';
import ErrorOutline from '@mui/icons-material/ErrorOutline';
import InfoOutlined from '@mui/icons-material/InfoOutlined';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  severity?: 'warning' | 'error' | 'info';
}

const severityConfig = {
  warning: {
    icon: <WarningAmber color="warning" />,
    confirmColor: 'warning' as const,
  },
  error: {
    icon: <ErrorOutline color="error" />,
    confirmColor: 'error' as const,
  },
  info: {
    icon: <InfoOutlined color="info" />,
    confirmColor: 'primary' as const,
  },
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  severity = 'warning',
}: ConfirmDialogProps) {
  const config = severityConfig[severity];

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: { borderRadius: 2 },
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {config.icon}
        {title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ color: 'text.secondary' }}>
          {message}
        </DialogContentText>
      </DialogContent>
      <DialogActions
        sx={{
          px: 3,
          pb: 2,
          pt: 0,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Button onClick={onCancel} variant="outlined" color="inherit">
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color={config.confirmColor}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
