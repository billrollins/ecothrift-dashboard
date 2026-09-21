import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import WarningAmber from '@mui/icons-material/WarningAmber';
import type { AxiosError } from 'axios';
import { ShiftPicker } from '../../components/hr/ShiftPicker';
import {
  kioskBreak,
  kioskClockIn,
  kioskClockOut,
  kioskFixStale,
  kioskRequestEdit,
  kioskSetShift,
  type GatePayload,
  type KioskErrorBody,
  type KioskPreview,
  type KioskRoute,
} from '../../api/kiosk.api';
import { tk, type AppLanguage } from '../../i18n/kiosk';
import { GateSteps } from './GateSteps';
import { SomethingWrongSheet, type WrongChoice } from './SomethingWrongSheet';
import { bigButtonSx, kioskColors, mediumButtonSx } from './kioskTheme';
import { clockLabel, dayClockLabel, hhmmLabel } from './kioskLang';
import { overlayTimeoutMs, useOverlayTimeout } from './useOverlayTimeout';

type Screen = 'stale' | 'gate' | 'out' | 'in' | 'wrong' | 'success';

type Success = { key: string; at?: string; shift?: string };

function firstScreen(preview: KioskPreview): Screen {
  if (preview.state === 'stale') return 'stale';
  if (preview.state === 'out' && preview.gate.some((g) => g.kind !== 'stale_punch')) return 'gate';
  return preview.state === 'out' ? 'out' : 'in';
}

export function errorMessage(err: unknown, lang: AppLanguage): string {
  const body = (err as AxiosError<KioskErrorBody>)?.response?.data;
  if (body?.code === 'card') return tk('cardNotRecognized', lang);
  if (body?.code === 'already_in') return tk('alreadyIn', lang);
  if (typeof body?.detail === 'string' && body.detail.trim()) return body.detail;
  return tk('genericError', lang);
}

const SUCCESS_KEY: Record<string, string> = {
  clock_in: 'successClockIn',
  clock_out: 'successClockOut',
  break_start: 'successBreakStart',
  break_end: 'successBreakEnd',
  set_shift: 'successSetShift',
  fix_stale: 'successFixStale',
  request_edit: 'successRequest',
};

/**
 * The scan overlay. Hosted and public share it; `route` decides which API
 * client is used and whether the pay-edit tools ("Something's wrong") show.
 */
