import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultDeliveryExperienceFromViewport,
  readDeliveryExperiencePreference,
  resolveDeliveryExperience,
  writeDeliveryExperiencePreference,
} from './experiencePreference';

describe('experiencePreference', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('persists desk/field preference', () => {
    expect(readDeliveryExperiencePreference()).toBeNull();
    writeDeliveryExperiencePreference('field');
    expect(readDeliveryExperiencePreference()).toBe('field');
  });

  it('honors explicit override over storage', () => {
    writeDeliveryExperiencePreference('desk');
    expect(resolveDeliveryExperience('field')).toBe('field');
    expect(resolveDeliveryExperience(null)).toBe('desk');
  });

  it('falls back to viewport default', () => {
    expect(['desk', 'field']).toContain(defaultDeliveryExperienceFromViewport());
  });
});
