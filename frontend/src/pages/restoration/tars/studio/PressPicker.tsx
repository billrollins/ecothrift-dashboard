/**
 * A field you press, drag across, and release to answer.
 *
 * One gesture instead of three. Options open under the finger on press and
 * commit on release; releasing anywhere else cancels, so a mis-press costs
 * nothing. A quick tap leaves the options open, because a hand that has already
 * let go should not have to press again.
 *
 * The alternative - click to open, click to choose - doubles every input on a
 * screen that is answered dozens of times an hour, standing up, mid-teardown.
 */
import Box from '@mui/material/Box';
import Popper from '@mui/material/Popper';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { studio } from './tarsStudioTheme';

/** Under this, a press reads as a tap and the options stay up. */
const TAP_MS = 220;

export type PressPaint = {
  bgcolor: string;
  border: string;
  color: string;
  strong: string;
  onStrong: string;
  /** Closed-chip fade on a dark console. Omit on light fields. */
  bgcolorTo?: string;
  /** Option on the light menu - dark ink, not the console's pale type. */
  menuBgcolor?: string;
  menuBgcolorTo?: string;
  menuColor?: string;
};

function fade(from: string, to: string): string {
  return `linear-gradient(180deg, ${from} 0%, ${to} 100%)`;
}

/** Light-menu chips: dark ink on a tinted fade. Dark-console paint stays on the trigger. */
function optionSurface(paint: PressPaint | undefined, active: boolean) {
  if (paint?.menuColor) {
    const from = active ? (paint.menuBgcolor ?? '#f4f7f5') : '#ffffff';
    const to = active
      ? (paint.menuBgcolorTo ?? paint.menuBgcolor ?? '#dce8df')
      : (paint.menuBgcolor ?? '#f4f7f5');
    return {
      borderColor: active ? paint.strong : paint.border,
      background: fade(from, to),
      color: paint.menuColor,
    };
  }
  if (paint) {
    return {
      borderColor: active ? paint.strong : paint.border,
      bgcolor: paint.bgcolor,
      color: paint.color,
    };
  }
  return {
    borderColor: active ? studio.accentDark : 'transparent',
    bgcolor: active ? studio.accentDark : 'transparent',
    color: active ? '#ffffff' : '#334155',
  };
}

function optionHover(paint: PressPaint | undefined, active: boolean) {
  if (paint?.menuColor) {
    const from = paint.menuBgcolor ?? '#f4f7f5';
    const to = paint.menuBgcolorTo ?? '#dce8df';
    return {
      borderColor: paint.strong,
      background: fade(from, to),
      color: paint.menuColor,
    };
  }
  if (paint) {
    return {
      borderColor: paint.strong,
      bgcolor: paint.bgcolor,
    };
  }
  return {
    borderColor: studio.accent,
    bgcolor: active ? studio.accentDark : studio.accentSoft,
  };
}

