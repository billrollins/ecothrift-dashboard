import { describe, expect, it } from 'vitest';
import { sidesForPick } from './palletPick';

const ALL = ['front', 'right', 'back', 'left'] as const;

describe('sidesForPick (up to 4 pallet photos in one pick)', () => {
  it('four photos on an empty pallet fill all four sides, the clicked side first', () => {
    expect(sidesForPick('front', ALL, 4)).toEqual(['front', 'right', 'back', 'left']);
    expect(sidesForPick('back', ALL, 4)).toEqual(['back', 'front', 'right', 'left']);
  });

  it('one photo goes on the side that was clicked', () => {
    expect(sidesForPick('left', ALL, 1)).toEqual(['left']);
  });

  it('a filled side is never written over', () => {
    expect(sidesForPick('right', ['right', 'left'], 4)).toEqual(['right', 'left']);
  });

  it('two photos take the clicked side and the next empty one', () => {
    expect(sidesForPick('right', ['front', 'right', 'left'], 2)).toEqual(['right', 'front']);
  });

  it('no photos, no sides', () => {
    expect(sidesForPick('front', ALL, 0)).toEqual([]);
  });
});
