import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { useCardTypeFixWindow } from '../../hooks/useCardTypeFixWindow';
import type { Cart } from '../../types/pos.types';
import { CardTypeFixDialog } from './CardTypeFixDialog';

type Props = {
  cart: Cart;
  onUpdated?: (cart: Cart) => void;
  fullWidth?: boolean;
};

export function CardTypeFixControls({ cart, onUpdated, fullWidth }: Props) {
  const { user } = useAuth();
  const windowState = useCardTypeFixWindow(cart, user);
  const [open, setOpen] = useState(false);

  if (!windowState.eligible) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: fullWidth ? 'stretch' : 'flex-start',
        gap: 0.25,
      }}
    >
      <Button
        variant="outlined"
        size="small"
        fullWidth={fullWidth}
        disabled={!windowState.canFix}
        onClick={() => setOpen(true)}
        sx={fullWidth ? { minHeight: 48 } : undefined}
      >
        Fix card type
      </Button>
      <Typography variant="caption" color="text.secondary">
        {windowState.reason}
      </Typography>
      <CardTypeFixDialog
        open={open}
        cart={cart}
        onClose={() => setOpen(false)}
        onUpdated={(updated) => {
          setOpen(false);
          onUpdated?.(updated);
        }}
      />
    </Box>
  );
}
