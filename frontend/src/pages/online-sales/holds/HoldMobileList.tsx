import { Stack, Typography } from '@mui/material';
import type { Reservation } from '../../../api/webstore.api';
import HoldMobileRow from './HoldMobileRow';

type Props = {
  rows: Reservation[];
  onSelect: (id: number) => void;
  emptyTitle: string;
  emptyHint?: string;
  emphasis?: 'expires' | 'requested' | 'completed' | 'released';
  showMoney?: boolean;
};

/** Scrollable stack of field-style hold cards for phone widths. */
export default function HoldMobileList({
  rows,
  onSelect,
  emptyTitle,
  emptyHint,
  emphasis = 'expires',
  showMoney = false,
}: Props) {
  if (rows.length === 0) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        spacing={0.5}
        sx={{
          px: 3,
          py: 6,
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 2.5,
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="body2" color="text.secondary" align="center">
          {emptyTitle}
        </Typography>
        {emptyHint ? (
          <Typography variant="caption" color="text.disabled" align="center">
            {emptyHint}
          </Typography>
        ) : null}
      </Stack>
    );
  }

  return (
    <Stack spacing={1}>
      {rows.map((row) => (
        <HoldMobileRow
          key={row.id}
          reservation={row}
          onSelect={onSelect}
          emphasis={emphasis}
          showMoney={showMoney}
        />
      ))}
    </Stack>
  );
}
