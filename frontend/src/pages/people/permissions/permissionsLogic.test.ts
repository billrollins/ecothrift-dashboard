import { describe, expect, it } from 'vitest';
import type { AccessArea, AccessPerson } from '../../../api/accounts.api';
import { dialLabel, itemsGiven, setStep, tidy, toggleLayerItem, togglePersonItem } from './permissionsLogic';

const buying: AccessArea = {
  id: 'buying',
  label: 'Buying',
  helper: '',
  items: [
    { id: 'buying:browse', step: 1, label: 'See auctions', locked: false },
    { id: 'buying.thumbs:write', step: 2, label: 'Thumbs-up', locked: false },
    { id: 'buying.purchase', step: 4, label: 'Purchaser', locked: false },
  ],
};

describe('permissions ticks (#53)', () => {
  it('a step gives every item at or below it', () => {
    expect([...itemsGiven(buying, { step: 2 })]).toEqual(['buying:browse', 'buying.thumbs:write']);
    expect([...itemsGiven(buying, { step: 2, add: ['buying.purchase'], remove: ['buying:browse'] })])
      .toEqual(['buying.thumbs:write', 'buying.purchase']);
  });

  it('a level tick takes away what the step gives and adds what it does not', () => {
    expect(toggleLayerItem(buying, { step: 2 }, 'buying:browse', 'level')).toEqual({ step: 2, remove: ['buying:browse'] });
    expect(toggleLayerItem(buying, { step: 2 }, 'buying.purchase', 'level')).toEqual({ step: 2, add: ['buying.purchase'] });
    expect(toggleLayerItem(buying, { step: 2, add: ['buying.purchase'] }, 'buying.purchase', 'level')).toEqual({ step: 2 });
  });

  it('a department only adds', () => {
    expect(toggleLayerItem(buying, { step: 2 }, 'buying:browse', 'department')).toEqual({ step: 2 });
    expect(toggleLayerItem(buying, undefined, 'buying.purchase', 'department')).toEqual({ add: ['buying.purchase'] });
  });

  it('a person tick undoes their own exception first, then says no', () => {
    const person = { items: { 'buying:browse': 'level', 'buying.purchase': 'person' } } as unknown as AccessPerson;
    expect(togglePersonItem(person, { add: ['buying.purchase'] }, 'buying.purchase')).toEqual({});
    expect(togglePersonItem(person, undefined, 'buying:browse')).toEqual({ remove: ['buying:browse'] });
    expect(togglePersonItem(person, { remove: ['buying.thumbs:write'] }, 'buying.thumbs:write')).toEqual({});
    expect(togglePersonItem(person, undefined, 'buying.thumbs:write')).toEqual({ add: ['buying.thumbs:write'] });
  });

  it('a new dial clears the ticks; labels read plainly', () => {
    expect(setStep({ step: 2, add: ['buying.purchase'] }, 3)).toEqual({ step: 3 });
    expect(dialLabel({ step: 2, add: ['x'] }, 'level')).toBe('Work +1');
    expect(dialLabel({ step: 0 }, 'department')).toBe('Adds nothing');
    expect(dialLabel(undefined, 'person')).toBe('Same as level');
    expect(tidy({ buying: {}, cashier: { step: 1 } }, 'person')).toEqual({ cashier: { step: 1 } });
  });
});
