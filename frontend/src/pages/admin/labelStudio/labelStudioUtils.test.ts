import { describe, expect, it } from 'vitest';

import { starterDefinition } from './designerState';
import { designerSnapshotKey, formatApiError } from './labelStudioUtils';

describe('Label Studio utilities', () => {
  it('detects meaningful draft changes with a stable snapshot', () => {
    const definition = starterDefinition();
    const saved = designerSnapshotKey({
      name: 'Shelf',
      widthIn: '3.00',
      heightIn: '2',
      definition,
      backgroundFileId: 1,
    });
    const same = designerSnapshotKey({
      name: ' Shelf ',
      widthIn: '3',
      heightIn: '2.0',
      definition,
      backgroundFileId: 1,
    });
    expect(saved).toBe(same);
  });

  it('formats field API errors for staff', () => {
    expect(
      formatApiError(
        { response: { data: { width_in: ['Must be positive.'] } } },
        'Save failed',
      ),
    ).toBe('width in: Must be positive.');
  });
});
