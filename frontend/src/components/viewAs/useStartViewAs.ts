import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

function messageOf(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : 'Could not start View as.';
}

/** Start View as for one person; Dash then reloads as them. Keeps the error to show. */
export function useStartViewAs() {
  const { startViewAs } = useAuth();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (userId: number) => {
    setPendingId(userId);
    setError(null);
    try {
      await startViewAs(userId);
    } catch (err) {
      setError(messageOf(err));
      setPendingId(null);
    }
  };

  return { start, pendingId, error };
}
