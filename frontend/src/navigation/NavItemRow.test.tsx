import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Storefront from '@mui/icons-material/Storefront';
import { NavItemRow } from './NavItemRow';
import type { ResolvedNavItem } from './navTypes';

const item: ResolvedNavItem = {
  id: 'onlineSalesHolds',
  path: '/online-sales/holds',
  label: 'Holds',
  icon: 'storefront',
  Icon: Storefront,
};

describe('NavItemRow', () => {
  it('shows waiting work as a badge', () => {
    render(<NavItemRow item={item} isActive={false} onClick={() => {}} badgeCount={3} />);
    expect(screen.getByLabelText('3 waiting')).toHaveTextContent('3');
  });

  it('stays quiet when nothing is waiting', () => {
    render(<NavItemRow item={item} isActive={false} onClick={() => {}} badgeCount={0} />);
    expect(screen.queryByLabelText(/waiting/)).not.toBeInTheDocument();
  });

  it('caps a runaway count', () => {
    render(<NavItemRow item={item} isActive={false} onClick={() => {}} badgeCount={140} />);
    expect(screen.getByLabelText('140 waiting')).toHaveTextContent('99+');
  });
});
