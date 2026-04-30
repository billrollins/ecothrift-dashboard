import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { preprocessingFonts } from './preprocessingTokens';

interface ConfirmModalProps {
  open: boolean;
  emoji?: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  emoji,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger,
  isBusy,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Dialog
      open={open}
      onClose={isBusy ? undefined : onCancel}
      slotProps={{
        backdrop: { sx: { backgroundColor: 'rgba(0,0,0,0.5)' } },
      }}
      PaperProps={{
        sx: {
          borderRadius: '12px',
          p: 2,
          maxWidth: 440,
          width: '90%',
          fontFamily: preprocessingFonts.sans,
          textAlign: 'center',
        },
      }}
    >
      <DialogTitle sx={{ p: 0, pb: 1 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 700, color: '#1B4332', fontFamily: preprocessingFonts.sans }}>
          {emoji ? `${emoji} ` : ''}{title}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ p: 0, pb: 2 }}>
        <Typography sx={{ fontSize: 14, color: '#555', lineHeight: 1.5 }}>{message}</Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', gap: 1.5, pb: 1 }}>
        <Button variant="outlined" onClick={onCancel} disabled={isBusy} sx={{ borderColor: '#DDD5C9', color: '#555' }}>
          {cancelLabel}
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={isBusy}
          sx={{
            bgcolor: danger ? '#c0392b' : '#2D6A4F',
            '&:hover': { bgcolor: danger ? '#a93226' : '#246348' },
          }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
