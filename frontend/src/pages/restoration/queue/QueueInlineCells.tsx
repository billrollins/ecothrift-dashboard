/**
 * Fields you can fill in without opening anything.
 *
 * A queue gets worked twenty items at a time, so every extra click is paid
 * twenty times over. Focus selects what is there, typing replaces it, Tab moves
 * on and saves. There is no Save button because there is nothing to save at —
 * leaving a field is the commit.
 *
 * A field being edited never accepts values from the server underneath the
 * cursor; the draft wins until focus leaves.
 */
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { studio } from '../tars/studio/tarsStudioTheme';

/**
 * The height every inline field shares.
 *
 * Fields sit in different grid columns, so they only line up if each one is
 * the same caption-plus-input stack. One constant keeps that true.
 */
export const FIELD_HEIGHT = 26;

/** The caption above an inline field. Greyed when the field is empty. */
export function FieldLabel({ children, muted }: { children: string; muted?: boolean }) {
  return (
    <Typography
      noWrap
      sx={{
        fontSize: '0.56rem',
        fontWeight: 900,
        letterSpacing: 0.3,
        color: muted ? '#b6c0cd' : '#8593a5',
        textTransform: 'uppercase',
        mb: 0.2,
      }}
    >
      {children}
    </Typography>
  );
}

/** Compact money entry. Blank means "no price recorded", which is not zero. */
export function MoneyCell({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number | null;
  disabled?: boolean;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setDraft(value == null ? '' : String(value));
  }, [value]);

  function commit() {
    focused.current = false;
    const trimmed = draft.trim();
    if (trimmed === '') {
      if (value != null) onCommit(null);
      return;
    }
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed === value) {
      setDraft(value == null ? '' : String(value));
      return;
    }
    onCommit(parsed);
  }

  const empty = draft.trim() === '';

  return (
    <Box sx={{ minWidth: 0 }}>
      <FieldLabel muted={empty}>{label}</FieldLabel>
      <Box
        component="input"
        inputMode="decimal"
        aria-label={`${label} price`}
        disabled={disabled}
        value={draft}
        placeholder="—"
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(value == null ? '' : String(value));
            focused.current = false;
            e.currentTarget.blur();
          }
        }}
        sx={{
          width: 58,
          height: FIELD_HEIGHT,
          px: 0.5,
          fontFamily: 'monospace',
          fontSize: '0.8rem',
          fontWeight: 900,
          textAlign: 'center',
          color: '#0f172a',
          borderRadius: `${studio.radius.sm}px`,
          border: `1px solid ${empty ? '#e3b23c' : studio.accentSoftBorder}`,
          bgcolor: empty ? '#fffaf0' : '#ffffff',
          outline: 'none',
          '&:hover:not(:disabled)': { borderColor: studio.accent },
          '&:focus': { borderColor: studio.accentDark, boxShadow: `0 0 0 2px ${studio.accentSoft}` },
          '&::placeholder': { color: '#d9b76a', fontWeight: 700 },
        }}
      />
    </Box>
  );
}

/** A note, typed straight onto the row. */
export function NoteCell({
  label,
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setDraft(value);
  }, [value]);

  return (
    <Box sx={{ minWidth: 0 }}>
      <FieldLabel muted={draft.trim() === ''}>{label}</FieldLabel>
      <Box
        component="input"
        aria-label={label}
        disabled={disabled}
        value={draft}
        placeholder={placeholder}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => {
          focused.current = false;
          const trimmed = draft.trim();
          if (trimmed !== value) onCommit(trimmed);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(value);
            focused.current = false;
            e.currentTarget.blur();
          }
        }}
        sx={{
          width: '100%',
          height: FIELD_HEIGHT,
          px: 0.75,
          fontSize: '0.78rem',
          fontWeight: 600,
          color: '#334155',
          borderRadius: `${studio.radius.sm}px`,
          border: '1px solid transparent',
          bgcolor: 'transparent',
          outline: 'none',
          '&:hover:not(:disabled)': { borderColor: '#e2e8f0', bgcolor: '#f8fafc' },
          '&:focus': {
            borderColor: studio.accentDark,
            bgcolor: '#ffffff',
            boxShadow: `0 0 0 2px ${studio.accentSoft}`,
          },
          '&::placeholder': { color: '#b6c0cd', fontStyle: 'italic', fontWeight: 500 },
        }}
      />
    </Box>
  );
}
