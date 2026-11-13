/**
 * Made-up data for each object's Universal Surface in the Design Lab (navigation/objectCatalog.ts). Nothing here is
 * real: it exists to judge the one surface on every object. A related block names the object it links to; its title
 * and icon come from the catalog.
 */
import type { SurfaceProps, SurfaceLink } from '../../components/surface/UniversalSurface';
import type { ObjectId } from '../../navigation/objectCatalog';

export interface DemoRelated { object: ObjectId; title?: string; total?: number; rows: SurfaceLink[] }
export type SurfaceDemo = Omit<SurfaceProps, 'objectLabel' | 'Icon' | 'related' | 'number'> & { related?: DemoRelated[] };

const on = { tone: 'good' as const, label: 'On the floor' };

export const SURFACE_DEMOS: Record<ObjectId, SurfaceDemo> = {
  product: {
    id: 'PRD-18342', status: { tone: 'good', label: 'Active' }, chips: ['Furniture', 'Dressers'], title: 'Walnut 6-drawer dresser',
    subtitle: 'Mid-century style · 58 x 18 x 32 in', primary: 'Edit', more: ['Merge', 'Google it', 'Print tags'],
    stats: [{ label: 'On hand', value: '3' }, { label: 'Sold', value: '11' }, { label: 'Avg sold', value: '$276' }, { label: 'Days to sell', value: '9', note: 'Faster than its category', tone: 'good' }],
    facts: [
      { title: 'Product', rows: [['Brand', 'Modway'], ['Model', 'MOD-6182-WAL'], ['Retail', '$529.00'], ['Tag at', '$289.00 (55%)'], ['UPC', '889654132281']] },
      { title: 'Search', rows: [['Tags', 'dresser, walnut, mid-century, bedroom'], ['Condition rules', 'Like new: 55%; Good: 45%']] },
    ],
    related: [
      { object: 'item', total: 14, rows: [{ id: 'ITM0204871', label: 'Showroom B, bay 4', meta: '$289 · tagged Nov 6', status: on }, { id: 'ITM0204870', label: 'Back room', meta: '$259 · Good', status: { tone: 'wait', label: 'Restoring' } }, { id: 'ITM0198102', label: 'Sold Nov 2', meta: '$289', status: { tone: 'quiet', label: 'Sold' } }] },
      { object: 'category', rows: [{ id: 'CAT-0412', label: 'Furniture > Bedroom > Dressers' }] },
      { object: 'vendor', rows: [{ id: 'VND-031', label: 'Amazon Liquidation (B-Stock)', meta: '9 of 14 came from here' }] },
    ],
    photos: 4,
    timeline: [{ when: 'Nov 6', label: '3 checked in', detail: 'Truck T-416' }, { when: 'Oct 20', label: 'Tag price set', detail: '$289 (55% of retail)' }, { when: 'Sep 3', label: 'Product made', detail: 'From the T-388 manifest' }],
  },
  item: {
    id: 'ITM0204871', status: on, chips: ['Like new', 'Restored'], title: 'Walnut 6-drawer dresser', subtitle: 'Showroom B, bay 4 · $289.00',
    primary: 'Edit', more: ['Print tag', 'Move', 'Mark damaged'],
    stats: [{ label: 'Price', value: '$289' }, { label: 'Cost', value: '$58', note: '20% of retail' }, { label: 'Days on floor', value: '2', note: 'of 30' }, { label: 'Retail', value: '$529' }],
    facts: [
      { title: 'Overview', rows: [['Condition', 'Like new'], ['Tagged by', 'Dana W.'], ['Tag printed', 'Nov 10'], ['Price rule', '55% of retail']] },
      { title: 'Where it is', rows: [['Location', 'Showroom B, bay 4'], ['Since', 'Nov 12']] },
    ],
    related: [
      { object: 'product', rows: [{ id: 'PRD-18342', label: 'Walnut 6-drawer dresser', meta: '14 items' }] },
      { object: 'location', rows: [{ id: 'B-04', label: 'Showroom B, bay 4', meta: 'Floor space · Furniture' }] },
      { object: 'order', rows: [{ id: 'T-416', label: 'Amazon · Nov 6', meta: '22 pallets', status: { tone: 'good', label: 'Finished' } }] },
      { object: 'restoration', rows: [{ id: 'RST-2210', label: 'New pulls, oiled', meta: 'Bench · Nov 10', status: { tone: 'good', label: 'Done' } }] },
    ],
    photos: 3, notes: [{ who: 'Marcus L.', when: 'Nov 10', text: 'One pull was cracked; replaced all six to match.' }],
    timeline: [{ when: 'Nov 12', label: 'Moved to the floor', detail: 'Showroom B, bay 4' }, { when: 'Nov 10', label: 'Restored', detail: 'New pulls, oiled' }, { when: 'Nov 6', label: 'Tagged at $289' }, { when: 'Nov 6', label: 'Received', detail: 'Truck T-416' }],
  },
  checkin: {
    id: 'CHK-55120', status: { tone: 'good', label: 'Checked in' }, chips: ['Like new'], title: '3 x Walnut 6-drawer dresser', subtitle: 'Truck T-416 · Nov 6 · Dana W.',
    primary: 'Add more of these', more: ['Duplicate', 'Undo check-in', 'Print tags'],
    stats: [{ label: 'Items', value: '3' }, { label: 'Tag price', value: '$289' }, { label: 'Retail each', value: '$529' }],
    facts: [{ title: 'Check-in', rows: [['Product', 'Walnut 6-drawer dresser'], ['Condition', 'Like new'], ['Checked in by', 'Dana W.'], ['Manifest row', 'Row 118 of T-416']] }],
    related: [
      { object: 'item', total: 3, rows: [{ id: 'ITM0204871', label: 'Showroom B, bay 4', status: on }, { id: 'ITM0204870', label: 'Back room', status: { tone: 'wait', label: 'Restoring' } }, { id: 'ITM0204869', label: 'Sold Nov 9', status: { tone: 'quiet', label: 'Sold' } }] },
      { object: 'product', rows: [{ id: 'PRD-18342', label: 'Walnut 6-drawer dresser' }] },
      { object: 'order', rows: [{ id: 'T-416', label: 'Amazon · Nov 6' }] },
    ],
    timeline: [{ when: 'Nov 6, 2:14 pm', label: 'Checked in', detail: '3 items' }],
  },
  category: {
    id: 'CAT-0412', status: { tone: 'good', label: 'Active' }, chips: ['Subcategory'], title: 'Dressers', subtitle: 'Furniture > Bedroom > Dressers',
    primary: 'Edit', more: ['Move', 'Merge into another'],
    stats: [{ label: 'Products', value: '186' }, { label: 'On hand', value: '41' }, { label: 'Sold, 30 days', value: '$8,910' }, { label: 'Days to sell', value: '16' }],
    facts: [{ title: 'Pricing', rows: [['Like new', '55% of retail'], ['Good', '45% of retail'], ['As is', '25% of retail']] }],
    related: [
      { object: 'category', title: 'Above it', rows: [{ id: 'CAT-0400', label: 'Bedroom', meta: 'Category · Furniture' }] },
      { object: 'product', total: 186, rows: [{ id: 'PRD-18342', label: 'Walnut 6-drawer dresser', meta: '3 on hand' }, { id: 'PRD-17710', label: 'White 3-drawer chest', meta: '6 on hand' }] },
      { object: 'location', rows: [{ id: 'B-04', label: 'Showroom B, bay 4' }, { id: 'B-05', label: 'Showroom B, bay 5' }] },
    ],
    timeline: [{ when: 'Oct 2', label: 'Pricing changed', detail: 'Good: 50% to 45%' }],
  },
  location: {
    id: 'B-04-2', status: { tone: 'good', label: 'Counted' }, chips: ['Gondola shelf', 'Furniture'], title: 'Showroom B, bay 4, shelf 2', subtitle: 'On the store map: back wall, left of the fitting rooms',
    primary: 'Count it', more: ['Show on map', 'Print shelf label'],
    stats: [{ label: 'Items', value: '23' }, { label: 'Value', value: '$2,140' }, { label: 'Oldest', value: '41 days', note: 'Past 30: 4 items', tone: 'wait' }, { label: 'Last count', value: 'Nov 5' }],
    attention: { tone: 'wait', text: '4 items have been here more than 30 days.', action: 'See them' },
    facts: [{ title: 'Location', rows: [['Kind', 'Gondola shelf'], ['Department', 'Furniture'], ['Size', '48 x 18 in'], ['Count section', 'Showroom B']] }],
    related: [
      { object: 'item', total: 23, rows: [{ id: 'ITM0204871', label: 'Walnut 6-drawer dresser', meta: '$289 · 2 days', status: on }, { id: 'ITM0187730', label: 'Brass table lamp', meta: '$34 · 41 days', status: { tone: 'wait', label: 'Past 30' } }] },
      { object: 'staff', title: 'Counted by', rows: [{ id: 'EMP-042', label: 'Rosa Jimenez', meta: 'Nov 5' }] },
    ],
    timeline: [{ when: 'Nov 5', label: 'Counted', detail: '23 found, 1 missing' }, { when: 'Oct 28', label: 'Moved on the map' }],
  },
  auction: {
    id: 'AUC-88217', status: { tone: 'info', label: 'Live' }, chips: ['B-Stock', 'Wayfair'], title: 'Furniture, 26 pallets, Shepherdsville KY', subtitle: 'Ends today 3:40 pm · manifested',
    primary: 'Set max bid', more: ['Open on B-Stock', 'Watch'],
    stats: [{ label: 'Retail', value: '$61,200' }, { label: 'Current bid', value: '$9,850' }, { label: 'Max at 20%', value: '$12,240', note: 'Landed, with freight', tone: 'good' }, { label: 'Freight', value: '$1,450' }],
    facts: [{ title: 'Lot', rows: [['Condition', 'Returns, untested'], ['Top category', 'Bedroom (38%)'], ['Pallets', '26'], ['Ships from', 'Shepherdsville, KY']] }],
    related: [
      { object: 'vendor', rows: [{ id: 'VND-012', label: 'Wayfair (B-Stock)', meta: '14 orders · recovered 15%' }] },
      { object: 'order', title: 'Won as', rows: [] },
    ],
    timeline: [{ when: '9:02 am', label: 'Max bid set', detail: '$12,240' }, { when: 'Nov 11', label: 'Listed' }],
  },
  order: {
    id: 'T-418', status: { tone: 'problem', label: 'Short 3' }, chips: ['Wayfair', 'Furniture'], title: 'Wayfair truck, 26 pallets', subtitle: 'Arrived Nov 12 · paid $4,180',
    primary: 'Open truck', more: ['Close the truck', 'Print labels', 'Manifest'],
    stats: [{ label: 'Paid', value: '$4,180', note: '21% of retail' }, { label: 'Retail', value: '$19,900' }, { label: 'Tagged', value: '61%' }, { label: 'Sold', value: '$1,240' }],
    attention: { tone: 'problem', text: 'Three pallets missing from the manifest. File the dispute by Nov 19.', action: 'Close the truck' },
    facts: [{ title: 'Truck', rows: [['Ordered', 'Nov 3'], ['Arrived', 'Nov 12'], ['Pallets', '26 of 29'], ['Freight', '$1,450']] }],
    related: [
      { object: 'vendor', rows: [{ id: 'VND-012', label: 'Wayfair (B-Stock)' }] },
      { object: 'auction', rows: [{ id: 'AUC-87101', label: 'Won Nov 3', meta: '$2,730 bid' }] },
      { object: 'item', total: 212, rows: [{ id: 'ITM0205001', label: 'Upholstered bed frame', meta: '$219', status: on }, { id: 'ITM0205002', label: 'Accent chair', meta: '$89', status: { tone: 'wait', label: 'Processing' } }] },
      { object: 'restoration', total: 6, rows: [{ id: 'RST-2231', label: 'Sofa: torn arm', status: { tone: 'wait', label: 'On the bench' } }] },
    ],
    photos: 8,
    timeline: [{ when: 'Nov 12', label: 'Received', detail: '26 pallets; 3 short' }, { when: 'Nov 3', label: 'Ordered', detail: 'Won on B-Stock' }],
  },
  vendor: {
    id: 'VND-012', status: { tone: 'good', label: 'Active' }, chips: ['Liquidation (B-Stock)'], title: 'Wayfair', subtitle: 'Returns and overstock, mostly furniture',
    primary: 'Edit', more: ['Report card', 'Request manifest'],
    stats: [{ label: 'Spent, 12 mo', value: '$58,400' }, { label: 'Cost of retail', value: '21%' }, { label: 'Recovered', value: '15%', note: 'Adjusted for disputes', tone: 'info' }, { label: 'Days to sell', value: '19' }],
    facts: [{ title: 'Contact', rows: [['Account', 'B-Stock: wayfair-us'], ['Rep', 'Jordan Ames'], ['Email', 'jordan@example.com']] }],
    related: [
      { object: 'order', total: 14, rows: [{ id: 'T-418', label: 'Nov 12 · 26 pallets', meta: '$4,180', status: { tone: 'problem', label: 'Short 3' } }, { id: 'T-415', label: 'Nov 4 · 24 pallets', meta: '$3,960', status: { tone: 'wait', label: 'Processing' } }] },
      { object: 'auction', total: 3, rows: [{ id: 'AUC-88217', label: 'Furniture, 26 pallets', status: { tone: 'info', label: 'Live' } }] },
    ],
    notes: [{ who: 'Bill', when: 'Oct 30', text: 'Furniture loads only; skip their mixed home goods.' }],
    timeline: [{ when: 'Nov 12', label: 'Truck T-418 received' }, { when: 'Nov 3', label: 'Auction won', detail: 'AUC-87101' }],
  },
  restoration: {
    id: 'RST-2231', status: { tone: 'wait', label: 'On the bench' }, chips: ['Upholstery'], title: 'Sofa: torn arm', subtitle: 'From processing, truck T-418 · Marcus L.',
    primary: 'Log work', more: ['Order a part', 'Send back as is'],
    stats: [{ label: 'Value if fixed', value: '$349' }, { label: 'As is', value: '$149' }, { label: 'Parts', value: '$22' }, { label: 'Time', value: '1.5 h' }],
    attention: { tone: 'wait', text: 'Waiting on a part: fabric patch kit, due Nov 15.' },
    facts: [{ title: 'The job', rows: [['Problem', 'Torn right arm, 4 in'], ['Plan', 'Patch and re-stitch'], ['Grade if fixed', 'Good'], ['Bench', 'Bench 2']] }],
    related: [
      { object: 'item', rows: [{ id: 'ITM0205040', label: 'Grey 3-seat sofa', meta: 'Retail $899' }] },
      { object: 'purchaseOrder', rows: [{ id: 'PO-1187', label: 'Fabric patch kit', meta: '$22', status: { tone: 'info', label: 'Ordered' } }] },
      { object: 'staff', title: 'Working on it', rows: [{ id: 'EMP-019', label: 'Marcus Lee' }] },
    ],
    photos: 2,
    timeline: [{ when: 'Nov 13', label: 'Part ordered', detail: 'PO-1187' }, { when: 'Nov 12', label: 'Sent to the bench', detail: 'From processing' }],
  },
  purchaseOrder: {
    id: 'PO-1187', status: { tone: 'info', label: 'Ordered' }, chips: ['Parts'], title: 'Fabric patch kit and thread', subtitle: 'Amazon Business · ordered Nov 13 by Marcus L.',
    primary: 'Mark received', more: ['Cancel', 'Copy order'],
    stats: [{ label: 'Total', value: '$31.40' }, { label: 'Lines', value: '2' }, { label: 'Due', value: 'Nov 15' }],
    facts: [{ title: 'Lines', rows: [['Fabric patch kit, grey', '1 x $22.00'], ['Upholstery thread', '1 x $9.40']] }, { title: 'Paid with', rows: [['Card', 'Store card ending 4471']] }],
    related: [
      { object: 'vendor', rows: [{ id: 'VND-077', label: 'Amazon Business', meta: 'Supplier' }] },
      { object: 'restoration', title: 'For', rows: [{ id: 'RST-2231', label: 'Sofa: torn arm', status: { tone: 'wait', label: 'On the bench' } }] },
    ],
    timeline: [{ when: 'Nov 13', label: 'Ordered', detail: 'Marcus L.' }],
  },
  supply: {
    id: 'SUP-064', status: { tone: 'wait', label: 'Low' }, chips: ['Tags and labels'], title: 'Thermal price tags, 1.5 x 1 in', subtitle: 'Roll of 1,000 · kept in the processing cabinet',
    primary: 'Reorder', more: ['Count', 'Edit'],
    stats: [{ label: 'On hand', value: '4 rolls', note: 'Reorder at 6', tone: 'wait' }, { label: 'Used a week', value: '3 rolls' }, { label: 'Last price', value: '$11.80' }],
    attention: { tone: 'wait', text: 'Below the reorder point: about 9 days left.', action: 'Reorder' },
    facts: [{ title: 'Supply', rows: [['Unit', 'Roll of 1,000'], ['Reorder at', '6 rolls'], ['Order', '12 rolls']] }],
    related: [
      { object: 'vendor', rows: [{ id: 'VND-077', label: 'Amazon Business', meta: 'Supplier' }] },
      { object: 'purchaseOrder', total: 5, rows: [{ id: 'PO-1150', label: '12 rolls · Oct 21', status: { tone: 'good', label: 'Received' } }] },
      { object: 'location', rows: [{ id: 'BR-CAB-1', label: 'Processing cabinet', meta: 'Back-room bin' }] },
    ],
    timeline: [{ when: 'Nov 11', label: 'Counted', detail: '4 rolls' }, { when: 'Oct 23', label: 'Received', detail: '12 rolls' }],
  },
  sale: {
    id: 'R-20261113-0412', status: { tone: 'good', label: 'Paid' }, chips: ['Register 1', 'Thrift+'], title: '$347.20, 4 items', subtitle: 'Nov 13, 2:41 pm · Rosa J.',
    primary: 'Return items', more: ['Reprint receipt', 'Email receipt'],
    stats: [{ label: 'Total', value: '$347.20' }, { label: 'Items', value: '4' }, { label: 'Thrift+ banked', value: '$17.36' }, { label: 'Paid', value: 'Card' }],
    facts: [{ title: 'Payment', rows: [['Subtotal', '$322.00'], ['Tax', '$25.20'], ['Card', 'Visa ending 0193']] }],
    related: [
      { object: 'item', total: 4, rows: [{ id: 'ITM0204869', label: 'Walnut 6-drawer dresser', meta: '$289' }, { id: 'ITM0187730', label: 'Brass table lamp', meta: '$33' }] },
      { object: 'customer', rows: [{ id: 'CUS-10288', label: 'Ana Ruiz', meta: 'Thrift+ member' }] },
      { object: 'register', rows: [{ id: 'REG-1', label: 'Register 1' }] },
    ],
    timeline: [{ when: '2:41 pm', label: 'Paid', detail: 'Card' }],
  },
  register: {
    id: 'REG-1', status: { tone: 'good', label: 'Open' }, chips: ['Front'], title: 'Register 1', subtitle: 'Rosa J. since 9:58 am',
    primary: 'Open register', more: ['Close out', 'Training mode'],
    stats: [{ label: 'Today', value: '$2,418' }, { label: 'Sales', value: '61' }, { label: 'Returns', value: '2' }, { label: 'In drawer', value: '$312' }],
    facts: [{ title: 'Station', rows: [['Printer', 'Online'], ['Card reader', 'Online'], ['Scanner', 'Online']] }],
    related: [
      { object: 'drawer', rows: [{ id: 'DRW-3381', label: 'Opened 9:58 am', meta: '$200 start', status: { tone: 'good', label: 'Open' } }] },
      { object: 'sale', total: 61, rows: [{ id: 'R-20261113-0412', label: '$347.20 · 2:41 pm' }, { id: 'R-20261113-0411', label: '$12.50 · 2:36 pm' }] },
    ],
    timeline: [{ when: '9:58 am', label: 'Opened', detail: 'Rosa J.' }],
  },
  drawer: {
    id: 'DRW-3381', status: { tone: 'good', label: 'Open' }, chips: ['Register 1'], title: 'Drawer, Nov 13', subtitle: 'Opened 9:58 am by Rosa J.',
    primary: 'Count and close', more: ['Cash drop', 'Paid out'],
    stats: [{ label: 'Started', value: '$200' }, { label: 'Cash sales', value: '$412' }, { label: 'Drops', value: '$300' }, { label: 'Expected', value: '$312' }],
    facts: [{ title: 'Count', rows: [['Counted', ''], ['Over / short', '']], empty: 'Not counted yet.' }],
    related: [
      { object: 'register', rows: [{ id: 'REG-1', label: 'Register 1' }] },
      { object: 'staff', title: 'On it', rows: [{ id: 'EMP-042', label: 'Rosa Jimenez' }] },
    ],
    timeline: [{ when: '1:15 pm', label: 'Cash drop', detail: '$300' }, { when: '9:58 am', label: 'Opened', detail: '$200' }],
  },
  customer: {
    id: 'CUS-10288', status: { tone: 'good', label: 'Member' }, chips: ['Thrift+ member', 'Delivery customer'], title: 'Ana Ruiz', subtitle: '(402) 555-0188 · member since Oct 16',
    primary: 'Edit', more: ['Text', 'Start a sale'],
    stats: [{ label: 'Spent', value: '$1,284' }, { label: 'Visits', value: '9' }, { label: 'Banked', value: '$64.20' }, { label: 'Last visit', value: 'Today' }],
    facts: [{ title: 'Contact', rows: [['Phone', '(402) 555-0188'], ['Address', '4410 S 84th St, Omaha'], ['Prefers', 'Texts']] }],
    related: [
      { object: 'sale', total: 9, rows: [{ id: 'R-20261113-0412', label: '$347.20 · today' }, { id: 'R-20261102-0177', label: '$88.00 · Nov 2' }] },
      { object: 'delivery', rows: [{ id: 'DLV-0729', label: 'Dresser · Nov 18', status: { tone: 'good', label: 'Booked' } }] },
    ],
    timeline: [{ when: 'Today', label: 'Bought 4 items', detail: '$347.20' }, { when: 'Oct 16', label: 'Joined Thrift+' }],
  },
  staff: {
    id: 'EMP-042', status: { tone: 'good', label: 'Clocked in' }, chips: ['Employee', 'Retail'], title: 'Rosa Jimenez', subtitle: 'Cashier · since Aug 2025',
    primary: 'Edit', more: ['Schedule', 'Start a check-in'],
    stats: [{ label: 'This week', value: '28.5 h' }, { label: 'Next shift', value: 'Sat 10 am' }, { label: 'Sick hours', value: '14' }, { label: 'Sales today', value: '$2,418' }],
    attention: { tone: 'info', text: 'Time off asked for Nov 26 to 28.', action: 'Decide' },
    facts: [{ title: 'Job', rows: [['Role', 'Cashier'], ['Department', 'Retail'], ['Reports to', 'Bill'], ['Pay', 'Hourly']] }, { title: 'Documents', rows: [['Handbook', 'Signed Aug 4'], ['I-9', 'On file']] }],
    related: [
      { object: 'meeting', rows: [{ id: 'MTG-0311', label: '90-day check-in', meta: 'Nov 20', status: { tone: 'info', label: 'Planned' } }] },
      { object: 'incident', rows: [] },
    ],
    timeline: [{ when: '9:56 am', label: 'Clocked in' }, { when: 'Nov 4', label: '60-day check-in', detail: 'Goals updated' }],
  },
  meeting: {
    id: 'MTG-0311', status: { tone: 'info', label: 'Planned' }, chips: ['Check-in'], title: '90-day check-in: Rosa Jimenez', subtitle: 'Thu Nov 20, 11:00 am · back office · 30 min',
    primary: 'Start', more: ['Move', 'Cancel'],
    facts: [{ title: 'Agenda', rows: [['1', 'How the register is going'], ['2', 'Goals for the next 90 days'], ['3', 'Questions']] }],
    related: [{ object: 'staff', title: 'Who', rows: [{ id: 'EMP-042', label: 'Rosa Jimenez' }, { id: 'EMP-001', label: 'Bill' }] }],
    notes: [],
    timeline: [{ when: 'Nov 4', label: 'Planned', detail: 'From the 60-day check-in' }],
  },
  incident: {
    id: 'INC-0097', status: { tone: 'wait', label: 'Open' }, chips: ['Damage'], title: 'Mirror broke on the floor', subtitle: 'Nov 12, 4:20 pm · Showroom B · reported by Rosa J.',
    primary: 'Close it', more: ['Ask AI to review', 'Add a person'],
    attention: { tone: 'wait', text: 'Needs a manager to review before it closes.' },
    facts: [{ title: 'What happened', rows: [['Where', 'Showroom B, bay 4'], ['Injury', 'None'], ['Loss', '$79 (the mirror)']] }],
    related: [
      { object: 'staff', title: 'People', rows: [{ id: 'EMP-042', label: 'Rosa Jimenez', meta: 'Reported it' }] },
      { object: 'item', rows: [{ id: 'ITM0201220', label: 'Round wall mirror', meta: '$79', status: { tone: 'problem', label: 'Damaged' } }] },
      { object: 'location', rows: [{ id: 'B-04', label: 'Showroom B, bay 4' }] },
    ],
    photos: 2, notes: [{ who: 'Rosa J.', when: 'Nov 12', text: 'A customer bumped it with a cart. Swept and taped off.' }],
    timeline: [{ when: 'Nov 12, 4:31 pm', label: 'Reported' }],
  },
  delivery: {
    id: 'DLV-0729', status: { tone: 'good', label: 'Booked' }, chips: ['Delivery'], title: 'Dresser to Ana Ruiz', subtitle: 'Tue Nov 18, 9:00 to 11:00 am · 4410 S 84th St',
    primary: 'Start the run', more: ['Text the customer', 'Move'],
    stats: [{ label: 'Fee', value: '$49' }, { label: 'Items', value: '1' }, { label: 'Crew', value: '2' }],
    facts: [{ title: 'Stop', rows: [['Address', '4410 S 84th St, Omaha'], ['Window', '9:00 to 11:00 am'], ['Stairs', 'None'], ['Phone', '(402) 555-0188']] }],
    related: [
      { object: 'customer', rows: [{ id: 'CUS-10288', label: 'Ana Ruiz', meta: 'Thrift+ member' }] },
      { object: 'item', rows: [{ id: 'ITM0204869', label: 'Walnut 6-drawer dresser', meta: 'Sold Nov 13' }] },
      { object: 'staff', title: 'Crew', rows: [{ id: 'EMP-033', label: 'Jim Price' }, { id: 'EMP-051', label: 'Ana Reyes' }] },
    ],
    timeline: [{ when: 'Nov 13', label: 'Booked', detail: 'At the register' }],
  },
};
