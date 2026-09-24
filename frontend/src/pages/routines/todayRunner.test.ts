import { describe, expect, it } from 'vitest';
import { hasRunner, todayHref } from './todayRunner';

describe('todayHref', () => {
  it('opens every routine link on Today', () => {
    expect(todayHref('/routines/run/212')).toBe('/today?run=212');
    expect(todayHref('/routines?run=5')).toBe('/today?run=5');
    expect(todayHref('/routines/run/new?routine=3&draft=9')).toBe('/today?routine=3&draft=9');
    expect(todayHref('/routines/run/7?return=/admin/retail-qa')).toBe('/today?run=7&return=%2Fadmin%2Fretail-qa');
  });

  it('leaves other links alone', () => {
    expect(todayHref('/pos/terminal')).toBe('/pos/terminal');
    expect(todayHref('/routines/catalog')).toBe('/routines/catalog');
    expect(todayHref('/routines/run/new')).toBe('/routines/run/new');
  });
});

describe('hasRunner', () => {
  it('is true only when a run, routine or draft is named', () => {
    expect(hasRunner(new URLSearchParams('run=4'))).toBe(true);
    expect(hasRunner(new URLSearchParams('routine=2'))).toBe(true);
    expect(hasRunner(new URLSearchParams('hours=1'))).toBe(false);
  });
});
