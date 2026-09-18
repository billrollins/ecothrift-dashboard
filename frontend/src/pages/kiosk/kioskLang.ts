import { useCallback, useState } from 'react';
import { readKioskLang, writeKioskLang, type AppLanguage } from '../../i18n/kiosk';

export const KIOSK_FULLSCREEN_KEY = 'kiosk.fullscreen';

/** Per-device language for both kiosk routes. Persists in localStorage. */
export function useKioskLang(): [AppLanguage, (next: AppLanguage) => void] {
  const [lang, setLang] = useState<AppLanguage>(() => readKioskLang());
  const set = useCallback((next: AppLanguage) => {
    writeKioskLang(next);
    setLang(next);
  }, []);
  return [lang, set];
}

export function readFullscreenDone(): boolean {
  try {
    return window.localStorage.getItem(KIOSK_FULLSCREEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeFullscreenDone(): void {
  try {
    window.localStorage.setItem(KIOSK_FULLSCREEN_KEY, '1');
  } catch {
    // ignore
  }
}

export async function requestFullscreen(): Promise<void> {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch {
    // Denied or unsupported: the page still works at window size.
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
  } catch {
    // ignore
  }
}

/** "08:20" from an ISO timestamp, in the store's zone. */
export function clockLabel(iso: string | null | undefined, lang: AppLanguage = 'en'): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-MX' : 'en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/** "Tue 08:20" for a punch from another day. */
export function dayClockLabel(iso: string | null | undefined, lang: AppLanguage = 'en'): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-MX' : 'en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/** "8:30 AM" from "08:30". */
export function hhmmLabel(hhmm: string, lang: AppLanguage = 'en'): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map((part) => Number(part));
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const date = new Date(Date.UTC(2000, 0, 1, h, m));
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-MX' : 'en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
