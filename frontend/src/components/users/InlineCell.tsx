/**
 * Directory cells you can change without opening the row.
 *
 * Always the same 32px box. A 1px border is always there and only changes
 * colour, so hover and focus never shove the row. Clicks stay on the field —
 * they do not open the detail drawer.
 *
 * A select commits as soon as the value changes. Text commits on Enter or
 * blur; Escape puts the previous value back.
 */
import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Box, TextField, Typography } from '@mui/material';

export const INLINE_HEIGHT = 32;

export type InlineOption = { value: string; label: string };

function stopRow(event: SyntheticEvent) {
  event.stopPropagation();
}

const FIELD_SX = {
  width: '100%',
  '& .MuiInputBase-root': {
    height: INLINE_HEIGHT,
    fontSize: '0.8125rem',
    fontWeight: 600,
  },
  '& .MuiInputBase-input': {
    py: 0,
    px: 1,
    height: INLINE_HEIGHT,
    boxSizing: 'border-box',
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderWidth: '1px',
    borderColor: 'transparent',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'divider',
  },
  '& .Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderWidth: '1px',
    borderColor: 'primary.main',
  },
} as const;

const SELECT_CHEVRON = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="%23666" d="M7 10l5 5 5-5z"/></svg>',
)}")`;

/** Reserved slot when the row has no profile to edit. Same height as a field. */
export function InlineEmpty({ children = '—' }: { children?: ReactNode }) {
  return (
    <Box
      sx={{
        width: '100%',
        height: INLINE_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        px: 1,
      }}
    >
      <Typography variant="body2" color="text.disabled" noWrap>
        {children}
      </Typography>
    </Box>
  );
}

export function InlineSelect({
  value,
  options,
  onCommit,
  disabled = false,
  emptyLabel,
  ariaLabel,
}: {
  value: string;
  options: InlineOption[];
  onCommit: (next: string) => void;
  disabled?: boolean;
  /** When set, a blank choice is offered and saved as ''. */
  emptyLabel?: string;
  ariaLabel: string;
}) {
  return (
    <Box
      component="select"
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onClick={stopRow}
      onMouseDown={stopRow}
      onKeyDown={stopRow}
      onChange={(e) => {
        const next = e.currentTarget.value;
        if (next === value) return;
        onCommit(next);
      }}
      sx={{
        display: 'block',
        width: '100%',
        height: INLINE_HEIGHT,
        boxSizing: 'border-box',
        pl: 1,
        pr: 2.75,
        border: '1px solid',
        borderColor: 'transparent',
        borderRadius: 1,
        bgcolor: 'transparent',
        color: value ? 'text.primary' : 'text.disabled',
        font: 'inherit',
        fontSize: '0.8125rem',
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        outline: 'none',
        appearance: 'none',
        WebkitAppearance: 'none',
        backgroundImage: SELECT_CHEVRON,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        '&:hover:not(:disabled)': { borderColor: 'divider' },
        '&:focus': { borderColor: 'primary.main' },
      }}
    >
      {emptyLabel != null ? <option value="">{emptyLabel}</option> : null}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Box>
  );
}

export function InlineText({
  value,
  onCommit,
  disabled = false,
  placeholder = '—',
  ariaLabel,
  display,
  parse,
}: {
  value: string;
  onCommit: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel: string;
  /** Show a formatted string while typing (phone mask). */
  display?: (raw: string) => string;
  /** Persist a cleaned string (digits only). */
  parse?: (draft: string) => string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setDraft(value);
  }, [value]);

  const shown = display ? display(draft) : draft;
  const empty = !shown;

  const commit = () => {
    focused.current = false;
    const next = parse ? parse(draft) : draft.trim();
    const current = parse ? parse(value) : value.trim();
    if (next === current) {
      setDraft(value);
      return;
    }
    onCommit(next);
  };

  return (
    <TextField
      size="small"
      value={shown}
      disabled={disabled}
      placeholder={placeholder}
      slotProps={{ htmlInput: { 'aria-label': ariaLabel } }}
      onClick={stopRow}
      onMouseDown={stopRow}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => setDraft(parse ? parse(e.target.value) : e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          setDraft(value);
          focused.current = false;
          (e.target as HTMLInputElement).blur();
        }
      }}
      sx={{
        ...FIELD_SX,
        '& .MuiInputBase-input': {
          ...FIELD_SX['& .MuiInputBase-input'],
          fontWeight: empty ? 500 : 600,
          color: empty ? 'text.disabled' : 'text.primary',
        },
      }}
    />
  );
}
