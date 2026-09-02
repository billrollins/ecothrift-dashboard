import { describe, expect, it } from 'vitest';
import { routineShellMode } from './routineMode';

describe('routineShellMode', () => {
  it('reads list, catalog, fill, edit, and demo from the path', () => {
    expect(routineShellMode('/routines', new URLSearchParams())).toBe('mine');
    expect(routineShellMode('/routines', new URLSearchParams('run=4'))).toBe('fill');
    expect(routineShellMode('/routines/run/4', new URLSearchParams())).toBe('fill');
    expect(routineShellMode('/routines/catalog', new URLSearchParams())).toBe('catalog');
    expect(routineShellMode('/routines/catalog', new URLSearchParams('view=9'))).toBe('demo');
    expect(routineShellMode('/routines/new', new URLSearchParams())).toBe('edit');
    expect(routineShellMode('/routines/3/edit', new URLSearchParams())).toBe('edit');
  });
});
