import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import { useEffect, type ReactNode, type RefObject } from 'react';
import { ManifestToolbarPill } from './ManifestToolbarPill';
import type { ManifestModalEditorHandle } from './manifestModalEditor';

export interface ManifestModalFieldProps {
  label: string;
  summary: string;
  open: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  editorRef?: RefObject<ManifestModalEditorHandle | null>;
  confirmDisabled?: boolean;
  children: ReactNode;
  minWidth?: number;
  maxWidth?: number;
  valueFontSize?: string;
  valueFontWeight?: number;
}

export function ManifestModalField({
  label,
  summary,
  open,
  onOpen,
  onCancel,
  onConfirm,
  editorRef,
  confirmDisabled = false,
  children,
  minWidth = 96,
  maxWidth = 148,
  valueFontSize,
  valueFontWeight,
}: ManifestModalFieldProps) {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      editorRef?.current?.focusEditor();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, editorRef]);

  function handleDialogClose(_event: object, reason: 'backdropClick' | 'escapeKeyDown') {
    if (reason === 'backdropClick') return;
    onCancel();
  }

  return (
    <>
      <ManifestToolbarPill
        label={label}
        value={summary}
        onClick={onOpen}
        valueFontSize={valueFontSize}
        valueFontWeight={valueFontWeight}
        sx={{ flexShrink: 0, minWidth, maxWidth }}
      />

      <Dialog open={open} onClose={handleDialogClose} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 1 }}>{label}</DialogTitle>
        <DialogContent dividers sx={{ pt: 1.5 }}>{open ? children : null}</DialogContent>
        <DialogActions sx={{ px: 2, py: 1.25, gap: 1 }}>
          <Button onClick={onCancel} size="small">
            Cancel
          </Button>
          <Button onClick={onConfirm} variant="contained" size="small" disabled={confirmDisabled}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
