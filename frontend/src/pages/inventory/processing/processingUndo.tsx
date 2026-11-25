/**
 * Undo and redo on the Processing page (Dash Update #230, Bill 2026-11-25: "a ctrl z (undo last action) would be
 * nice on this page (and also a redo if accidental); can have a hot key hint so processors know they can undo").
 *
 * Each action that can be put back cleanly records how: a row's field changes, attaching or removing a product,
 * "not this product", the set / part ratio, and a check-in's price, condition and where it goes. A check-in itself
 * opens the Undo check-in window (its tags were printed) and has no redo. Not recorded: making a product, pack
 * sizes, disputes, Restoration, the queue's bulk tools.
 *
 * - Ctrl+Z undoes the last action; Ctrl+Y (or Ctrl+Shift+Z) does it again.
 * - While the cursor is in a box that holds typed text (a row field being typed in), Ctrl+Z is the browser's own (it
 *   undoes the typing), and inside a window (a dialog) the page's undo stays out of the way. The page's scan box is
 *   the exception: the cursor rests there, so Ctrl+Z in it is always the page's.
 * - The list belongs to this order on this screen; it is not kept when the page is closed.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSnackbar } from 'notistack';

export interface UndoEntry {
  /** What it was, in a few words: "Title and Brand on row 12". */
  label: string;
  /** Put it back. Answering `false` means it could not be put back (the entry is dropped, nothing to redo). */
  undo: () => unknown | Promise<unknown>;
  /** Do it again. Left out for actions that cannot be redone (a check-in). */
  redo?: () => unknown | Promise<unknown>;
  /** Set when undoing only opens a window where the person finishes (Undo check-in): no "Undone" message. */
  quiet?: boolean;
}

export interface UndoStacks {
  undo: UndoEntry[];
  redo: UndoEntry[];
}

export const UNDO_LIMIT = 50;
export const NO_UNDO: UndoStacks = { undo: [], redo: [] };

/** A new action: on top of the undo list; what could be redone is gone (it would redo over the new action). */
export function recorded(stacks: UndoStacks, entry: UndoEntry): UndoStacks {
  return { undo: [...stacks.undo, entry].slice(-UNDO_LIMIT), redo: [] };
}

/** The entry Ctrl+Z takes, and the lists without it. */
export function takeUndo(stacks: UndoStacks): { entry: UndoEntry | null; rest: UndoStacks } {
  const entry = stacks.undo[stacks.undo.length - 1] ?? null;
  return { entry, rest: entry ? { undo: stacks.undo.slice(0, -1), redo: stacks.redo } : stacks };
}

export function takeRedo(stacks: UndoStacks): { entry: UndoEntry | null; rest: UndoStacks } {
  const entry = stacks.redo[stacks.redo.length - 1] ?? null;
  return { entry, rest: entry ? { undo: stacks.undo, redo: stacks.redo.slice(0, -1) } : stacks };
}

/** After an undo that worked: the entry can be redone, when it knows how. */
export function afterUndo(stacks: UndoStacks, entry: UndoEntry): UndoStacks {
  return entry.redo ? { undo: stacks.undo, redo: [...stacks.redo, entry] } : stacks;
}

/** After a redo that worked: the entry can be undone again. */
export function afterRedo(stacks: UndoStacks, entry: UndoEntry): UndoStacks {
  return { undo: [...stacks.undo, entry].slice(-UNDO_LIMIT), redo: stacks.redo };
}

/**
 * Is this key press the page's undo or redo, or the browser's own? In a box that holds typed text the browser undoes
 * the typing; in a window the page stays out of it. An empty box (the scan box at rest) is the page's.
 */
export function pageUndoKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = e.key.toLowerCase();
  const kind = key === 'z' ? (e.shiftKey ? 'redo' : 'undo') : key === 'y' && !e.shiftKey ? 'redo' : null;
  if (!kind) return null;
  const el = e.target as HTMLElement | null;
  if (el && typeof el.closest === 'function') {
    if (el.closest('[role="dialog"], .MuiDialog-root, .MuiPopover-root, .MuiMenu-root')) return null;
    // The page's scan box is where the cursor rests, often with the last search still in it: there, Ctrl+Z is the
    // page's, so "undo" works without clicking somewhere else first.
    if (el.closest('[data-scan-search]')) return kind;
    const tag = el.tagName;
    if (el.isContentEditable) return null;
    if ((tag === 'INPUT' || tag === 'TEXTAREA') && String((el as HTMLInputElement).value ?? '') !== '') return null;
    if (tag === 'SELECT') return null;
  }
  return kind;
}

export interface ProcessingUndoApi {
  record: (entry: UndoEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  /** What Ctrl+Z would undo, or null when there is nothing. */
  undoLabel: string | null;
  redoLabel: string | null;
  busy: boolean;
}

const ProcessingUndoContext = createContext<ProcessingUndoApi | null>(null);

/** The page's undo list, or null where there is none (a screen outside Processing, a test). */
export function useProcessingUndo(): ProcessingUndoApi | null {
  return useContext(ProcessingUndoContext);
}

export function ProcessingUndoProvider({ scopeKey, children }: {
  /** The order: another order starts an empty list. */
  scopeKey: number | string | null;
  children: ReactNode;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [stacks, setStacks] = useState<UndoStacks>(NO_UNDO);
  const stacksRef = useRef(stacks);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const put = useCallback((next: UndoStacks) => {
    stacksRef.current = next;
    setStacks(next);
  }, []);

  useEffect(() => {
    put(NO_UNDO);
  }, [scopeKey, put]);

  const record = useCallback((entry: UndoEntry) => put(recorded(stacksRef.current, entry)), [put]);

  const run = useCallback(
    async (kind: 'undo' | 'redo') => {
      if (busyRef.current) return;
      const { entry, rest } = kind === 'undo' ? takeUndo(stacksRef.current) : takeRedo(stacksRef.current);
      if (!entry) {
        enqueueSnackbar(kind === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.', { variant: 'info' });
        return;
      }
      busyRef.current = true;
      setBusy(true);
      put(rest);
      try {
        const result = await (kind === 'undo' ? entry.undo() : entry.redo?.());
        if (result === false) {
          enqueueSnackbar(`Could not ${kind}: ${entry.label}.`, { variant: 'warning' });
          return;
        }
        put(kind === 'undo' ? afterUndo(stacksRef.current, entry) : afterRedo(stacksRef.current, entry));
        if (!entry.quiet) {
          enqueueSnackbar(`${kind === 'undo' ? 'Undone' : 'Done again'}: ${entry.label}.`, { variant: 'success' });
        }
      } catch {
        enqueueSnackbar(`Could not ${kind}: ${entry.label}.`, { variant: 'warning' });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [enqueueSnackbar, put],
  );

  const undo = useCallback(() => run('undo'), [run]);
  const redo = useCallback(() => run('redo'), [run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const kind = pageUndoKey(e);
      if (!kind) return;
      e.preventDefault();
      void run(kind);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run]);

  const api = useMemo<ProcessingUndoApi>(
    () => ({
      record,
      undo,
      redo,
      undoLabel: stacks.undo[stacks.undo.length - 1]?.label ?? null,
      redoLabel: stacks.redo[stacks.redo.length - 1]?.label ?? null,
      busy,
    }),
    [record, undo, redo, stacks, busy],
  );

  return <ProcessingUndoContext.Provider value={api}>{children}</ProcessingUndoContext.Provider>;
}