export function PressPicker<T extends string | number>({
  value,
  options,
  format,
  placeholder,
  width = 62,
  height = 26,
  disabled,
  ariaLabel,
  variant = 'field',
  tone = 'light',
  layout = 'row',
  wrap = false,
  optionMinWidth,
  fontSize,
  embedded,
  paint,
  optionTone,
  optionDot,
  optionGroup,
  onChange,
}: {
  value: T | undefined;
  options: readonly T[];
  format: (value: T) => string;
  /** Shown muted when unanswered - the value the maths is using meanwhile. */
  placeholder: string;
  width?: number | string;
  height?: number | string;
  disabled?: boolean;
  ariaLabel: string;
  /** Action is a verb (Dispatch), not a stored answer. */
  variant?: 'field' | 'action' | 'key';
  /** Menu drops a vertical list - right for named scales, not for $10/$20/$30. */
  layout?: 'row' | 'menu';
  /** Let the label sit on two lines inside a taller box, instead of clipping. */
  wrap?: boolean;
  /** Row options default to 40. Named verbs need more. */
  optionMinWidth?: number;
  fontSize?: number | string;
  /** Sit inside a parent field - no own border or radius. */
  embedded?: boolean;
  /** Colour for a chosen value. Unset keeps the yellow "needs a pick" wash. */
  paint?: (value: T) => PressPaint | undefined;
  /** Blocked stays pressable - the host opens an explainer instead of committing. */
  optionTone?: (value: T) => 'ready' | 'blocked';
  /** Colour dot before the label. Overview Dispatch uses list accents. */
  optionDot?: (value: T) => string | undefined;
  /** Heading shown above a run of options that share a group. */
  optionGroup?: (value: T) => string | undefined;
  tone?: 'light' | 'dark';
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
        const raw = option.dataset.pressOption ?? '';
        onChange((typeof options[0] === 'number' ? Number(raw) : raw) as T);
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
  }, [open, onChange, options]);

  const unset = value == null;
  const action = variant === 'action';
  const key = variant === 'key';
  const menu = layout === 'menu';
  const dark = tone === 'dark';
  const swatch = !unset && value != null ? paint?.(value) : undefined;

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
        sx={
          action
            ? {
                width,
                height,
                px: 1.15,
                cursor: disabled ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                fontSize: '0.78rem',
                fontWeight: 900,
                textAlign: 'center',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: dark
                  ? open ? '#3d8a81' : '#2f6f68'
                  : studio.accentDark,
                bgcolor: dark
                  ? open ? '#1c6a61' : '#17564f'
                  : open ? studio.accent : studio.accentDark,
                color: disabled
                  ? dark ? '#5c6b83' : '#94a3b8'
                  : dark ? '#c9f2e9' : '#ffffff',
                outline: 'none',
                '&:hover:not(:disabled)': {
                  bgcolor: dark ? '#1c6a61' : studio.accent,
                  borderColor: dark ? '#3d8a81' : studio.accent,
                },
                '&:focus-visible': { boxShadow: `0 0 0 2px ${studio.accentSoft}` },
              }
            : key
              ? {
                  boxSizing: 'border-box',
                  width,
                  height,
                  px: 0.75,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: disabled ? 'default' : 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: 900,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  borderRadius: `${studio.radius.sm}px`,
                  border: `1px solid ${open ? studio.accent : unset ? '#a67c12' : studio.accent}`,
                  bgcolor: unset ? '#fff3cd' : studio.accentSoft,
                  color: unset ? '#6b4f0e' : studio.inkLabel,
                  outline: 'none',
                  '&:hover:not(:disabled)': { borderColor: studio.accent },
                  '&:focus-visible': { borderColor: studio.accentDark, boxShadow: `0 0 0 2px ${studio.accentSoft}` },
                }
            : {
                boxSizing: 'border-box',
                width,
                height,
                px: wrap ? 0.7 : 0.5,
                py: wrap ? 0.4 : 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: disabled ? 'default' : 'pointer',
                fontFamily: wrap || paint || dark ? 'inherit' : 'monospace',
                fontSize: fontSize ?? (wrap ? '0.75rem' : paint || dark ? '0.72rem' : '0.8rem'),
                fontWeight: paint || dark ? 700 : 900,
                textAlign: 'center',
                lineHeight: wrap ? 1.2 : 1,
                whiteSpace: wrap ? 'normal' : 'nowrap',
                overflow: 'hidden',
                textOverflow: wrap ? undefined : 'ellipsis',
                borderRadius: embedded ? 0 : `${studio.radius.sm}px`,
                border: embedded
                  ? 'none'
                  : `1px solid ${
                      open
                        ? (swatch?.border ?? (dark ? '#8aa0b5' : studio.accent))
                        : unset
                          ? paint || dark
                            ? '#a67c12'
                            : studio.panelBorder
                          : (swatch?.border ?? (dark ? '#6d7d90' : studio.accentSoftBorder))
                    }`,
                background: unset
                  ? paint || dark
                    ? dark
                      ? 'rgba(201, 162, 39, 0.22)'
                      : '#fff3cd'
                    : dark
                      ? 'rgba(255,255,255,0.06)'
                      : studio.canvas
                  : swatch
                    ? swatch.bgcolorTo
                      ? `linear-gradient(180deg, ${swatch.bgcolor} 0%, ${swatch.bgcolorTo} 100%)`
                      : swatch.bgcolor
                    : open
                      ? dark
                        ? 'rgba(255,255,255,0.12)'
                        : studio.accentSoft
                      : dark
                        ? 'rgba(255,255,255,0.10)'
                        : studio.panel,
                color: unset
                  ? paint || dark
                    ? dark
                      ? '#e8d48b'
                      : '#6b4f0e'
                    : dark
                      ? '#9aa8b8'
                      : studio.inkFaint
                  : swatch
                    ? swatch.color
                    : dark
                      ? '#f1f5f9'
                      : studio.ink,
                outline: 'none',
                '&:hover:not(:disabled)': embedded
                  ? { filter: 'brightness(0.97)' }
                  : {
                      borderColor: swatch?.strong ?? (dark ? '#a8b8c8' : studio.accent),
                    },
                '&:focus-visible': embedded
                  ? { boxShadow: `inset 0 0 0 2px ${studio.accentSoft}` }
                  : {
                      borderColor: swatch?.strong ?? (dark ? '#c5d0dc' : studio.accentDark),
                      boxShadow: `0 0 0 2px ${studio.accentSoft}`,
                    },
              }
        }
      >
        {action || unset ? placeholder : format(value)}
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
            flexDirection: menu ? 'column' : 'row',
            p: 0.4,
            gap: 0.3,
            minWidth: menu ? (typeof width === 'number' ? width : 128) : undefined,
            borderRadius: `${studio.radius.md}px`,
            background: 'linear-gradient(180deg, #ffffff 0%, #f3f5f7 100%)',
            border: `1px solid ${studio.panelBorder}`,
            boxShadow: '0 10px 28px rgba(15,23,42,0.22)',
          }}
        >
          {options.map((option, index) => {
            const active = option === value;
            const optionPaint = paint?.(option);
            const blocked = optionTone?.(option) === 'blocked';
            const dot = optionDot?.(option);
            const group = optionGroup?.(option);
            const prevGroup = index > 0 ? optionGroup?.(options[index - 1]) : undefined;
            const showGroup = Boolean(group) && group !== prevGroup;
            return (
              <Box key={option}>
                {showGroup ? (
                  <Typography
                    sx={{
                      px: 1.1,
                      pt: 0.7,
                      pb: 0.25,
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                      color: studio.inkMuted,
                    }}
                  >
                    {group}
                  </Typography>
                ) : null}
              <Box
                data-press-option={option}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                sx={{
                  minWidth: menu ? undefined : action ? 72 : (optionMinWidth ?? 40),
                  px: action || menu ? 1.1 : 0.75,
                  py: menu ? 0.7 : 0.55,
                  cursor: 'pointer',
                  textAlign: menu ? 'left' : 'center',
                  borderRadius: `${studio.radius.sm}px`,
                  border: '1px solid',
                  ...optionSurface(optionPaint, active),
                  opacity: blocked ? 0.45 : 1,
                  '&:hover': {
                    ...optionHover(optionPaint, active),
                    opacity: blocked ? 0.7 : 1,
                  },
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: menu || dot ? 'flex-start' : 'center',
                    gap: 0.85,
                    pointerEvents: 'none',
                  }}
                >
                  {dot ? (
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: dot,
                        flexShrink: 0,
                      }}
                    />
                  ) : null}
                  <Typography
                    sx={{
                      fontFamily: action || menu || wrap ? 'inherit' : 'monospace',
                      fontWeight: paint ? 700 : 900,
                      fontSize: '0.8rem',
                      lineHeight: wrap ? 1.2 : undefined,
                    }}
                  >
                    {format(option)}
                  </Typography>
                </Box>
              </Box>
              </Box>
            );
          })}
        </Box>
      </Popper>
    </>
  );
}
