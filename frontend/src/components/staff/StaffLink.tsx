/**
 * The one opener for the staff window (#136, Bill 2026-11-13: "every time a staff avatar, name or number is clicked the
 * staff universal window should pop up"). Wrap any staff name, avatar or EMP number:
 *
 *   <StaffLink userId={row.user_id}>{row.name}</StaffLink>
 *   <StaffLink userId={u.id} block><PersonCell … /></StaffLink>
 *
 * It looks exactly like what it wraps (same font, colour and size; an underline on hover), so wiring it in never moves
 * anything. It opens the window only for someone who could open a staff record before (Users → Employees:
 * `canOpenStaffWindow`); for anyone else, or with no id, or outside an ObjectModalProvider, it is the plain content.
 * A click never reaches the row under it (a row's own click still works everywhere else on the row).
 */
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Box } from '@mui/material';
import { canAccess, type AccessUser } from '../../auth/access';
import { useAuth } from '../../contexts/AuthContext';
import { useOptionalObjectModal } from '../objects/ObjectModal';

/** Who may open a staff record: the same gate as Users → Employees (the owner, or a grant at Full). */
export function canOpenStaffWindow(viewer: AccessUser | null | undefined): boolean {
  return canAccess(viewer, ['users.staff:manage', 'people:full']);
}

/** `open(userId)` when this viewer may open the staff window here, else null. Needs an AuthProvider above. */
export function useStaffWindow(): ((userId: number) => void) | null {
  const { user } = useAuth();
  const modal = useOptionalObjectModal();
  if (!modal || !canOpenStaffWindow(user)) return null;
  return (userId: number) => modal.openObject({ type: 'staff', id: userId });
}

type LinkProps = {
  userId: number | null | undefined;
  children: ReactNode;
  /** Wraps a block (a person cell, an avatar row) instead of a run of text. */
  block?: boolean;
  title?: string;
};

export function StaffLink(props: LinkProps) {
  // Outside a window provider (a bare test render, a print view) it is only the content; the sign-in check below
  // runs only where a window can open, which is always inside the signed-in app.
  const modal = useOptionalObjectModal();
  const { userId, children } = props;
  if (!modal || userId == null || !Number.isFinite(userId) || userId <= 0) return <>{children}</>;
  return <OpenableStaffLink {...props} userId={userId} />;
}

function OpenableStaffLink({ userId, children, block = false, title }: LinkProps & { userId: number }) {
  const open = useStaffWindow();
  if (!open) return <>{children}</>;
  const go = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    open(userId);
  };
  return (
    <Box
      component="span"
      role="button"
      tabIndex={0}
      title={title ?? 'Open staff window'}
      data-testid="staff-link"
      onClick={go}
      onMouseDown={(e: MouseEvent) => e.stopPropagation()}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') go(e);
      }}
      sx={{
        display: block ? 'flex' : 'inline',
        minWidth: 0,
        maxWidth: '100%',
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
        borderRadius: 0.5,
        '&:hover': { textDecoration: 'underline', textUnderlineOffset: '2px' },
        '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 1 },
      }}
    >
      {children}
    </Box>
  );
}
