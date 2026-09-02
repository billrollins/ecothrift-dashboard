import { describe, expect, it } from 'vitest';
import { isPhoneFirstPath } from './phoneFirstRoutes';

describe('isPhoneFirstPath', () => {
  it('treats floor surfaces as phone-first', () => {
    expect(isPhoneFirstPath('/dashboard')).toBe(true);
    expect(isPhoneFirstPath('/routines')).toBe(true);
    expect(isPhoneFirstPath('/routines/run/12')).toBe(true);
    expect(isPhoneFirstPath('/documents/4/sign')).toBe(true);
    expect(isPhoneFirstPath('/hr/time-clock')).toBe(true);
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
