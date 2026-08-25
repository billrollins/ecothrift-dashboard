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
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { studio } from '../tars/studio/tarsStudioTheme';

/**
 * Destination, Scale, Dispatch, and price boxes. Taller than the old 26px so
 * a tap aimed at the field does not miss into the row. The note stays
 * `NOTE_HEIGHT_PX` and still sets the row height.
 */
export const FIELD_HEIGHT = 39;

/** One line of note copy. Padding is layered around this, never instead of it. */
export const NOTE_LINE_HEIGHT_PX = 18;
export const NOTE_MIN_PAD_Y_PX = 6;
export const NOTE_BORDER_PX = 1;
export const NOTE_VISIBLE_LINES = 3;
/**
 * The note box is always this tall — empty, two lines, or a novel. Growing
 * with the text would shove the row the hand is already travelling toward.
 */
export const NOTE_HEIGHT_PX =
  NOTE_LINE_HEIGHT_PX * NOTE_VISIBLE_LINES + NOTE_MIN_PAD_Y_PX * 2 + NOTE_BORDER_PX * 2;

/**
 * Top/bottom padding that sits short copy in the middle of the 3-line box.
 *
 * Measure after padding has been reset to `minPad`. Overflowing notes keep
 * that minimum so the first line starts at the top and the rest scrolls.
 */
export function notePadY(scrollHeight: number, clientHeight: number, minPad = NOTE_MIN_PAD_Y_PX): number {
  const room = clientHeight - minPad * 2;
  if (room <= 0) return minPad;
  const text = scrollHeight - minPad * 2;
  if (text >= room - 0.5) return minPad;
  return minPad + (room - text) / 2;
}

function applyNotePad(el: HTMLTextAreaElement) {
  el.style.paddingTop = `${NOTE_MIN_PAD_Y_PX}px`;
  el.style.paddingBottom = `${NOTE_MIN_PAD_Y_PX}px`;
  const pad = notePadY(el.scrollHeight, el.clientHeight);
  el.style.paddingTop = `${pad}px`;
  el.style.paddingBottom = `${pad}px`;
}

/** The caption above an inline field. Greyed when the field is empty. */
export function FieldLabel({
  children,
  muted,
  overlay,
}: {
  children: string;
  muted?: boolean;
  /** Sit above a centred input without pushing it off the row's midline. */
  overlay?: boolean;
}) {
  return (
    <Typography
      noWrap
      sx={{
        fontSize: overlay ? '0.55rem' : '0.62rem',
        fontWeight: 800,
        letterSpacing: overlay ? 0.2 : 0.3,
        color: muted ? studio.inkFaint : studio.inkLabel,
        textTransform: 'uppercase',
        lineHeight: overlay ? 1.1 : undefined,
        mb: overlay ? 0 : 0.2,
        ...(overlay
          ? {
              position: 'absolute',
              top: 4,
              left: 0,
              right: 0,
              textAlign: 'center',
              pointerEvents: 'none',
            }
          : {}),
      }}
    >
      {children}
    </Typography>
  );
}

/** Reserved so $ and % occupy the same slot and the digits do not jump. */
const UNIT_RAIL_PX = 22;

/** Grouped amount with cents. The $ / % lives in the rail, not in this string. */
export function formatGradeAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function draftFromValue(value: number | null, unit?: 'usd' | 'pct'): string {
  if (value == null) return '';
  return unit == null ? String(value) : formatGradeAmount(value);
}

