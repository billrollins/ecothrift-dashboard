import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import type { DeliveryExperience } from '../../../utils/delivery/experiencePreference';
import { resolveDeliveryExperience } from '../../../utils/delivery/experiencePreference';
import { deliveryDayPath, deliveryListPath, type DeliveryListKind } from './deliveryPaths';

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

/** Old `/days/:dayId` bookmarks → `/schedule/:dayId`. */
export function LegacyDeliveryDayRedirect({ experience }: { experience: DeliveryExperience }) {
  const { dayId } = useParams();
  const { search } = useLocation();
  return <Navigate to={deliveryDayPath(experience, dayId ?? '', search)} replace />;
}
