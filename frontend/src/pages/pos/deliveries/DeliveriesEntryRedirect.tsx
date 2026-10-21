import { Navigate, useSearchParams } from 'react-router-dom';
import { resolveDeliveryExperience } from '../../../utils/delivery/experiencePreference';
import { deliveryListPath, type DeliveryListKind } from './deliveryPaths';

/**
 * `/pos/deliveries` and `/pos/deliveries/{schedule|table}` land on Desk (desktop)
 * or Field (mobile). Legacy `?tab=` / `?date=` bookmarks keep working on Schedule.
 */
export default function DeliveriesEntryRedirect({
  page = 'schedule',
}: {
  page?: DeliveryListKind;
}) {
  const [params] = useSearchParams();
  const experience = resolveDeliveryExperience(params.get('experience'));
  const next = new URLSearchParams();
  const tab = params.get('tab');
  const date = params.get('date');
  if (page === 'schedule' && (tab === 'past' || tab === 'future' || tab === 'today')) {
    next.set('bucket', tab === 'today' ? 'today' : tab);
  }
  if (date) next.set('q', date);
  const qs = next.toString();
  return <Navigate to={deliveryListPath(experience, page, qs ? `?${qs}` : '')} replace />;
}
