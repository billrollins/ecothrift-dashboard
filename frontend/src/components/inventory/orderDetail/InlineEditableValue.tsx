import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import {
  preventWheelChangeNumber,
  sanitizeDecimalPaste,
  selectInputContentsOnFocus,
} from '../../../utils/formInputs';

export interface InlineEditableValueProps {
  /** Stable id for parent-driven success/error flash borders */
  fieldId: string;
  value: string;
  displayFormatter?: (v: string) => string;
  onCommit: (next: string) => void;
  type?: 'text' | 'currency' | 'integer';
  mono?: boolean;
  placeholder?: string;
  successFlashKey?: string | null;
  errorFlashKey?: string | null;
  multiline?: boolean;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}

export default function InlineEditableValue({
  fieldId,
  value,
  displayFormatter,
  onCommit,
  type = 'text',
  mono,
  placeholder,
  successFlashKey,
  errorFlashKey,
  multiline,
  inputProps,
}: InlineEditableValueProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const flashOk = successFlashKey?.split(',').includes(fieldId);
  const flashErr = errorFlashKey?.split(',').includes(fieldId);

  const borderBottom = editing
    ? '2px solid #0f172a'
    : flashOk
      ? '2px solid #2e7d32'
      : flashErr
        ? '2px solid #ef4444'
        : undefined;

  const start = () => {
    setDraft(value);
    setEditing(true);
    window.setTimeout(() => {
      const el = ref.current;
      if (el && typeof el.select === 'function') el.select();
    }, 20);
  };

  const revertEdit = () => {
    setDraft(value);
    setEditing(false);
  };

  const commit = () => {
    if (!editing) return;
    setEditing(false);
    let next = draft;
    if (type === 'currency' || type === 'integer') next = next.trim();
    else next = next.trimEnd();
    const cur = (value ?? '').trim();
    if (next === cur) return;
    onCommit(next);
  };

  const displayEmpty = !value || value === '';

  const formattedDisplay =
    displayFormatter && !displayEmpty ? displayFormatter(value) : value;

  if (editing) {
    const commonSx = {
      fontSize: 15,
      fontWeight: 600,
      color: '#1e293b',
      border: 'none',
      borderBottom: borderBottom ?? '2px solid #0f172a',
      outline: 'none',
      background: 'transparent',
      paddingBottom: '2px',
      width: '100%',
      fontFamily: mono ? "'DM Mono', ui-monospace, monospace" : 'inherit',
      fontVariantNumeric: 'tabular-nums' as const,
    };

    const prefix = type === 'currency' ? (
      <Box
        component="span"
        sx={{
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 15,
          color: '#64748b',
          fontWeight: 600,
        }}
      >
        $
      </Box>
    ) : null;

    const inner = multiline ? (
      <Box
        component="textarea"
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            revertEdit();
          }
        }}
        sx={{
          ...commonSx,
          resize: 'vertical',
          minHeight: 72,
          py: 0.5,
        }}
        maxLength={500}
      />
    ) : (
      <Box
        component="input"
        ref={ref as React.RefObject<HTMLInputElement>}
        type={type === 'integer' ? 'number' : type === 'currency' ? 'text' : 'text'}
        inputMode={type === 'currency' ? 'decimal' : type === 'integer' ? 'numeric' : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onFocus={selectInputContentsOnFocus}
        onWheel={type === 'integer' || type === 'currency' ? preventWheelChangeNumber : undefined}
        onPaste={
          type === 'currency'
            ? (e) => {
                e.preventDefault();
                setDraft(sanitizeDecimalPaste(e.clipboardData.getData('text')));
              }
            : undefined
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            revertEdit();
          }
        }}
        sx={{
          ...commonSx,
          paddingLeft: type === 'currency' ? '14px' : 0,
        }}
        {...inputProps}
      />
    );

    return (
      <Box sx={{ position: 'relative', width: '100%' }}>
        {prefix}
        {inner}
      </Box>
    );
  }

  return (
    <Box
      component="span"
      onClick={start}
      sx={{
        fontSize: 15,
        fontWeight: 600,
        color: displayEmpty ? '#c4c9d1' : '#1e293b',
        cursor: 'pointer',
        borderBottom: flashOk ? '2px solid #2e7d32' : flashErr ? '2px solid #ef4444' : '1px dashed transparent',
        transition: 'border-color 150ms ease',
        fontFamily: mono ? "'DM Mono', ui-monospace, monospace" : 'inherit',
        fontVariantNumeric: 'tabular-nums',
        display: multiline ? 'block' : 'inline',
        width: multiline ? '100%' : 'auto',
        maxWidth: '100%',
        '&:hover': {
          borderBottomColor: flashOk || flashErr ? undefined : '#cbd5e1',
        },
      }}
    >
      {displayEmpty ? placeholder ?? '-' : formattedDisplay}
    </Box>
  );
}
