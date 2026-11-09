/**
 * A Thrift+ member's name that opens their Member window (Bill 2026-11-09: wherever a member shows, their name opens
 * the one member surface). Plain text where no window can open (no person id, or a screen without the object modal).
 */
import type { ReactNode } from 'react';
import { Link } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { useOptionalObjectModal } from '../objects/ObjectModal';

export function MemberName({
  personId, children, sx,
}: {
  personId: number | null | undefined;
  children: ReactNode;
  sx?: SxProps<Theme>;
}) {
  const modal = useOptionalObjectModal();
  if (!personId || !modal) return <>{children}</>;
  return (
    <Link
      component="button"
      type="button"
      underline="hover"
      color="inherit"
      title="Open this member"
      onClick={(e) => {
        e.stopPropagation();
        modal.openObject({ type: 'member', id: personId });
      }}
      sx={{ font: 'inherit', fontWeight: 'inherit', textAlign: 'inherit', verticalAlign: 'baseline', textDecorationColor: 'currentColor', ...sx }}
    >
      {children}
    </Link>
  );
}

export default MemberName;
