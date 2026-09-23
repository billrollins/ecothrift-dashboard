import { useEffect, useState } from 'react';
import { Alert, Button, Snackbar } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { BSTOCK_HANDOFF_PATH, clearPendingBstockToken, peekPendingBstockToken } from './bstockHandoff';

/**
 * The bookmark hand-off lands on the sign-in page when the session has lapsed, and
 * sign-in always continues to the Dashboard, so the confirm page is skipped. This
 * notice (staff layout) points the owner back to it while the login is still fresh.
 * A non-owner staff session drops the owner's login from this tab at once; any other
 * session leaves it to expire (15 minutes).
 */
export function PendingBstockLoginNotice() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(() => peekPendingBstockToken());

  useEffect(() => {
    setPending(peekPendingBstockToken());
  }, [location.pathname]);

  useEffect(() => {
    if (pending && user && !user.is_superuser) {
      clearPendingBstockToken();
      setPending(null);
    }
  }, [pending, user]);

  const onOwnPage = location.pathname === BSTOCK_HANDOFF_PATH || location.pathname.startsWith('/routines/run/');
  if (!pending || !user?.is_superuser || onOwnPage) return null;

  return (
    <Snackbar open anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert
        severity="info"
        action={(
          <>
            <Button color="inherit" size="small" onClick={() => navigate(BSTOCK_HANDOFF_PATH)}>
              Review
            </Button>
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                clearPendingBstockToken();
                setPending(null);
              }}
            >
              Discard
            </Button>
          </>
        )}
      >
        A B-Stock login is waiting to be sent.
      </Alert>
    </Snackbar>
  );
}
