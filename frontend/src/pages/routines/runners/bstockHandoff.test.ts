import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BSTOCK_HANDOFF_PATH,
  announceBstockLogin,
  bstockBookmarklet,
  bstockReturnPath,
  captureBstockTokenFromHash,
  clearPendingBstockToken,
  onBstockLogin,
  peekPendingBstockToken,
  rememberBstockReturn,
} from './bstockHandoff';

describe('bstockHandoff', () => {
  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('moves the token out of the address bar and keeps it until cleared', () => {
    window.history.replaceState(null, '', `${BSTOCK_HANDOFF_PATH}#t=eyJ.a%2Bb.c`);
    captureBstockTokenFromHash();
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe(BSTOCK_HANDOFF_PATH);
    expect(peekPendingBstockToken()).toBe('eyJ.a+b.c');
    expect(peekPendingBstockToken()).toBe('eyJ.a+b.c');
    clearPendingBstockToken();
    expect(peekPendingBstockToken()).toBeNull();
  });

  it('ignores a hash on any other page, and a stale token', () => {
    window.history.replaceState(null, '', '/today#t=eyJ.x.y');
    captureBstockTokenFromHash();
    expect(peekPendingBstockToken()).toBeNull();

    vi.useFakeTimers({ now: new Date('2026-09-22T12:00:00Z') });
    window.history.replaceState(null, '', `${BSTOCK_HANDOFF_PATH}#t=eyJ.x.y`);
    captureBstockTokenFromHash();
    vi.setSystemTime(new Date('2026-09-22T12:30:00Z'));
    expect(peekPendingBstockToken()).toBeNull();
  });

  it('returns only to a fresh in-app path', () => {
    expect(bstockReturnPath()).toBe('/today');
    rememberBstockReturn('/routines/run/9');
    expect(bstockReturnPath()).toBe('/routines/run/9');
    rememberBstockReturn('//evil.example/x');
    expect(bstockReturnPath()).toBe('/today');
  });

  it('tells other tabs a login arrived', () => {
    const seen = vi.fn();
    const stop = onBstockLogin(seen);
    window.dispatchEvent(new StorageEvent('storage', { key: 'bstock.loginAt', newValue: '1' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: '1' }));
    stop();
    window.dispatchEvent(new StorageEvent('storage', { key: 'bstock.loginAt', newValue: '2' }));
    expect(seen).toHaveBeenCalledTimes(1);
    announceBstockLogin();
    expect(window.localStorage.getItem('bstock.loginAt')).toBeTruthy();
  });

  it('builds a bookmarklet that sends the login to this app from bstock.com', () => {
    const code = bstockBookmarklet('https://dash.example');
    expect(code.startsWith('javascript:')).toBe(true);
    // No literal # in the bookmark address: some browsers treat it as a fragment.
    expect(code).not.toContain('#');
    const body = code.replace(/^javascript:/, '');
    const opened: string[] = [];
    const openSpy = vi.spyOn(window, 'open').mockImplementation((u) => { opened.push(String(u)); return {} as Window; });
    (window as unknown as { __NEXT_DATA__: unknown }).__NEXT_DATA__ = { props: { pageProps: { accessToken: 'eyJ.a+b.c' } } };
    // Run it as if on www.bstock.com: `location` is shadowed by a parameter.
    new Function('location', body)({ hostname: 'www.bstock.com', href: 'https://www.bstock.com/buy' });
    delete (window as unknown as { __NEXT_DATA__?: unknown }).__NEXT_DATA__;
    openSpy.mockRestore();
    expect(opened).toEqual(['https://dash.example/routines/bstock-login#t=eyJ.a%2Bb.c']);
  });

  it('refuses to run anywhere but bstock.com', () => {
    const code = bstockBookmarklet('https://dash.example');

    const alerts: string[] = [];
    const opened: string[] = [];
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation((m) => { alerts.push(String(m)); });
    const openSpy = vi.spyOn(window, 'open').mockImplementation((u) => { opened.push(String(u)); return null; });
    // jsdom runs on localhost: the hostname guard must stop it before any token is read.
    (window as unknown as { __NEXT_DATA__: unknown }).__NEXT_DATA__ = { props: { pageProps: { accessToken: 'eyJ.a.b' } } };
    new Function(code.replace(/^javascript:/, ''))();
    delete (window as unknown as { __NEXT_DATA__?: unknown }).__NEXT_DATA__;
    alertSpy.mockRestore();
    openSpy.mockRestore();
    expect(alerts).toEqual(['Open B-Stock first, then tap this.']);
    expect(opened).toEqual([]);
  });
});
