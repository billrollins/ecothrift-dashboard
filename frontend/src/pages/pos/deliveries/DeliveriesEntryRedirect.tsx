import { Navigate, useSearchParams } from 'react-router-dom';
import { resolveDeliveryExperience } from '../../../utils/delivery/experiencePreference';

/**
 * /pos/deliveries → Desk (desktop) or Field (mobile) Days.
 * Legacy `?tab=` / `?date=` bookmarks land on the matching Days list.
 */
export default function DeliveriesEntryRedirect() {
  const [params] = useSearchParams();
  const experience = resolveDeliveryExperience(params.get('experience'));
  const next = new URLSearchParams();
  const tab = params.get('tab');
  const date = params.get('date');
  if (tab === 'past' || tab === 'future' || tab === 'today') {
    next.set('bucket', tab === 'today' ? 'today' : tab);
  }
  if (date) next.set('q', date);
  const qs = next.toString();
  return <Navigate to={`/pos/deliveries/${experience}/days${qs ? `?${qs}` : ''}`} replace />;
}
