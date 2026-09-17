import { describe, expect, it } from 'vitest';
import { commandKeyAction } from './commandKeys';

function event(key: string, closest = false) {
  const target = closest
    ? { closest: () => true }
    : { closest: () => null };
  return { key, target } as unknown as { key: string; target: EventTarget | null };
}

describe('commandKeyAction', () => {
  it('moves the week and selects days', () => {
    expect(commandKeyAction(event('ArrowLeft'))).toEqual({ type: 'week', delta: -1 });
    expect(commandKeyAction(event('ArrowRight'))).toEqual({ type: 'week', delta: 1 });
    expect(commandKeyAction(event('1'))).toEqual({ type: 'day', index: 0 });
    expect(commandKeyAction(event('7'))).toEqual({ type: 'day', index: 6 });
    expect(commandKeyAction(event('Escape'))).toEqual({ type: 'escape' });
  });

  it('does nothing when focus is in an input, select, or dialog', () => {
    expect(commandKeyAction(event('ArrowLeft', true))).toBeNull();
    expect(commandKeyAction(event('1', true))).toBeNull();
    expect(commandKeyAction(event('Escape', true))).toBeNull();
  });
});
