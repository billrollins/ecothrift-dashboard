import Box from '@mui/material/Box';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export function NoteInlineEditor({
  value,
  disabled,
  ariaLabel = 'Edit note',
  onCommit,
  onCancel,
}: {
  value: string;
  disabled?: boolean;
  ariaLabel?: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (cancelled.current) return;
    const next = draft.trim();
    if (!next || next === value.trim()) {
      onCancel();
      return;
    }
    onCommit(next);
  };

  return (
    <Box
      component="input"
      ref={ref}
      aria-label={ariaLabel}
      disabled={disabled}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          commit();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelled.current = true;
          onCancel();
        }
      }}
      sx={{
        boxSizing: 'border-box',
        flex: 1,
        minWidth: 0,
        width: '100%',
        height: 20,
        border: 'none',
        outline: 'none',
        bgcolor: 'transparent',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        fontWeight: 'inherit',
        color: '#0f172a',
      }}
    />
  );
}
