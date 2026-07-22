import { Navigate, useSearchParams } from 'react-router-dom';
import { resolveDeliveryExperience } from '../../../utils/delivery/experiencePreference';

/**
 * /pos/deliveries → Desk or Field Days.
 * Legacy bookmarks with tab/date go to the compatibility board.
 */
export default function DeliveriesEntryRedirect() {
  const [params] = useSearchParams();
  const tab = params.get('tab');
  const date = params.get('date');
  if (tab || date) {
    const next = new URLSearchParams();
    if (tab) next.set('tab', tab);
    if (date) next.set('date', date);
    const qs = next.toString();
    return <Navigate to={`/pos/deliveries/legacy${qs ? `?${qs}` : ''}`} replace />;
  }
  const experience = resolveDeliveryExperience(params.get('experience'));
  return <Navigate to={`/pos/deliveries/${experience}/days`} replace />;
}
