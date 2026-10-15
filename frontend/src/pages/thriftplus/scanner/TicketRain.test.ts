import { describe, expect, it } from 'vitest';
import { bankInto, shower } from './TicketRain';

describe('the ticket animations', () => {
  it('do nothing where the browser cannot animate (and leave no tickets behind)', () => {
    const root = document.createElement('div');
    const target = document.createElement('span');
    root.appendChild(target);
    bankInto(root, target);
    shower(root);
    expect(root.querySelectorAll('[data-tp-ticket]')).toHaveLength(0);
  });
});
