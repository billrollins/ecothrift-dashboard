import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BuyingAuctionListItem } from '../../types/buying.types';
import AuctionManifestStateIcon from './AuctionManifestStateIcon';

function row(over: Partial<BuyingAuctionListItem>): BuyingAuctionListItem {
  return { id: 1, has_manifest: false, total_retail_value: null, ...over } as BuyingAuctionListItem;
}

async function tooltipFor(r: BuyingAuctionListItem): Promise<string> {
  render(<AuctionManifestStateIcon row={r} />);
  fireEvent.mouseOver(screen.getByRole('img'));
  return (await screen.findByRole('tooltip', {}, { timeout: 2000 })).textContent ?? '';
}

describe('AuctionManifestStateIcon', () => {
  it('says a manifest was pulled from B-Stock', async () => {
    const text = await tooltipFor(row({ has_manifest: true, manifest_source: 'auto' }));
    expect(text).toContain('manifest rows drive retail');
    expect(text).toContain('Pulled from B-Stock.');
  });

  it('says a manifest was uploaded', async () => {
    expect(await tooltipFor(row({ has_manifest: true, manifest_source: 'manual' }))).toContain('Uploaded CSV.');
  });

  it('says why a pull failed when there are no rows', async () => {
    const text = await tooltipFor(row({ manifest_pull_error: 'B-Stock has no manifest for this lot (HTTP 404).' }));
    expect(text).toContain('Auto pull failed: B-Stock has no manifest for this lot (HTTP 404).');
  });
});
