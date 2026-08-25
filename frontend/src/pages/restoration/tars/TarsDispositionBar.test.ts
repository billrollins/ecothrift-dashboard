import { describe, expect, it } from 'vitest';
import { DISPATCH_CHOICES } from './TarsDispositionBar';

describe('Dispatch', () => {
  it('offers queue, hold, reject and finish, in that order', () => {
    expect(DISPATCH_CHOICES).toEqual(['queue', 'hold', 'reject', 'done']);
  });
});
