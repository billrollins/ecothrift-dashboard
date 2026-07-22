export type DeliveryExperience = 'desk' | 'field';

/** @deprecated Preference storage kept for migration cleanup only. */
const LS_KEY = 'deliveryExperiencePreference';

export function readDeliveryExperiencePreference(): DeliveryExperience | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw === 'desk' || raw === 'field') return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeDeliveryExperiencePreference(value: DeliveryExperience): void {
  try {
    localStorage.setItem(LS_KEY, value);
  } catch {
    /* ignore */
  }
}

export function clearDeliveryExperiencePreference(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

export function defaultDeliveryExperienceFromViewport(): DeliveryExperience {
  if (typeof window === 'undefined') return 'desk';
  const mq =
    typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 767px)') : null;
  return mq?.matches ? 'field' : 'desk';
}

/**
 * Desk vs Field is viewport-driven. Explicit ?experience= still works for deep links.
 * Stored preference is ignored so there is no manual Desk/Field toggle.
 */
export function resolveDeliveryExperience(override?: string | null): DeliveryExperience {
  if (override === 'desk' || override === 'field') return override;
  return defaultDeliveryExperienceFromViewport();
}
