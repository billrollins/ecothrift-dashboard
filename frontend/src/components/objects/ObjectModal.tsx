/**
 * The standard way to open a product, a check-in, an item or an order anywhere on the site.
 *
 * - `<ObjectLink type="item" id={5} label="ITM0001" />` is the clickable id.
 * - It opens one modal with that object's panel. A link clicked inside the modal swaps the modal's content
 *   (with a Back arrow) instead of stacking a second modal.
 * - A product opens the Product window (`ProductCard.tsx`, Dash Updates #11): read-only, Edit for the editor; it also
 *   has a full page (`/inventory/products/:id`) for the work that needs room.
 * - An order opens the Order window (`OrderCard.tsx`, Dash Updates #12), wide; Edit shows the order page it showed
 *   before; `/inventory/orders/:id` opens the Orders list with it.
 * - A truck plan (`TruckPlanCard.tsx`, Dash Updates #81) is the plan for one order's truck; its id is the order's.
 *
 * - An item opens the universal Item modal (`ItemCard.tsx`): read-only, every department's view, Edit for the editor.
 * - On a phone the modal is full screen.
 * - Retail windows (Retail 2, 2026-11-02): a register, a drawer, a sale, and a Transactions list (`type: 'history'`, its id is
 *   the scope as one string: `historyKey()` in `components/pos/windows/historyScope.ts`).
 *
 * MainLayout puts one `<ObjectModalProvider>` around every staff page; a page wraps its own to keep the open
 * object in its URL.
 */
import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  Box, Button, CircularProgress, Dialog, DialogContent, IconButton, Link, Stack, Tooltip, Typography, useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getProduct } from '../../api/inventory.api';
import { IconBack as ArrowBack, IconClose as Close, IconOpenExternal as OpenInNew } from '../../icons/ecoIcons';
import { ItemCardBody } from './ItemCard';
import { OrderCardBody } from './OrderCard';
import { TruckPlanCardBody } from './TruckPlanCard';
import { CloseTruckCardBody } from './CloseTruckCard';
import { ProductCardBody } from './ProductCard';
import { RestorationCardBody } from './RestorationCard';
import { VendorCardBody } from './VendorCard';
import { ItemPeek } from './ItemPeek';
import { useLanguage } from '../pos/windows/retailCopy';

// The panels load when first opened, so a provider can sit on every page (MainLayout) at no cost.
const ProductManagePanel = lazy(() =>
  import('../../pages/inventory/manage/ProductManageDrawer').then((m) => ({ default: m.ProductManagePanel })));
const ItemCheckInManagePanel = lazy(() =>
  import('../../pages/inventory/workbench/ItemCheckInManagePanel').then((m) => ({ default: m.ItemCheckInManagePanel })));
const ItemManagePanel = lazy(() =>
  import('../../pages/inventory/workbench/ItemManagePanel').then((m) => ({ default: m.ItemManagePanel })));
const OrderDetailPage = lazy(() => import('../../pages/inventory/OrderDetailPage'));
const RegisterWindow = lazy(() =>
  import('../pos/windows/RegisterWindow').then((m) => ({ default: m.RegisterWindow })));
const DrawerWindow = lazy(() =>
  import('../pos/windows/DrawerWindow').then((m) => ({ default: m.DrawerWindow })));
const MemberWindow = lazy(() => import('../pos/windows/MemberWindow').then((m) => ({ default: m.MemberWindow })));
const SaleWindow = lazy(() => import('../pos/windows/SaleWindow').then((m) => ({ default: m.SaleWindow })));
const TransactionsWindow = lazy(() =>
  import('../pos/windows/TransactionsWindow').then((m) => ({ default: m.TransactionsWindow })));

export type ObjectRef =
  | { type: 'product'; id: number }
  | { type: 'checkin'; id: number }
  | { type: 'item'; id: number }
  | { type: 'order'; id: number }
  | { type: 'vendor'; id: number }
  | { type: 'restoration'; id: number }
  | { type: 'register'; id: number }
  | { type: 'drawer'; id: number }
  | { type: 'sale'; id: number }
  /** A Thrift+ member: the id is the person's. */
  | { type: 'member'; id: number }
  /** A Transactions list; the id is its scope (`historyKey`). */
  | { type: 'history'; id: string }
  /** A new check-in for a product: "add more of these". */
  | { type: 'new-checkin'; id: number }
  /** A truck's plan (Dash Update #81); the id is the order's. */
  | { type: 'truck-plan'; id: number }
  /** Close the truck (Dash Update #88); the id is the order's. */
  | { type: 'close-truck'; id: number };

