import { useCallback, useEffect, useRef, useState } from 'react';
import { localPrintService, type HealthResponse } from '../services/localPrintService';

export interface PrintStatus {
  online: boolean;
  version: string;
  printersAvailable: number;
  lastChecked: number;
}

const POLL_INTERVAL = 30_000;

export function useLocalPrintStatus() {
  const [status, setStatus] = useState<PrintStatus>({
    online: false,
    version: '',
    printersAvailable: 0,
    lastChecked: 0,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(async () => {
    try {
      const health: HealthResponse = await localPrintService.getHealth();
      setStatus({
        online: health.status === 'ok',
        version: health.version,
        printersAvailable: health.printers_available,
        lastChecked: Date.now(),
      });
    } catch {
      setStatus((prev) => ({ ...prev, online: false, lastChecked: Date.now() }));
    }
  }, []);

  useEffect(() => {
    check();
    intervalRef.current = setInterval(check, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [check]);

  return status;
}
