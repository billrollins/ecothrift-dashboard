import {
  Box,
  Chip,
  Typography,
  ToggleButton,
  Tooltip,
} from '@mui/material';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import { useMemo, type MouseEvent } from 'react';
import { multiSelectChipTooltip } from '../../utils/multiSelectChipTooltip';

/** Row filter chips (no “All”; empty selection normalizes to Today-only on parent). */
export type AuctionFilterChipId =
  | 'today'
  | 'thumbs'
  | 'watched'
  | 'manifest'
  | 'completed'
  | 'archived';

const TODAY: { id: AuctionFilterChipId; label: string } = { id: 'today', label: 'Today' };
const COMPLETED: { id: AuctionFilterChipId; label: string } = {
  id: 'completed',
  label: 'Completed',
};

type Props = {
  active: Set<AuctionFilterChipId>;
  onToggle: (id: AuctionFilterChipId, event: MouseEvent) => void;
  /** Total archived auctions (Archived toggle). */
  archivedCount?: number;
  /** Total in “completed” mode (last 7 days ended). */
  completedCount?: number;
};

function chipLabel(
  id: AuctionFilterChipId,
  base: string,
  completedCount?: number
): string {
  if (id === 'completed' && completedCount != null && completedCount >= 0) {
    return `Completed (${completedCount})`;
  }
  return base;
}

const iconToggleSx = {
  px: 0.75,
  minWidth: 36,
  height: { xs: 28, sm: 30 },
  borderRadius: 1,
  border: '1px solid',
  borderColor: 'divider',
  '&.Mui-selected': {
    borderColor: 'primary.main',
    bgcolor: 'action.selected',
  },
} as const;

export default function BuyingFilterChips({
  active,
  onToggle,
  archivedCount,
  completedCount,
}: Props) {
  const tooltipHint = useMemo(() => multiSelectChipTooltip(), []);

  const renderIconToggle = (id: 'watched' | 'thumbs' | 'manifest' | 'archived') => {
    const isOn = active.has(id);
    const titleBase =
      id === 'watched'
        ? 'Watched'
        : id === 'thumbs'
          ? 'Thumbs up'
          : id === 'manifest'
            ? 'Has manifest'
            : 'Archived';
    const title = `${titleBase}. ${tooltipHint}`;

    if (id === 'archived') {
      const count =
        archivedCount != null && archivedCount >= 0 ? archivedCount : '—';
      return (
        <Tooltip key={id} title={title} enterDelay={400} placement="top">
          <ToggleButton
            value="archived"
            selected={isOn}
            onClick={(e) => onToggle('archived', e as unknown as MouseEvent)}
            size="small"
            aria-label={`Archived (${count})`}
            sx={{
              ...iconToggleSx,
              px: 0.75,
              minWidth: 'auto',
              gap: 0.5,
            }}
          >
            <ArchiveOutlinedIcon sx={{ fontSize: 18 }} />
            <Typography
              component="span"
              variant="caption"
              sx={{
                fontVariantNumeric: 'tabular-nums',
                fontWeight: isOn ? 600 : 400,
                lineHeight: 1,
              }}
            >
              {count}
            </Typography>
          </ToggleButton>
        </Tooltip>
      );
    }

    return (
      <Tooltip key={id} title={title} enterDelay={400} placement="top">
        <ToggleButton
          value={id}
          selected={isOn}
          onClick={(e) => onToggle(id, e as unknown as MouseEvent)}
          size="small"
          aria-label={titleBase}
          sx={iconToggleSx}
        >
          {id === 'watched' ? (
            isOn ? (
              <StarIcon sx={{ fontSize: 18 }} color="warning" />
            ) : (
              <StarBorderIcon sx={{ fontSize: 18, color: 'action.active' }} />
            )
          ) : id === 'thumbs' ? (
            isOn ? (
              <ThumbUpIcon sx={{ fontSize: 18 }} color="primary" />
            ) : (
              <ThumbUpOutlinedIcon sx={{ fontSize: 18, color: 'action.disabled' }} />
            )
          ) : (
            <Inventory2OutlinedIcon
              sx={{
                fontSize: 18,
                color: isOn ? 'primary.main' : 'action.disabled',
              }}
            />
          )}
        </ToggleButton>
      </Tooltip>
    );
  };

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
      <Tooltip title={tooltipHint} enterDelay={400} placement="top">
        <Chip
          size="small"
          label={TODAY.label}
          color={active.has('today') ? 'primary' : 'default'}
          variant={active.has('today') ? 'filled' : 'outlined'}
          onClick={(e) => onToggle('today', e)}
          sx={{
            cursor: 'pointer',
            height: { xs: 24, sm: 26 },
            fontSize: { xs: '0.7rem', sm: '0.75rem' },
          }}
        />
      </Tooltip>

      {renderIconToggle('thumbs')}
      {renderIconToggle('watched')}
      {renderIconToggle('manifest')}

      <Tooltip title={tooltipHint} enterDelay={400} placement="top">
        <Chip
          size="small"
          label={chipLabel('completed', COMPLETED.label, completedCount)}
          color={active.has('completed') ? 'primary' : 'default'}
          variant={active.has('completed') ? 'filled' : 'outlined'}
          onClick={(e) => onToggle('completed', e)}
          sx={{
            cursor: 'pointer',
            height: { xs: 24, sm: 26 },
            fontSize: { xs: '0.7rem', sm: '0.75rem' },
          }}
        />
      </Tooltip>

      {renderIconToggle('archived')}
    </Box>
  );
}