const LABEL: Record<ObjectRef['type'], string> = {
  product: 'Product',
  checkin: 'Check-in',
  item: 'Item',
  order: 'Order',
  vendor: 'Vendor',
  restoration: 'Restoration job',
  'new-checkin': 'Add items',
  register: 'Register',
  drawer: 'Drawer',
  sale: 'Sale',
  member: 'Thrift+ member',
  history: 'Transactions',
  'truck-plan': 'Truck Plan',
  'close-truck': 'Close the truck',
};
/** The retail windows' header word in Spanish (their staff read them in either language). */
const LABEL_ES: Partial<Record<ObjectRef['type'], string>> = { register: 'Caja', drawer: 'Cajón', sale: 'Venta', history: 'Ventas', member: 'Miembro Thrift+' };

type LinkType = 'product' | 'checkin' | 'item' | 'order' | 'vendor' | 'restoration' | 'register' | 'drawer' | 'sale' | 'member';

export function parseObjectRef(raw: string | null | undefined): ObjectRef | null {
  const m = (raw || '').match(/^(product|checkin|item|order|vendor|restoration|register|drawer|sale|member):(\d+)$/i);
  if (!m) return null;
  return { type: m[1].toLowerCase() as LinkType, id: Number.parseInt(m[2], 10) };
}

export function formatObjectRef(ref: ObjectRef | null): string {
  return ref && ref.type !== 'new-checkin' && ref.type !== 'history' && ref.type !== 'truck-plan' && ref.type !== 'close-truck' ? `${ref.type}:${ref.id}` : '';
}

interface ObjectModalContextValue {
  openObject: (ref: ObjectRef) => void;
  /** Open this object alone (no Back to whatever was open before). */
  showObject: (ref: ObjectRef) => void;
  closeObject: () => void;
  current: ObjectRef | null;
}

const ObjectModalContext = createContext<ObjectModalContextValue | null>(null);

/** The modal if a provider is above, else null (for parts that also live outside one). */
export function useOptionalObjectModal(): ObjectModalContextValue | null {
  return useContext(ObjectModalContext);
}

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
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const lang = useLanguage();
  const label = (type: ObjectRef['type']) => (lang === 'es' && LABEL_ES[type]) || LABEL[type];

  return (
    <ObjectModalContext.Provider value={value}>
      {children}
      <Dialog
        open={current !== null}
        onClose={closeObject}
        maxWidth={wide ? false : 'lg'}
        fullWidth
        fullScreen={phone}
        scroll="paper"
        slotProps={wide && !phone ? { paper: { sx: { width: 'min(1400px, calc(100% - 32px))', m: 2 } } } : undefined}
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
                {label(current.type)}
                {current.type !== 'new-checkin' && current.type !== 'order' && current.type !== 'history' && current.type !== 'truck-plan' && current.type !== 'close-truck' && (
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
                <Suspense fallback={<CircularProgress size={28} sx={{ m: 4 }} />}>
                  {current.type === 'item' && (
                    <ItemCardBody
                      itemId={current.id}
                      renderEditor={() => (
                        <ItemManagePanel
                          itemId={current.id}
                          onFilterItemsByProduct={(productId) => openObject({ type: 'product', id: productId })}
                          onFilterItemsByOrder={(orderId) => openObject({ type: 'order', id: orderId })}
                          onOpenCheckIn={(checkInId) => openObject({ type: 'checkin', id: checkInId })}
                          onOpenItemsForCheckIn={(checkInId) => openObject({ type: 'checkin', id: checkInId })}
                        />
                      )}
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
                  {current.type === 'product' && (
                    <ProductCardBody
                      productId={current.id}
                      renderEditor={() => <ProductBody id={current.id} onDone={closeObject} />}
                    />
                  )}
                  {current.type === 'vendor' && <VendorCardBody vendorId={current.id} />}
                  {current.type === 'restoration' && <RestorationCardBody jobId={current.id} />}
                  {current.type === 'order' && (
                    <OrderCardBody orderId={current.id} renderEditor={() => <OrderDetailPage orderId={current.id} embedded />} />
                  )}
                  {current.type === 'truck-plan' && <TruckPlanCardBody orderId={current.id} />}
                  {current.type === 'close-truck' && <CloseTruckCardBody orderId={current.id} />}
                  {current.type === 'register' && <RegisterWindow id={current.id} />}
                  {current.type === 'drawer' && <DrawerWindow id={current.id} />}
                  {current.type === 'sale' && <SaleWindow id={current.id} />}
                  {current.type === 'member' && <MemberWindow personId={current.id} />}
                  {current.type === 'history' && <TransactionsWindow scopeKey={current.id} />}
                </Suspense>
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>
    </ObjectModalContext.Provider>
  );
}

/** A clickable id that opens the object's standard modal (an item's also has the hover card). */
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
  const link = (
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
  // An item link also shows the item hover card.
  return type === 'item' ? <ItemPeek itemId={id} showInfoButton={false}>{link}</ItemPeek> : link;
}
