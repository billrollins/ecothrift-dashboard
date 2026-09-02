import { describe, expect, it } from 'vitest';
import { idlePromptDue } from './idlePrompt';

describe('idlePromptDue', () => {
  const now = '2026-09-02T15:10:00.000Z';

  it('is due when nothing has been stored yet', () => {
    expect(idlePromptDue(null, now, 5)).toBe(true);
  });

  it('waits until the idle minutes have passed', () => {
    expect(idlePromptDue('2026-09-02T15:06:00.000Z', now, 5)).toBe(false);
    expect(idlePromptDue('2026-09-02T15:05:00.000Z', now, 5)).toBe(true);
    expect(idlePromptDue('2026-09-02T15:04:00.000Z', now, 5)).toBe(true);
  });

  it('stays quiet when minutes is zero', () => {
    expect(idlePromptDue(null, now, 0)).toBe(false);
  });

  it('refuses a broken clock rather than prompting forever', () => {
    expect(idlePromptDue('not-a-date', now, 5)).toBe(false);
  });
});
