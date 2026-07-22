import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearDeliveryExperiencePreference,
  defaultDeliveryExperienceFromViewport,
  resolveDeliveryExperience,
  writeDeliveryExperiencePreference,
} from './experiencePreference';

describe('experiencePreference', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('honors explicit override', () => {
    expect(resolveDeliveryExperience('field')).toBe('field');
    expect(resolveDeliveryExperience('desk')).toBe('desk');
  });

  it('ignores stored preference and uses viewport', () => {
    writeDeliveryExperiencePreference('desk');
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    expect(resolveDeliveryExperience(null)).toBe('field');
    clearDeliveryExperiencePreference();
  });

  it('falls back to viewport default', () => {
    expect(['desk', 'field']).toContain(defaultDeliveryExperienceFromViewport());
  });
});
