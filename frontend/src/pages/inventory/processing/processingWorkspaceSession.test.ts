import { afterEach, describe, expect, it } from 'vitest';

import {
  readProcessingWorkspaceSession,
  writeProcessingWorkspaceSession,
} from './processingWorkspaceSession';

describe('processingWorkspaceSession', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('round-trips search and open row per order', () => {
    writeProcessingWorkspaceSession(42, { search: 'box', detailProcessingRowId: 9001 });
    expect(readProcessingWorkspaceSession(42)).toEqual({
      search: 'box',
      detailProcessingRowId: 9001,
    });
    expect(readProcessingWorkspaceSession(99)).toBeNull();
  });

  it('ignores invalid stored detail ids', () => {
    sessionStorage.setItem(
      'ecothrift.processingWorkspace.v1.42',
      JSON.stringify({ search: 'x', detailProcessingRowId: 'nope' }),
    );
    expect(readProcessingWorkspaceSession(42)).toEqual({
      search: 'x',
      detailProcessingRowId: null,
    });
  });
});
