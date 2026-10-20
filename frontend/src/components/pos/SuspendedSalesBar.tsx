import { useState, type MouseEvent } from 'react';
import { Box, Button, Menu, MenuItem, Typography } from '@mui/material';
import PauseCircleOutline from '@mui/icons-material/PauseCircleOutline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  deleteSuspendedCart,
  getSuspendedCarts,
  resumeCart,
  suspendCart,
} from '../../api/pos.api';
import type { Cart, SuspendedSaleTab } from '../../types/pos.types';

/**
 * Suspend (owner 2026-10-20). The header above the sale: a Suspend button that sets the current sale aside and starts
 * a new one, and one bookmark tab per sale set aside at this register. Click a tab to bring it back (the sale on
 * screen, if it has items, is set aside in its place); right-click a tab to delete it. The server holds the items.
 */

function money(value: string | number | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

export function tabLabel(tab: SuspendedSaleTab): string {
  return tab.member_first_name || 'Sale';
}

export function tabDetail(tab: SuspendedSaleTab): string {
  const items = `${tab.item_count} ${tab.item_count === 1 ? 'item' : 'items'}`;
  const at = tab.suspended_at ? ` · ${format(new Date(tab.suspended_at), 'h:mm a')}` : '';
  return `${items} · ${money(tab.total)}${at}`;
}

function errorText(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
}

export interface SuspendedSalesBarProps {
  /** The register's drawer; no drawer, no bar. */
  drawerId: number | null | undefined;
  /** Narrows the tabs to one cashier (the shared test terminal, where every computer uses one drawer). */
  cashierId?: number | null;
  /** The sale on screen (null before the first scan). */
  cart: Pick<Cart, 'id'> & { lines?: unknown[] } | null;
  /** True while something else is in flight (a cart being made, a sale being paid). */
  disabled?: boolean;
  /** The current sale was set aside: clear the screen, the next scan starts a new sale. */
  onSuspended: () => void;
  /** A set-aside sale is back: show this fresh cart (it came from the server, member data included). */
  onResumed: (cart: Cart) => void;
}

export default function SuspendedSalesBar({
  drawerId,
  cashierId,
  cart,
  disabled = false,
  onSuspended,
  onResumed,
}: SuspendedSalesBarProps) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const queryKey = ['pos', 'suspended', drawerId ?? null, cashierId ?? null];
  const [menu, setMenu] = useState<{ tab: SuspendedSaleTab; x: number; y: number } | null>(null);
  const [confirm, setConfirm] = useState<SuspendedSaleTab | null>(null);

  const { data: tabs = [] } = useQuery({
    queryKey,
    queryFn: async () => (await getSuspendedCarts(drawerId as number, cashierId ?? undefined)).data.results,
    enabled: drawerId != null,
    refetchInterval: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pos', 'suspended'] });
  const hasItems = ((cart?.lines as unknown[] | undefined)?.length ?? 0) > 0;

  const suspendMutation = useMutation({
    mutationFn: async (cartId: number) => (await suspendCart(cartId)).data,
    onSuccess: () => {
      onSuspended();
      enqueueSnackbar('Sale set aside. Its tab is at the top.', { variant: 'info' });
    },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not set the sale aside.'), { variant: 'error' }),
    onSettled: refresh,
  });

  const resumeMutation = useMutation({
    mutationFn: async (tab: SuspendedSaleTab) => (await resumeCart(tab.id, cart?.id ?? null)).data as unknown as Cart,
    onSuccess: (fresh) => onResumed(fresh),
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not bring the sale back.'), { variant: 'error' }),
    onSettled: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: async (tab: SuspendedSaleTab) => (await deleteSuspendedCart(tab.id)).data,
    onSuccess: () => {
      enqueueSnackbar('Set-aside sale deleted. Its items are free again.', { variant: 'info' });
    },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not delete the sale.'), { variant: 'error' }),
    onSettled: () => {
      setConfirm(null);
      refresh();
    },
  });

  if (drawerId == null) return null;

  const busy = disabled || suspendMutation.isPending || resumeMutation.isPending || deleteMutation.isPending;

  const openMenu = (event: MouseEvent, tab: SuspendedSaleTab) => {
    event.preventDefault();
    setMenu({ tab, x: event.clientX, y: event.clientY });
  };

  return (
    <Box
      data-testid="suspended-sales-bar"
      sx={{ display: 'flex', alignItems: 'stretch', gap: 1, mb: 1, flexShrink: 0, overflowX: 'auto', pb: 0.5 }}
    >
      <Button
        variant="outlined"
        startIcon={<PauseCircleOutline />}
        disabled={busy || !cart || !hasItems}
        onClick={() => cart && suspendMutation.mutate(cart.id)}
        sx={{ minHeight: 48, flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        Suspend
      </Button>

      {tabs.map((tab) => (
        <Button
          key={tab.id}
          data-testid={`suspended-tab-${tab.id}`}
          aria-label={`${tabLabel(tab)}, ${tabDetail(tab)}. Click to bring back, right-click to delete.`}
          title="Click to bring this sale back. Right-click to delete it."
          disabled={busy}
          onClick={() => resumeMutation.mutate(tab)}
          onContextMenu={(event) => openMenu(event, tab)}
          sx={{
            flexShrink: 0,
            minHeight: 48,
            minWidth: 150,
            px: 1.5,
            textTransform: 'none',
            textAlign: 'left',
            justifyContent: 'flex-start',
            display: 'block',
            color: 'text.primary',
            bgcolor: 'warning.light',
            border: 1,
            borderColor: 'warning.main',
            borderTopWidth: 4,
            borderRadius: '0 0 10px 10px',
            '&:hover': { bgcolor: 'warning.main', color: 'warning.contrastText' },
          }}
        >
          <Typography variant="subtitle2" component="span" sx={{ display: 'block', fontWeight: 700, lineHeight: 1.2 }}>
            {tabLabel(tab)}
          </Typography>
          <Typography variant="caption" component="span" sx={{ display: 'block', lineHeight: 1.2 }}>
            {tabDetail(tab)}
          </Typography>
        </Button>
      ))}

      <Menu
        open={menu != null}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
      >
        <MenuItem
          onClick={() => {
            setConfirm(menu?.tab ?? null);
            setMenu(null);
          }}
        >
          Delete suspended sale
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={confirm != null}
        title="Delete suspended sale?"
        message={
          confirm
            ? `${tabLabel(confirm)} (${tabDetail(confirm)}) will be deleted. Its items go back on the shelf for the next sale.`
            : ''
        }
        confirmLabel="Delete suspended sale"
        severity="error"
        loading={deleteMutation.isPending}
        onConfirm={() => confirm && deleteMutation.mutate(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </Box>
  );
}
