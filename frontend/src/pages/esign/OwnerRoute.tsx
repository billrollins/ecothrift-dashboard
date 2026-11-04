import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/** The e-sign owner pages: the owner (superuser) only, like the server's own check (apps/core/esign_host.py). */
export function EsignOwnerRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.is_superuser) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
