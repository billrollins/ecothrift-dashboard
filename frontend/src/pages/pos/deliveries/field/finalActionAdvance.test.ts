import { describe, expect, it, vi } from 'vitest';
import { finalActionThenAdvance } from './finalActionAdvance';

describe('finalActionThenAdvance', () => {
  it('advances only after a successful mutation', async () => {
    const advance = vi.fn();
    let resolveMutate!: () => void;
    const mutate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMutate = resolve;
        }),
    );

    const pending = finalActionThenAdvance(mutate, advance);
    expect(advance).not.toHaveBeenCalled();
    resolveMutate();
    await pending;
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it('does not advance when the mutation rejects', async () => {
    const advance = vi.fn();
    await expect(
      finalActionThenAdvance(() => Promise.reject(new Error('boom')), advance),
    ).rejects.toThrow('boom');
    expect(advance).not.toHaveBeenCalled();
  });
});
