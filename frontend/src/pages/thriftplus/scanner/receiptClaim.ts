/**
 * A non-member receipt's QR (owner 2026-11-20, Dash Update #204, rulebook B15): "Claim 12.60 ThriftBucks ... Join free
 * today and they are yours." ECOTHRIFT.US/J/<TOKEN> opens /scan?view=join&claim=<TOKEN>. The phone keeps the token
 * (it must outlive a texted sign-in link or Google), and once the member has finished joining the app sends it
 * (`me/claim-receipt/`): the trip's ThriftBucks are added and the app says so.
 *
 * Shared by the live scanner (ThriftPlusScannerPage.tsx, ReceiptClaimNote.tsx) and the phone site (scan/ScanApp.tsx
 * keeps the token; shell/ReceiptClaim.tsx claims it, because a signed-in member leaves /scan for /thriftplus at once):
 * no React and no API client here, only the keeping and the rules.
 */

export const CLAIM_PARAM = 'claim';
/** Fired on window when a token is kept: the phone site claims from its always-there shell, not from the scanner. */
export const CLAIM_EVENT = 'tp-receipt-claim';
const KEY = 'tp-receipt-claim';
const TOKEN = /^[0-9A-Z]{13,30}$/;

/** The phone's own calendar day ("2026-11-20"): a receipt claims only on the day of the sale (the server checks). */
export function localDay(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Keep the receipt's token from the address (`?claim=`); a malformed one is ignored. */
export function rememberReceiptClaim(token: string | null | undefined, now: Date = new Date()): boolean {
  const t = (token ?? '').trim().toUpperCase();
  if (!TOKEN.test(t)) return false;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ token: t, day: localDay(now) }));
    window.dispatchEvent(new Event(CLAIM_EVENT));
    return true;
  } catch {
    return false; // private mode: nothing kept
  }
}

/** The token waiting to be claimed today, or null (one kept from an earlier day is dropped). */
export function pendingReceiptClaim(now: Date = new Date()): string | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const kept = JSON.parse(raw) as { token?: unknown; day?: unknown };
    if (typeof kept.token === 'string' && TOKEN.test(kept.token) && kept.day === localDay(now)) return kept.token;
    window.localStorage.removeItem(KEY);
  } catch {
    // unreadable: nothing waiting
  }
  return null;
}

export function forgetReceiptClaim(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing kept
  }
}

/** Ready to claim: a member who has finished joining (a pending join collects nothing yet, J2). */
export function canClaimNow(session: { status: string; member?: { ready?: boolean } } | null | undefined): boolean {
  return session?.status === 'member' && session.member?.ready === true;
}

/**
 * After a refused claim: NOT_FINISHED keeps the token (it goes through once they finish); a network error keeps it
 * (tried again on the next load); every other refusal is final, so it is dropped and its words are shown.
 */
export function keepAfterRefusal(code: string | undefined): boolean {
  return code === 'NOT_FINISHED' || code === undefined;
}

export interface ReceiptClaimAnswer {
  added: string;
  message: string;
}
