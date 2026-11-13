/**
 * The object catalog (OOUX; Dash Update #134, Bill 2026-11-13): every thing Dash keeps, the kinds it comes in, and the
 * other things it is tied to. Each object opens in one Universal Surface (components/surface/UniversalSurface.tsx),
 * the same window for every user wherever it is clicked. The Design Lab's Surfaces tab shows each one on made-up data
 * (/admin/design-lab?view=surfaces&object=item), with its checklist (the owner ticks: on the standard, design, done;
 * saved with the page ticks under the id `surface-<object>`).
 *
 * Calendar is not an object: it is a page type. Each thing on a calendar (a delivery, a meeting) opens its own surface.
 */
import type { EcoIconName } from '../icons/ecoIcons';

export type ObjectId =
  | 'product' | 'item' | 'checkin' | 'category' | 'location'
  | 'auction' | 'order' | 'vendor'
  | 'restoration' | 'purchaseOrder' | 'supply'
  | 'sale' | 'register' | 'drawer' | 'customer'
  | 'staff' | 'meeting' | 'incident' | 'delivery';

export type ObjectGroup = 'Inventory' | 'Buying' | 'Restoration and supplies' | 'Retail' | 'People and operations';

export interface ObjectInfo {
  id: ObjectId;
  label: string;
  plural: string;
  group: ObjectGroup;
  icon: EcoIconName;
  /** What it is, in one line. */
  what: string;
  /** The kinds it comes in (one surface; a chip says which). */
  kinds?: string[];
  /** How its ID reads. */
  idFormat: string;
  /** The objects it links to, in the order its Related blocks show them. */
  related: ObjectId[];
  /** Its window today (components/objects, components/pos/windows, components/staff, pages/hr/incidents), if it has one. */
  window?: string;
}

export const OBJECT_GROUPS: ObjectGroup[] = ['Inventory', 'Buying', 'Restoration and supplies', 'Retail', 'People and operations'];

