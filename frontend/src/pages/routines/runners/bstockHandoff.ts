/**
 * Getting the B-Stock login from bstock.com into the app.
 *
 * The bookmarklet runs on a logged-in bstock.com page, reads the token B-Stock's
 * own pages use, and opens `/routines/bstock-login#t=<token>` here in a new tab.
 * The hash is not sent to our server, but the browser keeps the full address in
 * its history (and history sync), so this is a short-lived token by design: it
 * expires in about an hour. `captureBstockTokenFromHash` runs before the app
 * renders, moves the token into sessionStorage, and strips the hash, so a login
 * bounce on the way in does not lose it. Nothing is sent until the owner confirms.
 */

export const BSTOCK_HANDOFF_PATH = '/routines/bstock-login';
// A seller page carries the login in its page data (the marketing home page may not).
export const BSTOCK_LOGIN_URL = 'https://bstock.com/buy/seller/target';

const TOKEN_KEY = 'bstock.pendingToken';
const RETURN_KEY = 'bstock.returnTo';
const LOGIN_EVENT_KEY = 'bstock.loginAt';

// A token captured longer ago than this is stale (the login itself lasts about an hour).
const PENDING_TTL_MS = 15 * 60 * 1000;
// "Come back to this run" is only meaningful for a couple of hours.
const RETURN_TTL_MS = 2 * 60 * 60 * 1000;

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStamped(store: Storage | null, key: string, ttlMs: number): string | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value?: unknown; at?: unknown };
    if (typeof parsed.value !== 'string' || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > ttlMs) {
      store.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

function writeStamped(store: Storage | null, key: string, value: string): void {
  try {
    store?.setItem(key, JSON.stringify({ value, at: Date.now() }));
  } catch {
    // Storage blocked: the page says there is nothing to send, and the owner can tap again.
  }
}

export function captureBstockTokenFromHash(): void {
  if (window.location.pathname !== BSTOCK_HANDOFF_PATH) return;
  const match = /^#t=(.+)$/.exec(window.location.hash);
  if (!match) return;
  let token = '';
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    token = '';
  }
  if (token) writeStamped(session(), TOKEN_KEY, token);
  window.history.replaceState(null, '', BSTOCK_HANDOFF_PATH);
}

/** The token waiting to be sent, if it is fresh. Left in place until the send settles. */
export function peekPendingBstockToken(): string | null {
  return readStamped(session(), TOKEN_KEY, PENDING_TTL_MS);
}

export function clearPendingBstockToken(): void {
  try {
    session()?.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Where the owner came from (the routine run), so the hand-off can point back to it. */
export function rememberBstockReturn(path: string): void {
  writeStamped(local(), RETURN_KEY, path);
}

export function bstockReturnPath(): string {
  const path = readStamped(local(), RETURN_KEY, RETURN_TTL_MS);
  // Only an in-app path: never navigate somewhere a stored value names.
  return path && path.startsWith('/') && !path.startsWith('//') ? path : '/today';
}

const RUNNER_OPEN_KEY = 'bstock.runnerOpenAt';
const RUNNER_OPEN_FRESH_MS = 25 * 1000;

/** The runner says it is open (every few seconds while mounted), so the hand-off tab can close. */
export function markBstockRunnerOpen(): void {
  try {
    local()?.setItem(RUNNER_OPEN_KEY, String(Date.now()));
  } catch {
    // The hand-off falls back to opening the routine in its own tab.
  }
}

/** Is a B-Stock runner open in another tab of this app right now? */
export function bstockRunnerOpenElsewhere(): boolean {
  try {
    const at = Number(local()?.getItem(RUNNER_OPEN_KEY) || 0);
    return at > 0 && Date.now() - at < RUNNER_OPEN_FRESH_MS;
  } catch {
    return false;
  }
}

/** Tell other tabs of this app (the runner the owner started from) that a login arrived. */
export function announceBstockLogin(): void {
  try {
    local()?.setItem(LOGIN_EVENT_KEY, String(Date.now()));
  } catch {
    // Other tabs pick the login up on their next poll instead.
  }
}

/** Run `callback` when another tab announces a login. Returns the unsubscribe. */
export function onBstockLogin(callback: () => void): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key === LOGIN_EVENT_KEY) callback();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/** The bookmark address. `origin` is this app, so it works locally and on prod. */
export function bstockBookmarklet(origin: string): string {
  // `#` is written as an escape: some browsers read a literal one in a javascript: URL as
  // the start of a fragment. The script still builds `…/routines/bstock-login#t=<token>`.
  const target = JSON.stringify(`${origin}${BSTOCK_HANDOFF_PATH}#t=`).replace('#', String.fromCharCode(92) + 'u0023');
  const body = [
    "if(!/(^|\\.)bstock\\.com$/.test(location.hostname)){alert('Open B-Stock first, then tap this.');return;}",
    'var d=window.__NEXT_DATA__,pp=d&&d.props&&d.props.pageProps;',
    'var t=(pp&&pp.accessToken)||(window.p&&window.p.accessToken);',
    "if(!t){alert('Log in to B-Stock, open an auction or seller page, then tap this again.');return;}",
    `var u=${target}+encodeURIComponent(t);`,
    'if(!window.open(u,"_blank"))location.href=u;',
  ].join('');
  return `javascript:(function(){${body}})();`;
}

/** Minutes of usable login left (the server already subtracts its safety margin). */
export function minutesLeft(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 1 ? `${minutes} min left` : 'under a minute left';
}
