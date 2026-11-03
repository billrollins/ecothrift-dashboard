/**
 * The Sale window: one sale opened from anywhere (`openObject({ type: 'sale', id })`). For now it is the Transactions
 * page's sale detail in a window, so a history row has somewhere to go; the rich Transaction window is update #15.
 */
import { Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCart } from '../../../api/pos.api';
import type { Cart } from '../../../types/pos.types';
import { CopyId, Stat } from '../../objects/windowParts';
import { SaleDetail } from '../SaleDetail';
import { money, useRetailCopy } from './retailCopy';

export function SaleWindow({ id }: { id: number }) {
  const { tr } = useRetailCopy();
  const qc = useQueryClient();
  const key = ['sale-window', id];
  const { data: cart, isLoading, isError } = useQuery({ queryKey: key, queryFn: async () => (await getCart(id)).data as unknown as Cart });

  if (isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (isError || !cart) return <Typography sx={{ p: 3 }}>{tr('couldNotLoad')}</Typography>;
  const receipt = cart.receipt?.receipt_number;
  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack spacing={0.5}>
        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          {receipt ? <CopyId value={receipt} label={tr('receipt')} copied={tr('copied')} /> : (
            <Typography sx={{ fontFamily: 'monospace', fontWeight: 900 }}>#{cart.id}</Typography>
          )}
          {cart.status === 'voided' && <Chip size="small" label={tr('voided')} color="error" sx={{ fontWeight: 700 }} />}
        </Stack>
        <Stat label={tr('total')} value={money(cart.total)} />
      </Stack>
      <SaleDetail
        cart={cart}
        onUpdated={(c) => qc.setQueryData(key, c)}
        onVoided={() => {
          void qc.invalidateQueries({ queryKey: key });
          void qc.invalidateQueries({ queryKey: ['register-card'] });
        }}
      />
    </Stack>
  );
}
