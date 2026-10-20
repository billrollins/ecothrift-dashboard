import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemberTabBar, memberBarShown, tabOfView, viewOfTab } from './memberTabs';

describe('member tabs (owner 2026-10-20)', () => {
  it('the address picks the tab: no view is Scan; qr, card and join are My QR; finish is none', () => {
    expect(tabOfView(null)).toBe('scan');
    expect(tabOfView('bucks')).toBe('bucks');
    expect(['qr', 'card', 'join'].map(tabOfView)).toEqual(['qr', 'qr', 'qr']);
    expect(tabOfView('account')).toBe('account');
    expect(tabOfView('finish')).toBe('scan'); // Finish joining is a screen of its own, not a tab
    expect(tabOfView('whatever')).toBe('scan');
    expect([viewOfTab('scan'), viewOfTab('bucks'), viewOfTab('qr'), viewOfTab('account')]).toEqual([null, 'bucks', 'qr', 'account']);
  });

  it('is for signed-in members only, never while Finish joining is open, and not sideways', () => {
    expect(memberBarShown({ isMember: true, view: null, sideways: false })).toBe(true);
    expect(memberBarShown({ isMember: true, view: 'account', sideways: false })).toBe(true);
    expect(memberBarShown({ isMember: true, view: 'finish', sideways: false })).toBe(false);
    expect(memberBarShown({ isMember: false, view: null, sideways: false })).toBe(false);
    expect(memberBarShown({ isMember: true, view: null, sideways: true })).toBe(false);
  });

  it('the bar names the four tabs, marks the open one, and hands a tap to the page (not the open tab again)', async () => {
    const onTab = vi.fn();
    const user = userEvent.setup();
    render(<MemberTabBar tab="bucks" onTab={onTab} />);
    const bar = screen.getByRole('navigation', { name: 'Thrift+' });
    expect(within(bar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Scan', 'Bucks', 'My QR', 'Account']);
    expect(screen.getByTestId('member-tab-bucks')).toHaveClass('Mui-selected');
    await user.click(screen.getByTestId('member-tab-bucks'));
    expect(onTab).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('member-tab-account'));
    expect(onTab).toHaveBeenCalledWith('account');
    await user.click(screen.getByTestId('member-tab-scan'));
    expect(onTab).toHaveBeenLastCalledWith('scan');
  });
});
