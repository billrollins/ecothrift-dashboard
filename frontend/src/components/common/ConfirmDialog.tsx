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
  /** Icon and default button color. Ignored if confirmColor is set. */
  severity?: 'warning' | 'error' | 'info';
  /** Override button color (e.g. 'success', 'error'). Use when you need a color not in severity. */
  confirmColor?: 'primary' | 'error' | 'warning' | 'success' | 'inherit';
  loading?: boolean;
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
  confirmColor: confirmColorProp,
  loading = false,
}: ConfirmDialogProps) {
  const config = severityConfig[severity];
  const confirmColor = confirmColorProp ?? config.confirmColor;
  const showIcon = confirmColorProp == null;

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
        {showIcon && config.icon}
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
        <Button onClick={onCancel} variant="outlined" color="inherit" disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color={confirmColor}
          disabled={loading}
        >
          {loading ? 'Processing...' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
