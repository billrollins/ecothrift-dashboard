import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DASH_FIXES_PATH, OLD_DASH_FIXES_PATH } from './dashFixesModel';

const KEY = 'ecothrift.dashFixes.lastPage.v1';
let last = '';

function isDashFixes(path: string): boolean {
  return [DASH_FIXES_PATH, OLD_DASH_FIXES_PATH].some((base) => path === base || path.startsWith(`${base}/`));
}

/** Keeps the last Dash page that is not Dash Updates itself, so "Ask for an update" knows where you were. */
export function rememberPage(path: string): void {
  if (!path || isDashFixes(path)) return;
  last = path;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* private window: the module copy is enough */
  }
}

export function lastPage(): string {
  if (last) return last;
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** The page a report is about: the current page, or the remembered one when on Dash Updates. */
export function sourcePage(currentPath: string): string {
  return isDashFixes(currentPath) ? lastPage() : currentPath;
}

export function useRememberPage(): void {
  const { pathname } = useLocation();
  useEffect(() => rememberPage(pathname), [pathname]);
}
