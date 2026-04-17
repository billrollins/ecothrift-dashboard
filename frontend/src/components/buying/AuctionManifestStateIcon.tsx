import { Box, Tooltip } from '@mui/material';
import { BUYING_AUCTION_LIST_ROW_ICON_PX } from '../../constants/buyingAuctionListUi';
import type { BuyingAuctionListItem } from '../../types/buying.types';
import {
  auctionManifestColumnAriaLabel,
  auctionManifestColumnTooltip,
  getAuctionManifestColumnState,
  type AuctionManifestColumnState,
} from '../../utils/buyingManifestState';

const GREEN = '#3B6D11';
const PURPLE = '#3C3489';
const MUTED = '#888780';

type Props = {
  row: BuyingAuctionListItem;
  /** Default matches auction list row icons. */
  size?: number;
  /** When set, skip row lookup and render this state directly. */
  state?: AuctionManifestColumnState;
};

function FileDocOutline({
  stroke,
  strokeWidth,
  dasharray,
}: {
  stroke: string;
  strokeWidth: number;
  dasharray?: string;
}) {
  return (
    <path
      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dasharray}
    />
  );
}

function FileFold({ stroke, strokeWidth }: { stroke: string; strokeWidth: number }) {
  return (
    <polyline
      points="14 2 14 8 20 8"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function IconVerified({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <FileDocOutline stroke={GREEN} strokeWidth={2} />
      <FileFold stroke={GREEN} strokeWidth={2} />
      <path
        d="m9 15 2 2 4-4"
        fill="none"
        stroke={GREEN}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconAiEstimate({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <FileDocOutline stroke={PURPLE} strokeWidth={2} />
      <FileFold stroke={PURPLE} strokeWidth={2} />
      <path d="M12 18l-1-2-2-1 2-1 1-2 1 2 2 1-2 1z" fill={PURPLE} stroke="none" />
    </svg>
  );
}

function IconEmpty({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <FileDocOutline stroke={MUTED} strokeWidth={1.5} dasharray="3 2" />
      <FileFold stroke={MUTED} strokeWidth={1.5} />
    </svg>
  );
}

/**
 * Three-state manifest indicator for auction list rows (verified / AI estimate / empty).
 */
export default function AuctionManifestStateIcon({ row, size = BUYING_AUCTION_LIST_ROW_ICON_PX, state: stateProp }: Props) {
  const state = stateProp ?? getAuctionManifestColumnState(row);
  const label = auctionManifestColumnAriaLabel(state);
  const tip = auctionManifestColumnTooltip(state);

  const inner =
    state === 'verified' ? (
      <IconVerified size={size} />
    ) : state === 'ai_estimate' ? (
      <IconAiEstimate size={size} />
    ) : (
      <IconEmpty size={size} />
    );

  return (
    <Tooltip title={tip} enterDelay={400}>
      <Box
        component="span"
        role="img"
        aria-label={label}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 0,
        }}
      >
        {inner}
      </Box>
    </Tooltip>
  );
}
