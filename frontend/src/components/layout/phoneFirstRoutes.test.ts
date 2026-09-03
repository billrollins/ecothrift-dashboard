import { describe, expect, it } from 'vitest';
import { isPhoneFirstPath, phoneShellTitle, showsPhoneTabBar } from './phoneFirstRoutes';

describe('isPhoneFirstPath', () => {
  it('treats floor surfaces as phone-first', () => {
    expect(isPhoneFirstPath('/dashboard')).toBe(true);
    expect(isPhoneFirstPath('/routines')).toBe(true);
    expect(isPhoneFirstPath('/routines/run/12')).toBe(true);
    expect(isPhoneFirstPath('/documents/4/sign')).toBe(true);
    expect(isPhoneFirstPath('/hr/time-clock')).toBe(true);
    expect(isPhoneFirstPath('/today')).toBe(true);
  });

  it('leaves desk workspaces on the wide layout', () => {
    expect(isPhoneFirstPath('/inventory/workbench')).toBe(false);
    expect(isPhoneFirstPath('/pos/terminal')).toBe(false);
    expect(isPhoneFirstPath('/admin/time-payroll')).toBe(false);
    expect(isPhoneFirstPath('/online-sales/listings/9')).toBe(false);
    expect(isPhoneFirstPath('/restoration/bench')).toBe(false);
  });

  it('keeps the delivery driver screens phone-first inside /pos', () => {
    expect(isPhoneFirstPath('/pos/deliveries/field/schedule')).toBe(true);
    expect(isPhoneFirstPath('/pos/deliveries/desk/schedule')).toBe(false);
  });

  it('does not let a prefix match a longer word', () => {
    expect(isPhoneFirstPath('/inventory-report')).toBe(true);
    expect(isPhoneFirstPath('/posture')).toBe(true);
  });

  it('ignores a trailing slash and case', () => {
    expect(isPhoneFirstPath('/Routines/')).toBe(true);
    expect(isPhoneFirstPath('/Inventory/Orders/')).toBe(false);
  });

  it('defaults a new route to phone-first', () => {
    expect(isPhoneFirstPath('/some-new-floor-page')).toBe(true);
  });
});

describe('showsPhoneTabBar', () => {
  it('shows the floor tab bar on Dashboard, Today, Pay, and Routines list', () => {
    expect(showsPhoneTabBar('/dashboard')).toBe(true);
    expect(showsPhoneTabBar('/today')).toBe(true);
    expect(showsPhoneTabBar('/pay')).toBe(true);
    expect(showsPhoneTabBar('/hr/time-clock')).toBe(false);
    expect(showsPhoneTabBar('/routines')).toBe(true);
    expect(showsPhoneTabBar('/routines/catalog')).toBe(true);
  });

  it('hides the tab bar while filling, demoing, or editing a routine', () => {
    expect(showsPhoneTabBar('/routines/run/12')).toBe(false);
    expect(showsPhoneTabBar('/routines', '?run=12')).toBe(false);
    expect(showsPhoneTabBar('/routines/catalog', '?view=4')).toBe(false);
    expect(showsPhoneTabBar('/routines/4/edit')).toBe(false);
  });

  it('hides the tab bar on desk workspaces', () => {
    expect(showsPhoneTabBar('/inventory/workbench')).toBe(false);
    expect(showsPhoneTabBar('/admin/settings')).toBe(false);
    expect(showsPhoneTabBar('/buying/auctions')).toBe(false);
  });

  it('ignores a trailing slash and case', () => {
    expect(showsPhoneTabBar('/Today/')).toBe(true);
    expect(showsPhoneTabBar('/Pay/')).toBe(true);
  });
});

describe('phoneShellTitle', () => {
  it('labels the slim top bar from the route', () => {
    expect(phoneShellTitle('/dashboard')).toBe('Dashboard');
    expect(phoneShellTitle('/today')).toBe('Today');
    expect(phoneShellTitle('/pay')).toBe('Pay');
    expect(phoneShellTitle('/routines')).toBe('Routines');
  });

  it('translates titles when the language is Spanish', () => {
    expect(phoneShellTitle('/dashboard', 'es')).toBe('Tablero');
    expect(phoneShellTitle('/today', 'es')).toBe('Hoy');
    expect(phoneShellTitle('/pay', 'es')).toBe('Pago');
    expect(phoneShellTitle('/routines', 'es')).toBe('Rutinas');
  });
});
