import GavelRounded from '@mui/icons-material/GavelRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { BuyingNags } from '../../types/buying.types';
import { formatCurrencyWhole } from '../../utils/format';
import { dutyColors } from '../duty/tokens';
import { NAG_AMBER } from '../routines/MyWorkList';

function NagRow({ color, icon, title, body, onOpen }: { color: string; icon: ReactNode; title: string; body: string; onOpen: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      sx={{
        width: '100%',
        display: 'flex',
        gap: 1.25,
        alignItems: 'flex-start',
        px: 1.5,
        py: 1.25,
        mb: 1,
        borderRadius: '12px',
        border: `1.5px solid ${color}`,
        bgcolor: dutyColors.card,
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <Box sx={{ color, mt: 0.25, display: 'flex' }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 14.5, fontWeight: 800, color }}>{title}</Typography>
        <Typography sx={{ fontSize: 12.5, color: dutyColors.ink60 }} noWrap>
          {body}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * The buyer's nags in the drawer: bid on a watched lot that ends within the hour and is still
 * under the max (red in the last 15 minutes), and say whether we won the ones that ended. The
 * app never bids; these are the moments it has to say so.
 */
export function BuyingNagCards({ nags, onOpen }: { nags: BuyingNags; onOpen: (auctionId: number) => void }) {
  if (nags.count === 0) return null;
  return (
    <Box sx={{ mx: 1.5, mb: 1 }}>
      {nags.ending.map((lot) => {
        const room = lot.room != null ? `${formatCurrencyWhole(lot.room)} under your max` : 'No max set yet';
        return (
          <NagRow
            key={`ending-${lot.id}`}
            color={lot.tone === 'red' ? dutyColors.red : NAG_AMBER}
            icon={<GavelRounded />}
            title={`Bid now: ends in ${lot.minutes_left} min`}
            body={`${lot.marketplace} · ${lot.title} · ${room}`}
            onOpen={() => onOpen(lot.id)}
          />
        );
      })}
      {nags.unrecorded.map((lot) => (
        <NagRow
          key={`ended-${lot.id}`}
          color={NAG_AMBER}
          icon={<HelpOutlineRounded />}
          title="Did we win it?"
          body={`${lot.marketplace} · ${lot.title}${lot.current_price ? ` · closed near ${formatCurrencyWhole(lot.current_price)}` : ''}`}
          onOpen={() => onOpen(lot.id)}
        />
      ))}
    </Box>
  );
}