export function PunchOverlay({
  route,
  token,
  initial,
  lang,
  onClose,
  onChanged,
}: {
  route: KioskRoute;
  token: string;
  initial: KioskPreview;
  lang: AppLanguage;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [preview, setPreview] = useState<KioskPreview>(initial);
  const [screen, setScreen] = useState<Screen>(() => firstScreen(initial));
  const [picking, setPicking] = useState(false);
  const [wrongChoice, setWrongChoice] = useState<WrongChoice | null>(null);
  const [gate, setGate] = useState<GatePayload>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<Success | null>(null);

  const pickerOpen = screen === 'out' && (
    picking || !preview.suggested_shift || preview.suggested_shift_unmatched
  );
  const timeoutMs = overlayTimeoutMs(screen, pickerOpen);
  const bump = useOverlayTimeout(true, timeoutMs, onClose);

  useEffect(() => {
    if (screen === 'success') onChanged();
  }, [screen, onChanged]);

  const run = useCallback(
    async (call: () => Promise<{ data: KioskPreview }>, after?: (next: KioskPreview) => void) => {
      setPending(true);
      setError('');
      try {
        const { data } = await call();
        setPreview(data);
        if (after) after(data);
        else if (data.result?.action) {
          setSuccess({ key: SUCCESS_KEY[data.result.action] ?? 'done', at: data.result.at, shift: data.result.shift });
          setScreen('success');
        }
      } catch (err) {
        const body = (err as AxiosError<KioskErrorBody>)?.response?.data;
        if (body?.code === 'already_in') {
          // Not an error: someone scanned twice. Show the In screen.
          setScreen('in');
        } else if (body?.code === 'missed_routines' || body?.code === 'nudge' || body?.code === 'stale_punch') {
          setError(errorMessage(err, lang));
          setScreen(body.code === 'stale_punch' ? 'stale' : 'gate');
        } else {
          setError(errorMessage(err, lang));
        }
      } finally {
        setPending(false);
      }
    },
    [lang],
  );

  const shiftLabel = useMemo(() => {
    const code = preview.punch?.shift;
    if (!code) return '';
    return preview.punch?.shift_name || preview.tiles.find((t) => t.punch_code === code)?.name || code;
  }, [preview]);

  const warnings: string[] = [];
  if (preview.warnings.store_closed) warnings.push(tk('warnStoreClosed', lang));
  if (preview.warnings.overtime) warnings.push(tk('warnOvertime', lang));
  if (preview.warnings.late && screen === 'out') {
    warnings.push(tk('warnLate', lang, { minutes: preview.warnings.late.minutes, shift: preview.warnings.late.shift_name }));
  }

  function header() {
    return (
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Typography data-testid="overlay-name" sx={{ fontSize: 40, fontWeight: 900, color: kioskColors.ink, lineHeight: 1 }}>
          {preview.full_name || preview.name}
        </Typography>
        <Button onClick={onClose} sx={{ ...mediumButtonSx, color: kioskColors.ink60 }}>{tk('cancel', lang)}</Button>
      </Box>
    );
  }

  function warningLines() {
    if (!warnings.length) return null;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 2 }}>
        {warnings.map((line) => (
          <Box key={line} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderRadius: 2, bgcolor: kioskColors.amber, color: kioskColors.amberInk, fontWeight: 700, fontSize: 17 }}>
            <WarningAmber fontSize="small" />
            {line}
          </Box>
        ))}
      </Box>
    );
  }

  function errorLine() {
    if (!error) return null;
    return (
      <Typography role="alert" sx={{ color: '#FFB3A8', fontWeight: 700, fontSize: 17, mb: 1.5 }}>{error}</Typography>
    );
  }

  let body: React.ReactNode = null;

  if (screen === 'stale' && preview.stale) {
    body = (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography sx={{ fontSize: 30, fontWeight: 900, color: kioskColors.ink }}>{tk('staleTitle', lang)}</Typography>
        <Typography sx={{ fontSize: 20, color: kioskColors.ink60 }}>
          {tk('staleBody', lang)} <b style={{ color: kioskColors.ink }}>{dayClockLabel(preview.stale.since, lang)}</b>
          {shiftLabel ? ` · ${shiftLabel}` : ''}
        </Typography>
        <Typography sx={{ fontSize: 20, color: kioskColors.ink60 }}>
          {tk('staleSuggest', lang)} <b style={{ color: kioskColors.ink }}>{dayClockLabel(preview.stale.suggested_clock_out, lang)}</b>. {tk('staleNote', lang)}
        </Typography>
        <Button
          variant="contained"
          disabled={pending}
          onClick={() => void run(() => kioskFixStale(route, token), (next) => setScreen(firstScreen(next)))}
          sx={{ ...bigButtonSx, alignSelf: 'flex-start', mt: 1, bgcolor: kioskColors.brand }}
        >
          {pending ? <CircularProgress size={26} sx={{ color: '#fff' }} /> : tk('fixIt', lang)}
        </Button>
      </Box>
    );
  } else if (screen === 'gate') {
    body = (
      <GateSteps
        items={preview.gate}
        lang={lang}
        onComplete={(payload) => {
          setGate(payload);
          setScreen('out');
        }}
      />
    );
  } else if (screen === 'out') {
    const suggested = preview.suggested_shift;
    const showPicker = picking || !suggested || preview.suggested_shift_unmatched;
    body = (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {!showPicker && suggested ? (
          <>
            <Typography sx={{ color: kioskColors.ink40, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 13 }}>
              {tk('suggestedShift', lang)}
            </Typography>
            <Box sx={{ p: 2.5, borderRadius: 3, bgcolor: 'rgba(76,175,80,0.14)', border: `1px solid ${kioskColors.brand}` }}>
              <Typography sx={{ fontSize: 34, fontWeight: 900, color: kioskColors.ink, lineHeight: 1.1 }}>{suggested.name}</Typography>
              <Typography sx={{ fontSize: 19, color: kioskColors.ink60, fontWeight: 600 }}>
                {suggested.department} · {hhmmLabel(suggested.time_in, lang)} - {hhmmLabel(suggested.time_out, lang)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                disabled={pending}
                data-testid="clock-in"
                onClick={() => void run(() => kioskClockIn(route, token, suggested.punch_code, gate))}
                sx={{ ...bigButtonSx, flex: 1, minWidth: 200, bgcolor: kioskColors.brand }}
              >
                {pending ? <CircularProgress size={26} sx={{ color: '#fff' }} /> : tk('clockIn', lang)}
              </Button>
              <Button variant="outlined" onClick={() => setPicking(true)} sx={{ ...bigButtonSx, color: kioskColors.ink, borderColor: kioskColors.panelEdge }}>
                {tk('differentShift', lang)}
              </Button>
            </Box>
          </>
        ) : (
          <>
            <Typography sx={{ fontSize: 26, fontWeight: 900, color: kioskColors.ink }}>{tk('pickShift', lang)}</Typography>
            {!suggested ? <Typography sx={{ color: kioskColors.ink60 }}>{tk('noShiftToday', lang)}</Typography> : null}
            {suggested && preview.suggested_shift_unmatched ? <Typography sx={{ color: kioskColors.ink60 }}>{tk('shiftUnmatched', lang)}</Typography> : null}
            <Box sx={{ bgcolor: '#fff', borderRadius: 2.5, p: 2 }}>
              <ShiftPicker
                pending={pending}
                onPick={(code) => void run(() => kioskClockIn(route, token, code, gate))}
                lang={lang}
                tiles={preview.tiles}
              />
            </Box>
            {suggested && !preview.suggested_shift_unmatched ? (
              <Button onClick={() => setPicking(false)} sx={{ ...mediumButtonSx, alignSelf: 'flex-start', color: kioskColors.ink60 }}>{tk('back', lang)}</Button>
            ) : null}
          </>
        )}
      </Box>
    );
  } else if (screen === 'in' && preview.punch) {
    const onBreak = preview.punch.on_break;
    body = (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 30, fontWeight: 900, color: kioskColors.ink }}>{tk('youAreIn', lang)}</Typography>
          <Typography sx={{ fontSize: 20, color: kioskColors.ink60, fontWeight: 600 }}>
            {shiftLabel ? `${shiftLabel} · ` : ''}
            {tk('since', lang)} {clockLabel(preview.punch.clock_in, lang)}
            {onBreak && preview.punch.break_started_at ? ` · ${tk('onBreakSince', lang)} ${clockLabel(preview.punch.break_started_at, lang)}` : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            disabled={pending}
            data-testid="clock-out"
            onClick={() => void run(() => kioskClockOut(route, token))}
            sx={{ ...bigButtonSx, flex: 1, minWidth: 200, bgcolor: kioskColors.red, '&:hover': { bgcolor: '#c2412e' } }}
          >
            {tk('clockOut', lang)}
          </Button>
          <Button
            variant="contained"
            disabled={pending}
            onClick={() => void run(() => kioskBreak(route, token, onBreak ? 'end' : 'start'))}
            sx={{ ...bigButtonSx, flex: 1, minWidth: 200, bgcolor: '#2F5FA8', '&:hover': { bgcolor: '#274f8c' } }}
          >
            {onBreak ? tk('endBreak', lang) : tk('takeBreak', lang)}
          </Button>
        </Box>
        {route === 'kiosk' ? (
          <Button variant="outlined" onClick={() => setScreen('wrong')} sx={{ ...mediumButtonSx, alignSelf: 'flex-start', color: kioskColors.ink, borderColor: kioskColors.panelEdge }}>
            {tk('somethingWrong', lang)}
          </Button>
        ) : null}
      </Box>
    );
  } else if (screen === 'wrong') {
    body = (
      <SomethingWrongSheet
        preview={preview}
        lang={lang}
        pending={pending}
        onChoice={setWrongChoice}
        onSetShift={(shift) => void run(() => kioskSetShift(token, shift))}
        onRequest={(kind, value) => void run(() => kioskRequestEdit(token, kind, value))}
        onBack={() => {
          setWrongChoice(null);
          setScreen('in');
        }}
      />
    );
  } else if (screen === 'success' && success) {
    body = (
      <Box data-testid="overlay-success" sx={{ display: 'flex', alignItems: 'center', gap: 2.5, py: 2 }}>
        <CheckCircle sx={{ fontSize: 72, color: kioskColors.brand }} />
        <Box>
          <Typography sx={{ fontSize: 40, fontWeight: 900, color: kioskColors.ink, lineHeight: 1 }}>{tk(success.key, lang)}</Typography>
          <Typography sx={{ fontSize: 22, color: kioskColors.ink60, fontWeight: 600 }}>
            {success.at ? `${tk('at', lang)} ${clockLabel(success.at, lang)}` : ''}
            {success.shift && success.key !== 'successRequest' ? ` · ${preview.tiles.find((t) => t.punch_code === success.shift)?.name || preview.punch?.shift_name || success.shift}` : ''}
          </Typography>
        </Box>
      </Box>
    );
  }

  void wrongChoice;

  return (
    <Box
      role="dialog"
      aria-modal="true"
      data-testid="punch-overlay"
      onPointerDown={(event) => {
        event.stopPropagation();
        if (screen !== 'success') bump();
      }}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        p: { xs: 2, md: 5 },
        pt: { xs: 3, md: 7 },
        bgcolor: kioskColors.overlayScrim,
        backdropFilter: 'blur(4px)',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 920,
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
          bgcolor: kioskColors.panel,
          border: `1px solid ${kioskColors.panelEdge}`,
          borderRadius: 4,
          p: { xs: 2.5, md: 4 },
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}
      >
        {screen !== 'success' ? header() : null}
        {screen !== 'success' ? warningLines() : null}
        {errorLine()}
        {body}
      </Box>
    </Box>
  );
}
