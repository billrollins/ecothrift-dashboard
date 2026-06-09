import { Box } from '@mui/material';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ManifestModalEditorHandle } from './manifestModalEditor';
import { processingTokens } from './processingTokens';

export interface ManifestNotesFieldProps {
  value: string;
  onSave: (notes: string) => void | Promise<void>;
}

export const ManifestNotesField = forwardRef<ManifestModalEditorHandle, ManifestNotesFieldProps>(
  function ManifestNotesField({ value, onSave }, ref) {
    const [draft, setDraft] = useState(value);
    const [optimisticValue, setOptimisticValue] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const effectiveValue = optimisticValue ?? value;

    useEffect(() => {
      setDraft(effectiveValue);
    }, [effectiveValue]);

    useEffect(() => {
      if (optimisticValue != null && value === optimisticValue) {
        setOptimisticValue(null);
      }
    }, [value, optimisticValue]);

    const resetDraft = useCallback(() => {
      setDraft(effectiveValue);
    }, [effectiveValue]);

    const cancelEdit = useCallback(() => {
      resetDraft();
    }, [resetDraft]);

    const confirmEdit = useCallback((): boolean => {
      const next = draft;
      setOptimisticValue(next);
      void Promise.resolve(onSave(next)).catch(() => {
        setOptimisticValue(null);
      });
      return true;
    }, [draft, onSave]);

    useImperativeHandle(ref, () => ({
      save: confirmEdit,
      cancel: cancelEdit,
      focusEditor: () => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      },
    }));

    return (
      <Box
        component="textarea"
        ref={textareaRef}
        value={draft}
        rows={6}
        placeholder="Add notes…"
        onChange={(e) => setDraft(e.target.value)}
        sx={{
          width: '100%',
          border: '1px solid',
          borderColor: processingTokens.border,
          borderRadius: 1,
          outline: 0,
          bgcolor: 'background.paper',
          font: 'inherit',
          fontSize: '0.875rem',
          lineHeight: 1.4,
          color: 'text.primary',
          px: 1.25,
          py: 1,
          resize: 'vertical',
          minHeight: 120,
          '&:focus': {
            borderColor: processingTokens.borderStrong,
            boxShadow: 'none',
          },
          '&::placeholder': { color: processingTokens.textMute, opacity: 1 },
        }}
      />
    );
  },
);