/** Compact money entry. Blank means "no price recorded", which is not zero. */
export function MoneyCell({
  label,
  value,
  disabled,
  onCommit,
  width = 58,
  unit,
}: {
  label: string;
  value: number | null;
  disabled?: boolean;
  onCommit: (value: number | null) => void;
  width?: number;
  unit?: 'usd' | 'pct';
}) {
  const [draft, setDraft] = useState(() => draftFromValue(value, unit));
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setDraft(draftFromValue(value, unit));
  }, [value, unit]);

  function revert() {
    setDraft(draftFromValue(value, unit));
  }

  function commit() {
    focused.current = false;
    const trimmed = draft.trim();
    if (trimmed === '') {
      if (value != null) onCommit(null);
      else revert();
      return;
    }
    const parsed = Number.parseFloat(trimmed.replace(/[$,%\s,]/g, ''));
    if (!Number.isFinite(parsed) || parsed < 0) {
      revert();
      return;
    }
    if (parsed === value) {
      revert();
      return;
    }
    onCommit(parsed);
  }

  const empty = draft.trim() === '';
  const border = empty ? '#a67c12' : studio.accent;
  const grouped = unit != null;

  return (
    <Box
      sx={{
        position: 'relative',
        height: NOTE_HEIGHT_PX,
        width,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <FieldLabel muted={empty} overlay>
        {label}
      </FieldLabel>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          width,
          height: FIELD_HEIGHT,
          borderRadius: `${studio.radius.sm}px`,
          border: `1px solid ${border}`,
          bgcolor: empty ? '#fff3cd' : studio.panel,
          overflow: 'hidden',
          '&:hover:not(:has(input:disabled))': { borderColor: studio.accent },
          '&:focus-within': {
            borderColor: studio.accentDark,
            boxShadow: `0 0 0 2px ${studio.accentSoft}`,
          },
        }}
      >
        {grouped ? (
          <Box
            aria-hidden
            sx={{
              width: UNIT_RAIL_PX,
              minWidth: UNIT_RAIL_PX,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRight: `1px solid ${studio.rule}`,
              fontFamily: 'monospace',
              fontSize: '0.78rem',
              fontWeight: 900,
              color: studio.inkLabel,
              pointerEvents: 'none',
            }}
          >
            {unit === 'pct' ? '%' : '$'}
          </Box>
        ) : null}
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
              revert();
              focused.current = false;
              e.currentTarget.blur();
            }
          }}
          sx={{
            flex: 1,
            minWidth: 0,
            width: grouped ? 'auto' : width,
            height: '100%',
            px: 0.5,
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            fontWeight: 900,
            textAlign: 'center',
            color: studio.ink,
            border: 'none',
            bgcolor: 'transparent',
            outline: 'none',
            '&::placeholder': { color: '#6b4f0e', fontWeight: 700 },
          }}
        />
      </Box>
    </Box>
  );
}

/** A note, typed straight onto the row. Always three lines; extra copy scrolls. */
export function NoteCell({
  label,
  value,
  placeholder,
  disabled,
  boxed,
  padEnd,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  /** Visible field chrome. The queue row stays borderless so the note sits in the card. */
  boxed?: boolean;
  /** Leave the top-right corner clear for a tucked count. */
  padEnd?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const skipCommit = useRef(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  /** Until the user moves the note's own scrollbar, keep showing the first line. */
  const pinTop = useRef(true);

  useEffect(() => {
    if (focused.current) return;
    setDraft((prev) => {
      if (prev === value) return prev;
      pinTop.current = true;
      return value;
    });
  }, [value]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const keep = el.scrollTop;
    applyNotePad(el);
    el.scrollTop = pinTop.current ? 0 : keep;
  }, [draft]);

  return (
    <Box sx={{ minWidth: 0, width: '100%' }}>
      <Box
        component="textarea"
        ref={areaRef}
        aria-label={label}
        disabled={disabled}
        value={draft}
        placeholder={placeholder}
        rows={1}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onScroll={(e) => {
          if (e.currentTarget.scrollTop > 0) pinTop.current = false;
        }}
        onBlur={() => {
          focused.current = false;
          if (skipCommit.current) {
            skipCommit.current = false;
            return;
          }
          const trimmed = draft.trim();
          if (trimmed !== value) onCommit(trimmed);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.currentTarget.blur();
            return;
          }
          if (e.key === 'Escape') {
            skipCommit.current = true;
            setDraft(value);
            focused.current = false;
            e.currentTarget.blur();
          }
        }}
        sx={{
          display: 'block',
          boxSizing: 'border-box',
          width: '100%',
          height: NOTE_HEIGHT_PX,
          minHeight: NOTE_HEIGHT_PX,
          maxHeight: NOTE_HEIGHT_PX,
          px: 0.75,
          pr: padEnd ? '26px' : 0.75,
          py: `${NOTE_MIN_PAD_Y_PX}px`,
          resize: 'none',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          scrollbarGutter: 'stable',
          lineHeight: `${NOTE_LINE_HEIGHT_PX}px`,
          fontFamily: 'inherit',
          fontSize: '0.78rem',
          fontWeight: 600,
          color: studio.ink,
          borderRadius: `${studio.radius.sm}px`,
          border: `${NOTE_BORDER_PX}px solid ${boxed ? studio.panelBorder : 'transparent'}`,
          bgcolor: boxed ? studio.panel : 'transparent',
          outline: 'none',
          '&:hover:not(:disabled)': { borderColor: studio.panelBorder, bgcolor: '#f3f6f3' },
          '&:focus': {
            borderColor: studio.accentDark,
            bgcolor: studio.panel,
            boxShadow: `0 0 0 2px ${studio.accentSoft}`,
          },
          '&::placeholder': { color: studio.inkFaint, fontStyle: 'italic', fontWeight: 500 },
        }}
      />
    </Box>
  );
}
