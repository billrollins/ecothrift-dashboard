import type { DeliveryExperience } from '../../../utils/delivery/experiencePreference';

export type DeliveryListKind = 'schedule' | 'table';

export function deliveryListPath(
  experience: DeliveryExperience,
  kind: DeliveryListKind,
  search = '',
): string {
  return `/pos/deliveries/${experience}/${kind}${search}`;
}

export function deliveryDayPath(
  experience: DeliveryExperience,
  dayId: number | string,
  search = '',
): string {
  return `/pos/deliveries/${experience}/schedule/${dayId}${search}`;
}

export function isDeliveryTablePath(pathname: string): boolean {
  return /\/pos\/deliveries\/(?:desk|field)\/table\/?$/.test(pathname);
}

export function isDeliveryDayDetailPath(pathname: string): boolean {
  return /\/pos\/deliveries\/(?:desk|field)\/schedule\/\d+/.test(pathname);
}

export function deliveryDayIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/pos\/deliveries\/(?:desk|field)\/schedule\/(\d+)/);
  return match?.[1] ?? null;
}
