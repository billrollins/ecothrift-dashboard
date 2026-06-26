import { useCallback, useEffect, useRef, useState } from 'react';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { restorationJobToTarsItem } from './tarsJobAdapter';
import { createEmptyWorkSession } from './tarsWorkRollup';
import type { TarsWorkSession } from './tarsWorkTypes';

const SAVE_DELAY_MS = 600;

type PersistFn = (jobId: number, session: TarsWorkSession) => Promise<void>;

/** Local work-session edits with debounced API persist — avoids refetch/re-render storms while typing. */
export function useWorkSessionDraft(
  job: RestorationJobDTO | null | undefined,
  persist: PersistFn,
) {
  const [session, setSession] = useState<TarsWorkSession | null>(null);
  const jobIdRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const sessionRef = useRef<TarsWorkSession | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersionRef = useRef(0);
  const persistRef = useRef(persist);
  persistRef.current = persist;

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const flushSave = useCallback(async () => {
    clearSaveTimer();
    if (!dirtyRef.current || jobIdRef.current == null || !sessionRef.current) return;
    const jobId = jobIdRef.current;
    const payload = sessionRef.current;
    const version = ++saveVersionRef.current;
    dirtyRef.current = false;
    await persistRef.current(jobId, payload);
    if (saveVersionRef.current !== version) {
      dirtyRef.current = true;
    }
  }, [clearSaveTimer]);

  const scheduleSave = useCallback(
    (jobId: number) => {
      clearSaveTimer();
      const version = ++saveVersionRef.current;
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        if (jobIdRef.current !== jobId || !sessionRef.current) return;
        if (saveVersionRef.current !== version) return;
        dirtyRef.current = false;
        void persistRef.current(jobId, sessionRef.current);
      }, SAVE_DELAY_MS);
    },
    [clearSaveTimer],
  );

  useEffect(() => {
    if (!job) {
      void flushSave();
      jobIdRef.current = null;
      sessionRef.current = null;
      setSession(null);
      return;
    }

    if (jobIdRef.current !== job.id) {
      void flushSave();
      jobIdRef.current = job.id;
      const next = restorationJobToTarsItem(job).workSession ?? createEmptyWorkSession('bench');
      sessionRef.current = next;
      setSession(next);
      dirtyRef.current = false;
      return;
    }

    if (!dirtyRef.current) {
      const next = restorationJobToTarsItem(job).workSession ?? createEmptyWorkSession('bench');
      sessionRef.current = next;
      setSession(next);
    }
  }, [job, flushSave]);

  const replaceSession = useCallback(
    (next: TarsWorkSession) => {
      if (jobIdRef.current == null) return;
      sessionRef.current = next;
      setSession(next);
      dirtyRef.current = true;
      scheduleSave(jobIdRef.current);
    },
    [scheduleSave],
  );

  const replaceSessionImmediate = useCallback(
    async (next: TarsWorkSession) => {
      if (jobIdRef.current == null) return;
      clearSaveTimer();
      saveVersionRef.current += 1;
      sessionRef.current = next;
      setSession(next);
      dirtyRef.current = false;
      await persistRef.current(jobIdRef.current, next);
    },
    [clearSaveTimer],
  );

  useEffect(
    () => () => {
      clearSaveTimer();
      if (dirtyRef.current && jobIdRef.current != null && sessionRef.current) {
        void persistRef.current(jobIdRef.current, sessionRef.current);
      }
    },
    [clearSaveTimer],
  );

  return { session, replaceSession, replaceSessionImmediate, flushSave };
}
