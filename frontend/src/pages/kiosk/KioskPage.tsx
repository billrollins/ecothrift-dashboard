import { useCallback, useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { KIOSK_HOST_EXPIRED_EVENT } from '../../api/client';
import { keepHostAlive, kioskExit } from '../../api/kiosk.api';
import { tk } from '../../i18n/kiosk';
import { ExitDialog } from './ExitDialog';
import { HostExpiredOverlay } from './HostExpiredOverlay';
import { KioskBoard } from './KioskBoard';
import { KioskShell } from './KioskShell';
import { ManagerWarningBanner } from './ManagerWarningBanner';
import { PunchOverlay } from './PunchOverlay';
import { ScanInput } from './ScanInput';
import { TapToStart } from './TapToStart';
import { exitFullscreen, readFullscreenDone, requestFullscreen, useKioskLang, writeFullscreenDone } from './kioskLang';
import { kioskColors, mediumButtonSx } from './kioskTheme';
import { useKioskSession } from './useKioskSession';

/** Refresh the host JWT on a fixed cadence so a 10-hour day never needs a gesture. */
const KEEPALIVE_MS = 20 * 60 * 1000;

export default function KioskPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lang, setLang] = useKioskLang();
  const [started, setStarted] = useState(() => readFullscreenDone('kiosk'));
  const [expired, setExpired] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const session = useKioskSession('kiosk', lang, started && !expired);

  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener(KIOSK_HOST_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(KIOSK_HOST_EXPIRED_EVENT, onExpired);
  }, []);

  useEffect(() => {
    if (!started || expired) return;
    const id = setInterval(() => {
      keepHostAlive().catch((err: AxiosError) => {
        const status = err.response?.status;
        if (status === 401 || status === 403) setExpired(true);
      });
    }, KEEPALIVE_MS);
    return () => clearInterval(id);
  }, [started, expired]);

  const start = useCallback(() => {
    void requestFullscreen();
    writeFullscreenDone('kiosk');
    setStarted(true);
  }, []);

  const leave = useCallback(async () => {
    setExitOpen(false);
    kioskExit().catch(() => undefined);
    await exitFullscreen();
    navigate('/dashboard');
  }, [navigate]);

  const isManager = user?.role === 'Manager' || user?.role === 'Admin' || Boolean(user?.is_superuser);

  if (!started) return <TapToStart lang={lang} onTap={start} />;

  return (
    <>
      {isManager ? <ManagerWarningBanner lang={lang} /> : null}
      <KioskShell
        lang={lang}
        onLang={setLang}
        title="Eco-Thrift"
        right={
          <Button onClick={() => setExitOpen(true)} sx={{ ...mediumButtonSx, minHeight: 40, fontSize: 15, color: kioskColors.ink60 }}>
            {tk('exit', lang)}
          </Button>
        }
        footer={
          session.toast ? (
            <Typography role="status" data-testid="kiosk-toast" sx={{ color: '#FFB3A8', fontWeight: 800, fontSize: 18 }}>{session.toast}</Typography>
          ) : session.identifying ? (
            <Typography sx={{ color: kioskColors.ink60, fontWeight: 700 }}>{tk('checkingCard', lang)}</Typography>
          ) : null
        }
      >
        <KioskBoard board={session.board.data} lang={lang} />
        {session.board.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center', color: kioskColors.ink40 }}>{tk('loading', lang)}</Box>
        ) : null}
      </KioskShell>

      <ScanInput enabled={!expired && !session.scan && !exitOpen} onScan={(token) => void session.onScan(token)} />

      {session.scan ? (
        <PunchOverlay
          key={session.scan.token + session.scan.preview.now}
          route="kiosk"
          token={session.scan.token}
          initial={session.scan.preview}
          lang={lang}
          onClose={session.closeOverlay}
          onChanged={session.refreshBoard}
        />
      ) : null}

      <ExitDialog open={exitOpen} lang={lang} onCancel={() => setExitOpen(false)} onConfirmed={() => void leave()} />

      {expired ? (
        <HostExpiredOverlay
          lang={lang}
          onSignIn={() => {
            void exitFullscreen();
            navigate('/login', { replace: true, state: { from: '/kiosk' } });
          }}
        />
      ) : null}
    </>
  );
}
