import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import TextField from '@mui/material/TextField';
import type { RefObject } from 'react';
import { studio } from '../tars/studio/tarsStudioTheme';

/** SKU scan that finds an item on Overview. It never checks one in. */
export function RestorationScanField({
  value,
  onChange,
  onSubmit,
  inputRef,
  fill,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Fill the scoreboard strip - full height, right side. */
  fill?: boolean;
}) {
  return (
    <TextField
      placeholder="Scan SKU…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
      inputRef={inputRef}
      inputProps={{ 'aria-label': 'Scan SKU', autoComplete: 'off', autoCapitalize: 'off', spellCheck: false }}
      InputProps={{
        startAdornment: (
          <QrCodeScanner sx={{ mr: fill ? 1.25 : 0.75, color: fill ? studio.accentDark : studio.inkMuted, fontSize: fill ? 28 : 18 }} />
        ),
      }}
      sx={
        fill
          ? {
              width: '100%',
              height: '100%',
              '& .MuiOutlinedInput-root': {
                height: '100%',
                alignItems: 'center',
                justifyContent: 'flex-end',
                px: 2,
                bgcolor: '#cfe3d2',
                borderRadius: 0,
                fontSize: '1.35rem',
                fontWeight: 800,
                fontFamily: 'monospace',
                color: studio.ink,
                '& fieldset': { border: 'none', borderLeft: `2px solid ${studio.accentDark}` },
                '&:hover fieldset': { borderLeftColor: studio.accentDark },
                '&.Mui-focused fieldset': { borderLeftColor: studio.inkLabel },
                '& input': {
                  textAlign: 'right',
                  py: 0,
                  height: '100%',
                  boxSizing: 'border-box',
                  '&::placeholder': { color: studio.inkMuted, opacity: 1, fontWeight: 700 },
                },
              },
            }
          : {
              width: { xs: 150, sm: 210, lg: 250 },
              '& .MuiOutlinedInput-root': {
                height: 38,
                bgcolor: studio.panel,
                borderRadius: `${studio.radius.sm}px`,
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                color: studio.ink,
                '& fieldset': { borderColor: studio.panelBorder },
                '&:hover fieldset': { borderColor: studio.accent },
                '&.Mui-focused fieldset': { borderColor: studio.accentDark },
              },
            }
      }
    />
  );
}

/** History stays open when the click is the drawer, a row, or a picker/dialog. */
export function shouldKeepHistoryDrawer(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-overview-history]')) return true;
  if (target.closest('[data-restoration-job]')) return true;
  return target.closest('[role="dialog"], [role="menu"], [role="listbox"], .MuiPopper-root') != null;
}

/** True when focus should stay put - notes, prices, dialogs, open pickers. */
export function isHeldScanFocus(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('[role="dialog"], [role="menu"], [role="listbox"], .MuiPopper-root, .MuiModal-root, [data-overview-history]')) {
    return true;
  }
  if (el.closest('[data-press-option]')) return true;
  if (el.closest('button[aria-expanded="true"]')) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['button', 'submit', 'checkbox', 'radio', 'file', 'hidden'].includes(type);
  }
  return false;
}
