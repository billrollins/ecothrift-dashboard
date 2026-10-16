/**
 * Thrift+ Staff, the Scan tab (owner 2026-10-16: "a test scanner page: scans and shows the item card like the normal
 * scanner"). The member scanner's camera card (with its "Type tag #" box) and its item card: the price, the ThriftBucks
 * the item would collect, and 3-day returns or AS IS. Looked up through the staff login (`staff-tag/`), so it is never
 * counted as a scan, keeps no trip and works while Thrift+ is still off for customers. "Show as" flips the card between
 * what a member and a non-member sees.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, ButtonBase } from '@mui/material';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import { staffTagLookup } from '../../../api/thriftplusStaffApp.api';
import { CameraCard } from '../scanner/CameraCard';
import { InfoPopup } from '../scanner/Explainers';
import { ScanCard, answerFor, type Top } from '../scanner/TripScanner';
import { ScanGate, classifyCode } from '../scanner/scannerLogic';
import { UNIT_CSS, sc, u, useScannerFonts } from '../scanner/scannerTheme';
import { InfoSheet, RETAIL_INFO, RETURNS_INFO, type Info } from '../scanner/tripSheets';
import { BigButton } from '../scanner/tripUi';
import { loadDetector, useQrCamera } from '../scanner/useQrCamera';

/** [Scan again] ignores that same code this long (as the member scanner, APP D14). */
const SCAN_AGAIN_IGNORE_MS = 3000;

export default function StaffScanPage() {
  useScannerFonts();
  const [top, setTop] = useState<Top | null>(null);
  const [asMember, setAsMember] = useState(true);
  const [info, setInfo] = useState<Info | null>(null);
  const [help, setHelp] = useState(false);
  const [flash, setFlash] = useState(false);
  const gate = useRef(new ScanGate(2000));
  const topRef = useRef<Top | null>(null);
  topRef.current = top;

  useEffect(() => {
    loadDetector().catch(() => undefined);
  }, []);

  const handleRef = useRef<(raw: string, from: 'camera' | 'typed', format?: string) => void>(() => undefined);
  const camera = useQrCamera({
    enabled: true,
    paused: !!top || !!info || help,
    onDecode: (raw, format) => handleRef.current(raw, 'camera', format),
  });

  // As the member scanner: every code gets an answer; only our tag codes are looked up.
  handleRef.current = (raw, from, format) => {
    camera.poke();
    if (topRef.current) return;
    const code = classifyCode(raw, format);
    const text = raw.trim();
    const gateKey = code.kind === 'tag' ? code.sku : `raw:${text}`;
    if (from === 'camera' && !gate.current.accept(gateKey)) return;
    navigator.vibrate?.(15);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 260);
    const key = Date.now();
    setTop({ key, sku: code.kind === 'tag' ? code.sku : text, lookup: null, code, gateKey });
    if (code.kind !== 'tag') return;
    void staffTagLookup(code.sku).then((lookup) => {
      setTop((t) => (t && t.key === key ? { ...t, lookup } : t));
    });
  };

  const scanAgain = () => {
    const t = topRef.current;
    if (t) gate.current.ignore(t.gateKey ?? t.sku, SCAN_AGAIN_IGNORE_MS);
    setTop(null);
    camera.poke();
  };

  const pill = (on: boolean) => ({
    px: u(26), py: u(10), borderRadius: 99, fontSize: u(26), fontWeight: 700, fontFamily: sc.font,
    bgcolor: on ? sc.green : 'transparent', color: on ? '#fff' : sc.ink2,
  });

  return (
    <Box data-testid="staff-scan" sx={{ height: '100%', display: 'flex', justifyContent: 'center', bgcolor: '#e6e7e1', overflow: 'hidden', '--u': UNIT_CSS }}>
      <Box
        sx={{
          position: 'relative', width: '100%', maxWidth: 480, height: '100%', display: 'flex', flexDirection: 'column',
          color: sc.ink, fontFamily: sc.font, background: `radial-gradient(ellipse at 50% 45%, ${sc.pageLight} 0%, ${sc.page} 75%)`,
          '& button, & input': { fontFamily: 'inherit' },
          px: u(20), pt: `calc(env(safe-area-inset-top, 0px) + ${u(18)})`, pb: u(18), gap: u(16),
        }}
      >
        <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: u(16) }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box component="h1" sx={{ m: 0, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(48), lineHeight: 1.1, color: sc.titleGreen }}>
              Test scanner
            </Box>
            <Box sx={{ fontSize: u(24), color: sc.ink2 }}>What a customer sees. Never counted as a scan.</Box>
          </Box>
          <Box role="group" aria-label="Show as" sx={{ display: 'flex', flexShrink: 0, borderRadius: 99, border: `${u(3)} solid ${sc.line}`, bgcolor: '#fff' }}>
            <ButtonBase aria-pressed={asMember} onClick={() => setAsMember(true)} sx={pill(asMember)} data-testid="staff-scan-as-member">Member</ButtonBase>
            <ButtonBase aria-pressed={!asMember} onClick={() => setAsMember(false)} sx={pill(!asMember)} data-testid="staff-scan-as-guest">Non-member</ButtonBase>
          </Box>
        </Box>

        <Box data-testid="stage" sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <CameraCard
            videoRef={camera.videoRef}
            status={camera.status}
            error={camera.error}
            zoom={camera.zoom}
            switching={camera.switching}
            underneath={false}
            flash={flash}
            onWake={camera.wake}
            onRestart={camera.restart}
            onCode={(code) => handleRef.current(code, 'typed')}
            onHelp={() => setHelp(true)}
          />
          {top && (
            <ScanCard
              key={top.key}
              top={top}
              answer={answerFor(top)}
              isGuest={!asMember}
              verified18={false}
              qty={0}
              onAdd={null}
              onPass={scanAgain}
              onRetail={() => setInfo(RETAIL_INFO)}
              onReturns={(ok) => setInfo(RETURNS_INFO[ok ? 'yes' : 'no'])}
            />
          )}
        </Box>

        {top && (
          <Box data-testid="actions" sx={{ flexShrink: 0, display: 'flex' }}>
            <BigButton primary onClick={scanAgain} testId="scan-again">
              <QrCodeScannerRounded sx={{ fontSize: u(46) }} />
              Scan again
            </BigButton>
          </Box>
        )}

        {info && <InfoSheet info={info} onClose={() => setInfo(null)} />}
        {help && <InfoPopup topic="camera" origin={null} onClose={() => setHelp(false)} onRetryCamera={camera.wake} />}
      </Box>
    </Box>
  );
}
