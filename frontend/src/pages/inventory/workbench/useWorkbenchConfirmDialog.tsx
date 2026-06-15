import { useCallback, useRef, useState } from 'react';
import { ConfirmDialog, type ConfirmDialogProps } from '../../../components/common/ConfirmDialog';

export type WorkbenchConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: ConfirmDialogProps['severity'];
  confirmColor?: ConfirmDialogProps['confirmColor'];
};

export function useWorkbenchConfirmDialog() {
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const [options, setOptions] = useState<WorkbenchConfirmOptions | null>(null);

  const confirm = useCallback((opts: WorkbenchConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const ConfirmDialogHost = options ? (
    <ConfirmDialog
      open
      title={options.title}
      message={options.message}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel ?? 'Cancel'}
      severity={options.severity ?? 'info'}
      confirmColor={options.confirmColor}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null;

  return { confirm, ConfirmDialogHost };
}
