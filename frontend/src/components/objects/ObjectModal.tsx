/**
 * The standard way to open a product, a check-in, an item or an order anywhere on the site.
 *
 * - `<ObjectLink type="item" id={5} label="ITM0001" />` is the clickable id.
 * - It opens one modal with that object's panel. A link clicked inside the modal swaps the modal's content
 *   (with a Back arrow) instead of stacking a second modal.
 * - A product also has a full page (`/inventory/products/:id`) for the work that needs room.
 * - An order opens wider (the size its old full page was); `/inventory/orders/:id` opens the Orders list with it.
 *
 * Wrap a page in `<ObjectModalProvider>` to use it.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Close from '@mui/icons-material/Close';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { Box, Button, CircularProgress, Dialog, DialogContent, IconButton, Link, Stack, Tooltip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getProduct } from '../../api/inventory.api';
import { ProductManagePanel } from '../../pages/inventory/manage/ProductManageDrawer';
import { ItemCheckInManagePanel } from '../../pages/inventory/workbench/ItemCheckInManagePanel';
import { ItemManagePanel } from '../../pages/inventory/workbench/ItemManagePanel';
import OrderDetailPage from '../../pages/inventory/OrderDetailPage';

export type ObjectRef =
  | { type: 'product'; id: number }
  | { type: 'checkin'; id: number }
  | { type: 'item'; id: number }
  | { type: 'order'; id: number }
  /** A new check-in for a product: "add more of these". */
  | { type: 'new-checkin'; id: number };

const LABEL: Record<ObjectRef['type'], string> = {
  product: 'Product',
  checkin: 'Check-in',
  item: 'Item',
  order: 'Order',
  'new-checkin': 'Add items',
};

type LinkType = 'product' | 'checkin' | 'item' | 'order';

export function parseObjectRef(raw: string | null | undefined): ObjectRef | null {
  const m = (raw || '').match(/^(product|checkin|item|order):(\d+)$/i);
  if (!m) return null;
  return { type: m[1].toLowerCase() as LinkType, id: Number.parseInt(m[2], 10) };
}

export function formatObjectRef(ref: ObjectRef | null): string {
  return ref && ref.type !== 'new-checkin' ? `${ref.type}:${ref.id}` : '';
}

interface ObjectModalContextValue {
  openObject: (ref: ObjectRef) => void;
  /** Open this object alone (no Back to whatever was open before). */
  showObject: (ref: ObjectRef) => void;
  closeObject: () => void;
  current: ObjectRef | null;
}

const ObjectModalContext = createContext<ObjectModalContextValue | null>(null);

export function useObjectModal(): ObjectModalContextValue {
  const ctx = useContext(ObjectModalContext);
  if (!ctx) throw new Error('useObjectModal needs an ObjectModalProvider above it.');
  return ctx;
}

function ProductBody({ id, onDone }: { id: number; onDone: () => void }) {
  const { openObject } = useObjectModal();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['object-modal', 'product', id],
    queryFn: async () => (await getProduct(id)).data,
  });
  if (isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (isError || !data) return <Typography sx={{ p: 3 }}>This product could not be loaded.</Typography>;
  return (
    <ProductManagePanel
      open
      embedded
      initialProduct={data}
      onClose={onDone}
      onStartProductCheckIn={(productId) => openObject({ type: 'new-checkin', id: productId })}
    />
  );
}

