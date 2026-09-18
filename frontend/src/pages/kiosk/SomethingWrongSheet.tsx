import { useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { ShiftPicker } from '../../components/hr/ShiftPicker';
import type { KioskPreview } from '../../api/kiosk.api';
import { tk, type AppLanguage } from '../../i18n/kiosk';
import { bigButtonSx, kioskColors, mediumButtonSx } from './kioskTheme';
import { clockLabel } from './kioskLang';

export type WrongChoice = 'wrong_shift' | 'wrong_start' | 'forgot_break';

/** Hosted only: relabel the punch, or file a start-time / break request. */
export function SomethingWrongSheet({
  preview,
  lang,
  pending,
  onSetShift,
  onRequest,
  onBack,
  onChoice,
}: {
  preview: KioskPreview;
  lang: AppLanguage;
  pending: boolean;
  onSetShift: (shift: string) => void;
  onRequest: (kind: 'wrong_start' | 'forgot_break', value: string | number) => void;
  onBack: () => void;
  onChoice?: (choice: WrongChoice | null) => void;
}) {
  const [choice, setChoiceState] = useState<WrongChoice | null>(null);
  const [start, setStart] = useState(() => {
    const iso = preview.punch?.clock_in;
    if (!iso) return '';
    const label = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
    return label;
  });
  const [minutes, setMinutes] = useState('30');

  function setChoice(next: WrongChoice | null) {
    setChoiceState(next);
    onChoice?.(next);
  }

  if (choice === null) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography sx={{ fontSize: 30, fontWeight: 900, color: kioskColors.ink }}>{tk('somethingWrong', lang)}</Typography>
        {(
          [
            ['wrong_shift', 'wrongShift', 'wrongShiftHint'],
            ['wrong_start', 'wrongStart', 'wrongStartHint'],
            ['forgot_break', 'forgotBreak', 'forgotBreakHint'],
          ] as Array<[WrongChoice, string, string]>
        ).map(([key, title, hint]) => (
          <Button
            key={key}
            variant="outlined"
            onClick={() => setChoice(key)}
            sx={{ ...bigButtonSx, justifyContent: 'flex-start', textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25, color: kioskColors.ink, borderColor: kioskColors.panelEdge, bgcolor: 'rgba(255,255,255,0.04)' }}
          >
            <Box component="span">{tk(title, lang)}</Box>
            <Box component="span" sx={{ fontSize: 15, fontWeight: 600, color: kioskColors.ink60 }}>{tk(hint, lang)}</Box>
          </Button>
        ))}
        <Button onClick={onBack} sx={{ ...mediumButtonSx, alignSelf: 'flex-start', color: kioskColors.ink60 }}>{tk('back', lang)}</Button>
      </Box>
    );
  }

  if (choice === 'wrong_shift') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography sx={{ fontSize: 30, fontWeight: 900, color: kioskColors.ink }}>{tk('wrongShift', lang)}</Typography>
        <Typography sx={{ fontSize: 17, color: kioskColors.ink60 }}>{tk('wrongShiftHint', lang)}</Typography>
        <Box sx={{ bgcolor: '#fff', borderRadius: 2.5, p: 2 }}>
          <ShiftPicker value={preview.punch?.shift} pending={pending} onPick={onSetShift} lang={lang} tiles={preview.tiles} />
        </Box>
        <Button onClick={() => setChoice(null)} sx={{ ...mediumButtonSx, alignSelf: 'flex-start', color: kioskColors.ink60 }}>{tk('back', lang)}</Button>
      </Box>
    );
  }

  if (choice === 'wrong_start') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography sx={{ fontSize: 30, fontWeight: 900, color: kioskColors.ink }}>{tk('wrongStart', lang)}</Typography>
        <Typography sx={{ fontSize: 17, color: kioskColors.ink60 }}>
          {tk('wrongStartHint', lang)}
          {preview.punch ? ` (${clockLabel(preview.punch.clock_in, lang)})` : ''}
        </Typography>
        <TextField
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          inputProps={{ step: 300, style: { fontSize: 28, fontWeight: 700 } }}
          sx={{ '& .MuiInputBase-root': { bgcolor: '#fff', maxWidth: 240 } }}
        />
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button onClick={() => setChoice(null)} sx={{ ...mediumButtonSx, color: kioskColors.ink60 }}>{tk('back', lang)}</Button>
          <Button variant="contained" disabled={pending || !start} onClick={() => onRequest('wrong_start', start)} sx={{ ...bigButtonSx, bgcolor: kioskColors.brand }}>
            {tk('sendRequest', lang)}
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography sx={{ fontSize: 30, fontWeight: 900, color: kioskColors.ink }}>{tk('forgotBreak', lang)}</Typography>
      <Typography sx={{ fontSize: 17, color: kioskColors.ink60 }}>{tk('forgotBreakHint', lang)}</Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {['15', '30', '45', '60'].map((n) => (
          <Button key={n} variant={minutes === n ? 'contained' : 'outlined'} onClick={() => setMinutes(n)} sx={{ ...mediumButtonSx, minWidth: 88, color: minutes === n ? '#fff' : kioskColors.ink, borderColor: kioskColors.panelEdge }}>
            {n} {tk('minutes', lang)}
          </Button>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Button onClick={() => setChoice(null)} sx={{ ...mediumButtonSx, color: kioskColors.ink60 }}>{tk('back', lang)}</Button>
        <Button variant="contained" disabled={pending} onClick={() => onRequest('forgot_break', Number(minutes))} sx={{ ...bigButtonSx, bgcolor: kioskColors.brand }}>
          {tk('sendRequest', lang)}
        </Button>
      </Box>
    </Box>
  );
}
