/**
 * A field you press, drag across, and release to answer.
 *
 * One gesture instead of three. Options open under the finger on press and
 * commit on release; releasing anywhere else cancels, so a mis-press costs
 * nothing. A quick tap leaves the options open, because a hand that has already
 * let go should not have to press again.
 *
 * The alternative — click to open, click to choose — doubles every input on a
 * screen that is answered dozens of times an hour, standing up, mid-teardown.
 */
import Box from '@mui/material/Box';
import Popper from '@mui/material/Popper';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { studio } from './tarsStudioTheme';

/** Under this, a press reads as a tap and the options stay up. */
const TAP_MS = 220;

export function PressPicker<T extends number>({
  value,
  options,
  format,
  placeholder,
  width = 62,
  disabled,
  ariaLabel,
  onChange,
}: {
  value: T | undefined;
  options: readonly T[];
  format: (value: T) => string;
  /** Shown muted when unanswered — the value the maths is using meanwhile. */
  placeholder: string;
  width?: number;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (value: T) => void;
}) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const openedAt = useRef(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    function commitFromPoint(x: number, y: number) {
      const el = document.elementFromPoint(x, y);
      const option = el?.closest<HTMLElement>('[data-press-option]');
      if (option) {
        onChange(Number(option.dataset.pressOption) as T);
        setOpen(false);
        return;
      }
      // A quick tap on the trigger leaves the options up to be clicked.
      const onTrigger = el && anchorRef.current?.contains(el);
      if (onTrigger && Date.now() - openedAt.current < TAP_MS) return;
      setOpen(false);
    }

    function handleUp(e: PointerEvent) {
      commitFromPoint(e.clientX, e.clientY);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    window.addEventListener('pointerup', handleUp);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onChange]);

  const unset = value == null;

  return (
    <>
      <Box
        component="button"
        type="button"
        ref={anchorRef}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        onPointerDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          openedAt.current = Date.now();
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openedAt.current = 0;
            setOpen((prev) => !prev);
          }
        }}
        sx={{
          width,
          height: 26,
          px: 0.5,
          cursor: disabled ? 'default' : 'pointer',
          fontFamily: 'monospace',
          fontSize: '0.8rem',
          fontWeight: 900,
          textAlign: 'center',
          borderRadius: `${studio.radius.sm}px`,
          border: `1px solid ${open ? studio.accent : unset ? '#e2e8f0' : studio.accentSoftBorder}`,
          bgcolor: open ? studio.accentSoft : unset ? '#f8fafc' : '#ffffff',
          color: unset ? '#b6c0cd' : '#0f172a',
          outline: 'none',
          '&:hover:not(:disabled)': { borderColor: studio.accent },
          '&:focus-visible': { borderColor: studio.accentDark, boxShadow: `0 0 0 2px ${studio.accentSoft}` },
        }}
      >
        {unset ? placeholder : format(value)}
      </Box>

      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        sx={{ zIndex: 1400 }}
        modifiers={[{ name: 'offset', options: { offset: [0, 3] } }]}
      >
        <Box
          sx={{
            display: 'flex',
            p: 0.4,
            gap: 0.3,
            borderRadius: `${studio.radius.md}px`,
            bgcolor: '#ffffff',
            border: `1px solid ${studio.accentSoftBorder}`,
            boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
          }}
        >
          {options.map((option) => {
            const active = option === value;
            return (
              <Box
                key={option}
                data-press-option={option}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                sx={{
                  minWidth: 40,
                  px: 0.75,
                  py: 0.55,
                  cursor: 'pointer',
                  textAlign: 'center',
                  borderRadius: `${studio.radius.sm}px`,
                  bgcolor: active ? studio.accentDark : 'transparent',
                  color: active ? '#ffffff' : '#334155',
                  '&:hover': { bgcolor: active ? studio.accentDark : studio.accentSoft },
                }}
              >
                <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.8rem', pointerEvents: 'none' }}>
                  {format(option)}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Popper>
    </>
  );
}