export function ObjectModalProvider({
  children,
  onChange,
  initial = null,
}: {
  children: ReactNode;
  /** Told whenever the open object changes (e.g. to keep it in the page URL). */
  onChange?: (ref: ObjectRef | null) => void;
  initial?: ObjectRef | null;
}) {
  const [stack, setStack] = useState<ObjectRef[]>(initial ? [initial] : []);
  const navigate = useNavigate();
  const current = stack.length ? stack[stack.length - 1] : null;

  const set = useCallback(
    (next: ObjectRef[]) => {
      setStack(next);
      onChange?.(next.length ? next[next.length - 1] : null);
    },
    [onChange],
  );
  const openObject = useCallback(
    (ref: ObjectRef) => {
      const top = stack[stack.length - 1];
      if (top && top.type === ref.type && top.id === ref.id) return;
      set([...stack, ref]);
    },
    [set, stack],
  );
  const showObject = useCallback((ref: ObjectRef) => set([ref]), [set]);
  const closeObject = useCallback(() => set([]), [set]);
  const back = useCallback(() => set(stack.slice(0, -1)), [set, stack]);
  const value = useMemo(
    () => ({ openObject, showObject, closeObject, current }),
    [openObject, showObject, closeObject, current],
  );
  const wide = current?.type === 'order';

  return (
    <ObjectModalContext.Provider value={value}>
      {children}
      <Dialog
        open={current !== null}
        onClose={closeObject}
        maxWidth={wide ? false : 'lg'}
        fullWidth
        scroll="paper"
        slotProps={wide ? { paper: { sx: { width: 'min(1400px, calc(100% - 32px))', m: 2 } } } : undefined}
      >
        {current && (
          <>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
              {stack.length > 1 && (
                <Tooltip title="Back">
                  <IconButton size="small" onClick={back} aria-label="Back">
                    <ArrowBack fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
                {LABEL[current.type]}
                {current.type !== 'new-checkin' && current.type !== 'order' && (
                  <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
                    #{current.id}
                  </Typography>
                )}
              </Typography>
              {current.type === 'product' && (
                <Button
                  size="small"
                  startIcon={<OpenInNew fontSize="small" />}
                  onClick={() => {
                    const id = current.id;
                    closeObject();
                    navigate(`/inventory/products/${id}`);
                  }}
                >
                  Open full page
                </Button>
              )}
              <IconButton size="small" onClick={closeObject} aria-label="Close">
                <Close fontSize="small" />
              </IconButton>
            </Stack>
            <DialogContent sx={{ p: 0, minHeight: 320 }}>
              <Box key={`${current.type}:${current.id}`} sx={{ display: 'flex', flexDirection: 'column', minHeight: 320 }}>
                {current.type === 'item' && (
                  <ItemManagePanel
                    itemId={current.id}
                    onFilterItemsByProduct={(productId) => openObject({ type: 'product', id: productId })}
                    onFilterItemsByOrder={(orderId) => openObject({ type: 'order', id: orderId })}
                    onOpenCheckIn={(checkInId) => openObject({ type: 'checkin', id: checkInId })}
                    onOpenItemsForCheckIn={(checkInId) => openObject({ type: 'checkin', id: checkInId })}
                  />
                )}
                {current.type === 'checkin' && (
                  <ItemCheckInManagePanel
                    mode="edit"
                    checkInId={current.id}
                    onNavigate={(sel) => openObject({ type: sel.type, id: sel.id })}
                    onApplyProductSearch={(productId) => openObject({ type: 'product', id: productId })}
                    onOpenProductTab={(productId) => openObject({ type: 'product', id: productId })}
                    onFilterCheckInsByProduct={(productId) => openObject({ type: 'product', id: productId })}
                    onFilterCheckInsByOrder={(orderId) => openObject({ type: 'order', id: orderId })}
                    onCheckInDuplicated={(checkInId) => openObject({ type: 'checkin', id: checkInId })}
                  />
                )}
                {current.type === 'new-checkin' && (
                  <ItemCheckInManagePanel
                    mode="create"
                    productId={current.id}
                    onNavigate={(sel) => openObject({ type: sel.type, id: sel.id })}
                    onCancelCreate={back}
                    onCheckInCreated={(checkInId) => set([...stack.slice(0, -1), { type: 'checkin', id: checkInId }])}
                  />
                )}
                {current.type === 'product' && <ProductBody id={current.id} onDone={closeObject} />}
                {current.type === 'order' && <OrderDetailPage orderId={current.id} embedded />}
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>
    </ObjectModalContext.Provider>
  );
}

/** A clickable id that opens the object's standard modal. */
export function ObjectLink({
  type,
  id,
  label,
  title,
}: {
  type: LinkType;
  id: number;
  label?: ReactNode;
  title?: string;
}) {
  const { openObject } = useObjectModal();
  return (
    <Link
      component="button"
      type="button"
      underline="hover"
      title={title ?? `Open ${LABEL[type].toLowerCase()} ${id}`}
      onClick={(e) => {
        e.stopPropagation();
        openObject({ type, id });
      }}
      sx={{ fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' }}
    >
      {label ?? `#${id}`}
    </Link>
  );
}
