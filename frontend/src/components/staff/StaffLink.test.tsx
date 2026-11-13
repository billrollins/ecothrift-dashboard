import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StaffLink } from './StaffLink';

const state = vi.hoisted(() => ({
  viewer: null as null | Record<string, unknown>,
  modal: null as null | { openObject: ReturnType<typeof vi.fn> },
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: state.viewer }) }));
vi.mock('../objects/ObjectModal', () => ({ useOptionalObjectModal: () => state.modal }));

describe('StaffLink', () => {
  beforeEach(() => {
    state.modal = { openObject: vi.fn() };
    state.viewer = { id: 1, is_superuser: true, role: 'Admin' };
  });

  it('opens the staff window for the owner, and the row under it never hears the click', () => {
    const rowClick = vi.fn();
    render(<div onClick={rowClick}><StaffLink userId={7}>Raylan Rollins</StaffLink></div>);
    fireEvent.click(screen.getByTestId('staff-link'));
    expect(state.modal?.openObject).toHaveBeenCalledWith({ type: 'staff', id: 7 });
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('is plain text for someone who cannot open staff records today (a manager)', () => {
    state.viewer = { id: 2, is_superuser: false, role: 'Manager', access: ['people:manage'] };
    render(<StaffLink userId={7}>Raylan Rollins</StaffLink>);
    expect(screen.getByText('Raylan Rollins')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-link')).not.toBeInTheDocument();
  });

  it('is plain text with no id or outside a window provider', () => {
    const first = render(<StaffLink userId={null}>Nobody</StaffLink>);
    expect(screen.queryByTestId('staff-link')).not.toBeInTheDocument();
    first.unmount();
    state.modal = null;
    render(<StaffLink userId={7}>Raylan</StaffLink>);
    expect(screen.queryByTestId('staff-link')).not.toBeInTheDocument();
  });
});
