import { Box, Chip, Tooltip } from '@mui/material';
import { useMemo, type MouseEvent } from 'react';
import { multiSelectChipTooltip } from '../../utils/multiSelectChipTooltip';

/** Row-3 filter chips (no “All”; empty selection = no filter). */
export type AuctionFilterChipId = 'profitable' | 'needed' | 'thumbs' | 'watched' | 'manifest';

const CHIPS: { id: AuctionFilterChipId; label: string }[] = [
  { id: 'profitable', label: 'Profitable' },
  { id: 'needed', label: 'Needed' },
  { id: 'thumbs', label: 'Thumbs up' },
  { id: 'watched', label: 'Watched' },
  { id: 'manifest', label: 'Has manifest' },
];

type Props = {
  active: Set<AuctionFilterChipId>;
  onToggle: (id: AuctionFilterChipId, event: MouseEvent) => void;
};

export default function BuyingFilterChips({ active, onToggle }: Props) {
  const tooltipTitle = useMemo(() => multiSelectChipTooltip(), []);
  return (
    <Box
      sx={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        gap: 0.5,
        alignItems: 'center',
        rowGap: 0.5,
        maxWidth: '100%',
      }}
    >
      {CHIPS.map(({ id, label }) => (
        <Tooltip key={id} title={tooltipTitle} enterDelay={400} placement="top">
          <Chip
            size="small"
            label={label}
            color={active.has(id) ? 'primary' : 'default'}
            variant={active.has(id) ? 'filled' : 'outlined'}
            onClick={(e) => onToggle(id, e)}
            sx={{
              cursor: 'pointer',
              height: { xs: 24, sm: 26 },
              fontSize: { xs: '0.7rem', sm: '0.75rem' },
            }}
          />
        </Tooltip>
      ))}
    </Box>
  );
}
