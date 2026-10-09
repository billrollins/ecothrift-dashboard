import { describe, expect, it } from 'vitest';
import { bankInto, rainPlan, shower } from './TicketRain';

describe('rainPlan: what a swipe right plays (owner, 2026-10-09)', () => {
  it('plays nothing on the first look at a cart', () => {
    expect(rainPlan(null, { fill: 600, bank: 0, cover: 1000 })).toEqual({ cover: false, shower: false, balance: false });
  });

  it('fills the cover first, showers when this add pays it in full, then the balance', () => {
    expect(rainPlan({ fill: 600, bank: 0 }, { fill: 800, bank: 0, cover: 1000 })).toEqual({ cover: true, shower: false, balance: false });
    expect(rainPlan({ fill: 800, bank: 0 }, { fill: 1000, bank: 210, cover: 1000 })).toEqual({ cover: true, shower: true, balance: true });
    expect(rainPlan({ fill: 1000, bank: 210 }, { fill: 1000, bank: 630, cover: 1000 })).toEqual({ cover: false, shower: false, balance: true });
  });

  it('plays nothing when an item comes out', () => {
    expect(rainPlan({ fill: 1000, bank: 630 }, { fill: 800, bank: 0, cover: 1000 })).toEqual({ cover: false, shower: false, balance: false });
  });
});

describe('the animations themselves', () => {
  it('do nothing where the browser cannot animate (and leave no tickets behind)', () => {
    const root = document.createElement('div');
    const target = document.createElement('span');
    root.appendChild(target);
    bankInto(root, target);
    shower(root);
    expect(root.querySelectorAll('[data-tp-ticket]')).toHaveLength(0);
  });
});
