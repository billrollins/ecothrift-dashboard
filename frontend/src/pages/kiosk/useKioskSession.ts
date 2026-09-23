import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { getKioskBoard, kioskIdentify, type KioskErrorBody, type KioskPreview, type KioskRoute } from '../../api/kiosk.api';
import { tk, type AppLanguage } from '../../i18n/kiosk';
import { errorMessage } from './PunchOverlay';

export const BOARD_REFRESH_MS = 30_000;
const TOAST_MS = 4_000;

export type Scan = { token: string; preview: KioskPreview };

/** A punch that landed reads green; a bad card or a failure reads salmon. */
export type ToastTone = 'ok' | 'error';

/** Board polling, scan → identify → overlay, and the generic-failure toast. Shared by both routes. */
export function useKioskSession(route: KioskRoute, lang: AppLanguage, enabled: boolean) {
  const queryClient = useQueryClient();
  const board = useQuery({
    queryKey: ['kiosk', route, 'board'],
    queryFn: async () => (await getKioskBoard(route)).data,
    enabled,
    refetchInterval: BOARD_REFRESH_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const [scan, setScan] = useState<Scan | null>(null);
  const [toast, setToast] = useState('');
  const [toastTone, setToastTone] = useState<ToastTone>('error');
  const [identifying, setIdentifying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, tone: ToastTone = 'error') => {
    setToast(text);
    setToastTone(tone);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    const status = (board.error as AxiosError<KioskErrorBody> | null)?.response?.status;
    setBlocked(status === 403);
  }, [board.error]);

  const onScan = useCallback(
    async (token: string) => {
      if (identifying) return;
      setIdentifying(true);
      try {
        const { data } = await kioskIdentify(route, token);
        setScan({ token, preview: data });
      } catch (err) {
        const status = (err as AxiosError<KioskErrorBody>)?.response?.status;
        if (status === 403) {
          setBlocked(true);
          showToast(tk('notAvailableHere', lang));
        } else {
          showToast(errorMessage(err, lang));
        }
      } finally {
        setIdentifying(false);
      }
    },
    [route, lang, identifying, showToast],
  );

  const closeOverlay = useCallback(() => setScan(null), []);

  /** A punch landed: clear the overlay and leave a short line in the footer. */
  const finishOverlay = useCallback(
    (successKey: string) => {
      showToast(tk(successKey, lang), 'ok');
      setScan(null);
    },
    [showToast, lang],
  );

  /** Something was typed at the scanner that is too short to be a card. */
  const rejectScan = useCallback(() => showToast(tk('scanAgain', lang)), [showToast, lang]);

  const refreshBoard = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['kiosk', route, 'board'] });
  }, [queryClient, route]);

  return { board, scan, toast, toastTone, identifying, blocked, onScan, closeOverlay, finishOverlay, rejectScan, refreshBoard };
}
