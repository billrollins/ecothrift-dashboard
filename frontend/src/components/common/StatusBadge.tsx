import { Chip, Tooltip } from '@mui/material';

type StatusSize = 'small' | 'medium';

type ChipColor = 'success' | 'warning' | 'error' | 'default' | 'info';

const STATUS_COLOR_MAP: Record<string, ChipColor> = {
  approved: 'success',
  active: 'success',
  completed: 'success',
  paid: 'success',
  on_shelf: 'success',

  pending: 'warning',
  ordered: 'warning',
  open: 'warning',

  flagged: 'error',
  denied: 'error',
  voided: 'error',
  cancelled: 'error',
  closed: 'error',
  terminated: 'error',
  inactive: 'default',
};

function getStatusColor(status: string): ChipColor {
  const normalized = status.toLowerCase().replace(/\s+/g, '_');
  return STATUS_COLOR_MAP[normalized] ?? 'default';
}

function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface StatusBadgeProps {
  status: string;
  size?: StatusSize;
  tooltip?: string;
}

export function StatusBadge({ status, size = 'medium', tooltip }: StatusBadgeProps) {
  const color = getStatusColor(status);
  const label = formatStatusLabel(status);

  const chip = (
    <Chip
      label={label}
      size={size}
      color={color}
      variant="outlined"
      sx={{
        fontWeight: 500,
        textTransform: 'capitalize',
        cursor: tooltip ? 'help' : undefined,
      }}
    />
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} arrow>
        {chip}
      </Tooltip>
    );
  }

  return chip;
}
