/**
 * One order field in the Order window (Dash Update #191). Read and edit look the same: the value as text, in the
 * surrounding font. Editable (the owner), a click turns it into an input in place; Enter or leaving the field saves,
 * Escape puts it back. Read only (everyone else), it is plain selectable text. A saved field flashes a green line,
 * a failed one red.
 */
import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import {
  preventWheelChangeNumber,
  sanitizeDecimalPaste,
  selectInputContentsOnFocus,
} from '../../../utils/formInputs';

export interface InlineEditableValueProps {
  /** Matches the keys in `savedKey` / `failedKey` (the field's API name). */
  fieldId: string;
  value: string;
  displayFormatter?: (v: string) => string;
  onCommit: (next: string) => void;
  type?: 'text' | 'currency' | 'integer' | 'date' | 'select';
  /** For `select`. */
  options?: { value: string; label: string }[];
  placeholder?: string;
  savedKey?: string | null;
  failedKey?: string | null;
  multiline?: boolean;
  readOnly?: boolean;
  /** Screen-reader name of the field (its label). */
  label?: string;
}

const flashes = (key: string | null | undefined, id: string) => Boolean(key?.split(',').includes(id));

export default function InlineEditableValue({
  fieldId,
  value,
  displayFormatter,
  onCommit,
  type = 'text',
  options,
  placeholder,
  savedKey,
  failedKey,
  multiline,
  readOnly,
  label,
}: InlineEditableValueProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    el?.focus();
    if (el && 'select' in el && typeof el.select === 'function' && type !== 'date') el.select();
  }, [editing, type]);

  const ok = flashes(savedKey, fieldId);
  const bad = flashes(failedKey, fieldId);
  const empty = !value;
  const shown = empty
    ? placeholder ?? '-'
    : type === 'select'
      ? options?.find((o) => o.value === value)?.label ?? value
      : displayFormatter
        ? displayFormatter(value)
        : value;

  const commitValue = (raw: string) => {
    setEditing(false);
    const next = type === 'text' ? raw.trimEnd() : raw.trim();
    if (next === (value ?? '').trim()) return;
    onCommit(next);
  };
  const revert = () => {
    setDraft(value);
    setEditing(false);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      revert();
    }
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      commitValue(draft);
    }
  };

  // Same font as the text around it, so the input sits where the value was.
  const inputSx = {
    font: 'inherit', color: 'inherit', fontVariantNumeric: 'tabular-nums', border: 0, outline: 'none', p: 0, m: 0,
    bgcolor: 'transparent', borderBottom: 2, borderColor: 'text.primary', width: '100%', boxSizing: 'border-box',
  } as const;

  if (editing && !readOnly) {
    if (type === 'select') {
      return (
        <Box
          component="select"
          ref={ref as React.RefObject<HTMLSelectElement>}
          aria-label={label}
          value={draft}
          onChange={(e) => commitValue((e.target as HTMLSelectElement).value)}
          onBlur={() => setEditing(false)}
          onKeyDown={keys}
          sx={inputSx}
        >
          <option value="">-</option>
          {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Box>
      );
    }
    if (multiline) {
      return (
        <Box
          component="textarea"
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          aria-label={label}
          value={draft}
          maxLength={500}
          rows={2}
          onChange={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
          onBlur={() => commitValue(draft)}
          onKeyDown={keys}
          sx={{ ...inputSx, resize: 'vertical', display: 'block' }}
        />
      );
    }
    return (
      <Box
        component="input"
        ref={ref as React.RefObject<HTMLInputElement>}
        aria-label={label}
        type={type === 'date' ? 'date' : type === 'integer' ? 'number' : 'text'}
        inputMode={type === 'currency' ? 'decimal' : type === 'integer' ? 'numeric' : undefined}
        value={draft}
        onChange={(e) => setDraft((e.target as HTMLInputElement).value)}
        onBlur={() => commitValue(draft)}
        onFocus={type === 'date' ? undefined : selectInputContentsOnFocus}
        onWheel={type === 'integer' || type === 'currency' ? preventWheelChangeNumber : undefined}
        onPaste={type === 'currency' ? (e) => {
          e.preventDefault();
          setDraft(sanitizeDecimalPaste(e.clipboardData.getData('text')));
        } : undefined}
        onKeyDown={keys}
        sx={inputSx}
      />
    );
  }

  const line = ok ? 'success.main' : bad ? 'error.main' : 'transparent';
  if (readOnly) {
    return (
      <Box component="span" sx={{ color: empty ? 'text.secondary' : 'inherit', whiteSpace: multiline ? 'pre-wrap' : undefined }}>
        {empty ? '-' : shown}
      </Box>
    );
  }
  return (
    <Box
      component="span"
      role="button"
      tabIndex={0}
      aria-label={label ? `${label}: ${empty ? 'not set' : shown}` : undefined}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
      sx={{
        cursor: 'text', color: empty ? 'text.secondary' : 'inherit', whiteSpace: multiline ? 'pre-wrap' : undefined,
        borderBottom: 2, borderColor: line, transition: 'border-color 150ms ease', outline: 'none',
        '&:hover, &:focus-visible': { borderColor: ok || bad ? line : 'divider' },
      }}
    >
      {shown}
    </Box>
  );
}
