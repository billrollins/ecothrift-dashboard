import { useEffect, useState } from 'react';
import { Box, Button, GlobalStyles, Typography } from '@mui/material';
import type { AppLanguage } from '../../i18n/kiosk';
import { tk } from '../../i18n/kiosk';
import { kioskColors } from './kioskTheme';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function LangToggle({ lang, onChange }: { lang: AppLanguage; onChange: (next: AppLanguage) => void }) {
  return (
    <Box sx={{ display: 'inline-flex', borderRadius: 999, border: `1px solid ${kioskColors.panelEdge}`, overflow: 'hidden' }}>
      {(['en', 'es'] as AppLanguage[]).map((code) => (
        <Button
          key={code}
          onClick={() => onChange(code)}
          data-testid={`lang-${code}`}
          sx={{
            minWidth: 56,
            minHeight: 40,
            borderRadius: 0,
            fontWeight: 800,
            color: lang === code ? '#fff' : kioskColors.ink60,
            bgcolor: lang === code ? kioskColors.brand : 'transparent',
            '&:hover': { bgcolor: lang === code ? kioskColors.brand : 'rgba(255,255,255,0.06)' },
          }}
        >
          {code.toUpperCase()}
        </Button>
      ))}
    </Box>
  );
}

/** Full-bleed dark frame shared by /kiosk and /clock. */
export function KioskShell({
  lang,
  onLang,
  title,
  right,
  children,
  footer,
}: {
  lang: AppLanguage;
  onLang: (next: AppLanguage) => void;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const now = useClock();
  const clock = new Intl.DateTimeFormat(lang === 'es' ? 'es-MX' : 'en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
  }).format(now);
  const day = new Intl.DateTimeFormat(lang === 'es' ? 'es-MX' : 'en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(now);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: kioskColors.bg, color: kioskColors.ink, display: 'flex', flexDirection: 'column', userSelect: 'none' }}>
      <GlobalStyles styles={{ body: { backgroundColor: kioskColors.bg, overscrollBehavior: 'none' } }} />
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 2, px: { xs: 2, md: 4 }, py: 2, borderBottom: `1px solid ${kioskColors.panelEdge}` }}>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.01em' }}>{title}</Typography>
          <Typography sx={{ fontSize: 15, color: kioskColors.ink60, fontWeight: 600, textTransform: 'capitalize' }}>{day}</Typography>
        </Box>
        <Typography data-testid="kiosk-clock" sx={{ ml: 'auto', fontSize: 40, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{clock}</Typography>
        <LangToggle lang={lang} onChange={onLang} />
        {right}
      </Box>
      <Box component="main" sx={{ flex: 1, px: { xs: 2, md: 4 }, py: 3 }}>{children}</Box>
      <Box component="footer" sx={{ display: 'flex', alignItems: 'center', gap: 2, px: { xs: 2, md: 4 }, py: 2, borderTop: `1px solid ${kioskColors.panelEdge}` }}>
        <Typography sx={{ fontSize: 26, fontWeight: 900 }}>{tk('scanYourCard', lang)}</Typography>
        <Typography sx={{ fontSize: 16, color: kioskColors.ink60, fontWeight: 600 }}>{tk('noCard', lang)}</Typography>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1.5, alignItems: 'center' }}>{footer}</Box>
      </Box>
    </Box>
  );
}
