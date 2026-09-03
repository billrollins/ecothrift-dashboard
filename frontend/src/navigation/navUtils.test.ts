import { beforeEach, describe, expect, it, vi } from 'vitest';
import { navigateForNavItem } from './navUtils';

describe('navigateForNavItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens Today on the desk and on a phone', () => {
    const navigate = vi.fn();
    navigateForNavItem(navigate, {
      id: 'today',
      path: '/today',
      label: 'Today',
      icon: 'factCheck',
    });
    expect(navigate).toHaveBeenCalledWith({ pathname: '/today', hash: '' }, undefined);
  });

  it('opens Pay on the desk and on a phone', () => {
    const navigate = vi.fn();
    navigateForNavItem(navigate, {
      id: 'pay',
      path: '/pay',
      label: 'Pay',
      icon: 'payments',
    });
    expect(navigate).toHaveBeenCalledWith({ pathname: '/pay', hash: '' }, undefined);
  });
});
