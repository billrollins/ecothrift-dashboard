import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/** Query keys that open a routine inside Today, e.g. `/today?run=212`. */
const RUNNER_KEYS = ['run', 'routine', 'draft', 'mode', 'return'] as const;

export function hasRunner(params: URLSearchParams): boolean {
  return Boolean(params.get('run') || params.get('routine') || params.get('draft'));
}

/**
 * The Today query for a routine link. Routines run beside the list on Today now, so every
 * old link (`/routines/run/12`, `/routines/run/new?routine=3&draft=9`, `/routines?run=12`)
 * maps to `/today?...`. Returns null for anything that is not a routine link.
 */
export function todayRunnerSearch(href: string): URLSearchParams | null {
  let url: URL;
  try {
    url = new URL(href, 'http://local');
  } catch {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, '');
  const next = new URLSearchParams();
  const match = /^\/routines\/run\/(\d+|new)$/.exec(path);
  if (match) {
    if (match[1] !== 'new') next.set('run', match[1]);
  } else if (path !== '/routines' && path !== '/today') {
    return null;
  }
  for (const key of RUNNER_KEYS) {
    const value = url.searchParams.get(key);
    if (value && !next.has(key)) next.set(key, value);
  }
  return hasRunner(next) ? next : null;
}

/** `/today?run=12` for a routine link; any other link unchanged. */
export function todayHref(href: string): string {
  const search = todayRunnerSearch(href);
  return search ? `/today?${search.toString()}` : href;
}

/** Open and close the routine runner on Today through the URL, so Back closes it on a phone. */
export function useTodayRunner() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const open = hasRunner(params);
  const runId = Number(params.get('run') || 0) || null;
  const key = `${runId ?? 'new'}:${params.get('routine') ?? ''}:${params.get('draft') ?? ''}`;

  const openHref = useCallback((href: string) => {
    const search = todayRunnerSearch(href);
    if (!search) {
      navigate(href);
      return;
    }
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      RUNNER_KEYS.forEach((k) => next.delete(k));
      search.forEach((value, k) => next.set(k, value));
      return next;
    });
  }, [navigate, setParams]);

  const close = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      RUNNER_KEYS.forEach((k) => next.delete(k));
      return next;
    }, { replace: true });
  }, [setParams]);

  return { open, runId, key, openHref, close };
}
