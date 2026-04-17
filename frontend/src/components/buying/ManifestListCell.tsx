import { memo } from 'react';
import type { BuyingAuctionListItem } from '../../types/buying.types';
import { getAuctionManifestColumnState } from '../../utils/buyingManifestState';
import AuctionManifestStateIcon from './AuctionManifestStateIcon';

/** Auction list (mobile): manifest / AI / empty indicator. */
function ManifestListCellBase({ row }: { row: BuyingAuctionListItem }) {
  return <AuctionManifestStateIcon row={row} />;
}

/**
 * Re-render only when the derived 3-state changes, not on every row-data
 * mutation (archive_at, watchlist, thumbs, etc. don't affect this icon).
 */
const ManifestListCell = memo(ManifestListCellBase, (prev, next) => {
  if (prev.row.id !== next.row.id) return false;
  return getAuctionManifestColumnState(prev.row) === getAuctionManifestColumnState(next.row);
});

export default ManifestListCell;
