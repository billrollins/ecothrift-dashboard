import { describe, expect, it } from 'vitest';
import { isHiddenKey } from '../../admin/settings/settingsRegistry';
import { DEFAULT_SECTION_DAYS, SECTION_CHECK_HELP, SECTION_CHECK_KEY } from './AdminSectionsPane';

describe('section check weekdays', () => {
  it('turns Monday on by default and lives on the Sections page', () => {
    expect(DEFAULT_SECTION_DAYS).toEqual([true, true, true, true, true, true, false]);
    expect(SECTION_CHECK_KEY).toBe('retail_qa.section_check_weekdays');
    expect(SECTION_CHECK_HELP).toContain('open or closed');
    expect(isHiddenKey(SECTION_CHECK_KEY)).toBe(true);
  });
});
