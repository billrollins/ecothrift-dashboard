import { describe, expect, it } from 'vitest';
import { activityText, staffPreviewUrl } from './bstockDisputeDisplay';

describe('bstockDisputeDisplay', () => {
  it('tags our own preview', () => {
    expect(staffPreviewUrl('https://dash.ecothrift.us/dispute/abc/')).toBe('https://dash.ecothrift.us/dispute/abc/?from=dash');
    expect(staffPreviewUrl('/dispute/abc/?x=1')).toBe('/dispute/abc/?x=1&from=dash');
  });

  it('says when nobody outside opened it', () => {
    expect(
      activityText({ outside_views: 0, outside_by_kind: {}, outside_visitors: 0, last_outside_at: null, recent: [] }),
    ).toBe('Not opened outside Dash yet.');
  });

  it('counts views, people and downloads', () => {
    const text = activityText({
      outside_views: 3,
      outside_by_kind: { view: 3, xlsx: 1, photo: 4 },
      outside_visitors: 2,
      last_outside_at: null,
      recent: [],
    });
    expect(text).toBe('Opened 3 times by 2 people. Opened or downloaded: Excel 1, photo 4.');
  });
});