export const OBJECTS: ObjectInfo[] = [
  // Inventory
  { id: 'product', label: 'Product', plural: 'Products', group: 'Inventory', icon: 'productReview', what: 'One kind of thing we sell (a model, a title); many items can be the same product.', idFormat: 'PRD-18342', related: ['item', 'checkin', 'category', 'vendor', 'order'], window: 'ProductCard.tsx' },
  { id: 'item', label: 'Item', plural: 'Items', group: 'Inventory', icon: 'processing', what: 'One physical thing with its own tag and price.', idFormat: 'ITM0204871', related: ['product', 'location', 'order', 'checkin', 'restoration', 'sale'], window: 'ItemCard.tsx' },
  { id: 'checkin', label: 'Check-in', plural: 'Check-ins', group: 'Inventory', icon: 'inbound', what: 'A batch of items of one product checked in together from one order.', idFormat: 'CHK-55120', related: ['product', 'order', 'item', 'staff'], window: 'ItemCheckInManagePanel' },
  { id: 'category', label: 'Category', plural: 'Categories', group: 'Inventory', icon: 'departments', what: 'Where a product belongs: a department, a category, a subcategory.', kinds: ['Department', 'Category', 'Subcategory'], idFormat: 'CAT-0412', related: ['category', 'product', 'item', 'location'] },
  { id: 'location', label: 'Location', plural: 'Locations', group: 'Inventory', icon: 'floorplan', what: 'A place an item is in: a gondola shelf, a showcase, a rack, a floor space, a back-room bin. It sits on the store map.', kinds: ['Gondola shelf', 'Showcase', 'Rack', 'Floor space', 'Back-room bin'], idFormat: 'B-04-2', related: ['item', 'category', 'staff'] },
  // Buying
  { id: 'auction', label: 'Auction', plural: 'Auctions', group: 'Buying', icon: 'auction', what: 'A lot for sale on B-Stock or another marketplace; won, it becomes an order.', idFormat: 'AUC-88217', related: ['vendor', 'order'] },
  { id: 'order', label: 'Order', plural: 'Orders', group: 'Buying', icon: 'purchaseOrder', what: 'A truckload we bought: its manifest, cost, receiving, processing and closing.', idFormat: 'T-418', related: ['vendor', 'auction', 'item', 'checkin', 'restoration'], window: 'OrderCard.tsx' },
  { id: 'vendor', label: 'Vendor', plural: 'Vendors', group: 'Buying', icon: 'vendor', what: 'Anyone we buy from or pay: a liquidation marketplace, a supplier, a professional service.', kinds: ['Liquidation (B-Stock)', 'Supplier', 'Professional service'], idFormat: 'VND-031', related: ['order', 'auction', 'purchaseOrder', 'product'], window: 'VendorCard.tsx' },
  // Restoration and supplies
  { id: 'restoration', label: 'Restoration order', plural: 'Restoration orders', group: 'Restoration and supplies', icon: 'restoration', what: 'An item sent from processing to the bench to be fixed, cleaned or tested.', idFormat: 'RST-2210', related: ['item', 'order', 'purchaseOrder', 'staff'], window: 'RestorationCard.tsx' },
  { id: 'purchaseOrder', label: 'Purchase order', plural: 'Purchase orders', group: 'Restoration and supplies', icon: 'parts', what: 'What we order that is not for resale: store supplies, restoration parts, services.', kinds: ['Supplies', 'Parts', 'Service'], idFormat: 'PO-1187', related: ['vendor', 'supply', 'restoration', 'staff'] },
  { id: 'supply', label: 'Supply', plural: 'Supplies', group: 'Restoration and supplies', icon: 'inventories', what: 'Something the store uses up: tags, bags, cleaner, tape. Counted and reordered.', idFormat: 'SUP-064', related: ['vendor', 'purchaseOrder', 'location'] },
  // Retail
  { id: 'sale', label: 'Sale', plural: 'Sales', group: 'Retail', icon: 'receipt', what: 'One checkout at a register: its items, payments, any return.', idFormat: 'R-20261113-0412', related: ['item', 'customer', 'staff', 'register', 'drawer'], window: 'SaleWindow.tsx' },
  { id: 'register', label: 'Register', plural: 'Registers', group: 'Retail', icon: 'register', what: 'A checkout station: its drawer, today\'s sales, who is on it.', idFormat: 'REG-1', related: ['drawer', 'sale', 'staff'], window: 'RegisterWindow.tsx' },
  { id: 'drawer', label: 'Drawer', plural: 'Drawers', group: 'Retail', icon: 'cashDrawer', what: 'One cash drawer session: opened, counted, closed.', idFormat: 'DRW-3381', related: ['register', 'sale', 'staff'], window: 'DrawerWindow.tsx' },
  { id: 'customer', label: 'Customer', plural: 'Customers', group: 'Retail', icon: 'hold', what: 'A shopper we know: Thrift+ member, delivery or hold customer, consignor.', kinds: ['Thrift+ member', 'Delivery customer', 'Consignor'], idFormat: 'CUS-10288', related: ['sale', 'delivery', 'item', 'incident'], window: 'MemberWindow.tsx' },
  // People and operations
  { id: 'staff', label: 'Staff member', plural: 'Staff', group: 'People and operations', icon: 'staff', what: 'Someone who works here: their role, schedule, hours, check-ins and documents.', kinds: ['Employee', 'Manager', 'Contractor'], idFormat: 'EMP-042', related: ['meeting', 'incident', 'sale', 'restoration'], window: 'StaffWindow.tsx' },
  { id: 'meeting', label: 'Meeting', plural: 'Meetings', group: 'People and operations', icon: 'interview', what: 'A planned conversation: an interview, a 30/60/90 check-in, a huddle, a 1-on-1.', kinds: ['Interview', 'Check-in', 'Huddle', '1-on-1'], idFormat: 'MTG-0311', related: ['staff', 'incident'] },
  { id: 'incident', label: 'Incident', plural: 'Incidents', group: 'People and operations', icon: 'requests', what: 'Something that went wrong and was reported: an injury, a theft, damage, a complaint.', kinds: ['Injury', 'Theft', 'Damage', 'Complaint'], idFormat: 'INC-0097', related: ['staff', 'customer', 'location', 'item'], window: 'IncidentDetailDialog.tsx' },
  { id: 'delivery', label: 'Delivery', plural: 'Deliveries', group: 'People and operations', icon: 'delivery', what: 'Furniture going to a customer, or a pickup coming in: the run, the stop, the window.', kinds: ['Delivery', 'Pickup'], idFormat: 'DLV-0729', related: ['customer', 'sale', 'item', 'staff'] },
];

export function objectInfo(id: ObjectId): ObjectInfo {
  return OBJECTS.find((o) => o.id === id)!;
}

/** The id the checklist ticks are saved under (shared with the page registry's ticks). */
export function surfaceCheckId(id: ObjectId): string {
  return `surface-${id}`;
}
