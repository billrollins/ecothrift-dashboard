/** English / Spanish for the retail windows (Register, Transactions, Sale). Few words. */
import { format } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { useLanguage } from '../../../i18n/useLanguage';

export type Lang = 'en' | 'es';

export const COPY = {
  register: { en: 'Register', es: 'Caja' },
  sale: { en: 'Sale', es: 'Venta' },
  transactions: { en: 'Transactions', es: 'Ventas' },
  open: { en: 'Open', es: 'Abierta' },
  closedToday: { en: 'Closed today', es: 'Cerrada hoy' },
  notOpened: { en: 'Not opened today', es: 'Sin abrir hoy' },
  off: { en: 'Off', es: 'Apagada' },
  practice: { en: 'Practice', es: 'Práctica' },
  practiceNote: { en: 'Practice register: nothing here is real money.', es: 'Caja de práctica: nada aquí es dinero real.' },
  todaySales: { en: 'Today', es: 'Hoy' },
  sales: { en: 'Sales', es: 'Ventas' },
  average: { en: 'Average', es: 'Promedio' },
  now: { en: 'Now', es: 'Ahora' },
  drawer: { en: 'Drawer', es: 'Cajón' },
  cashier: { en: 'Cashier', es: 'Cajero' },
  coveredBy: { en: 'Covered by', es: 'Cubierta por' },
  openedBy: { en: 'Opened', es: 'Abierta' },
  closedBy: { en: 'Closed', es: 'Cerrada' },
  startedWith: { en: 'Started with', es: 'Empezó con' },
  countOff: { en: 'Count off by', es: 'Diferencia' },
  lastDrawer: { en: 'Last drawer', es: 'Último cajón' },
  location: { en: 'Location', es: 'Lugar' },
  code: { en: 'Copy code', es: 'Copiar código' },
  copied: { en: 'Copied', es: 'Copiado' },
  todaysMoney: { en: "Today's money", es: 'Dinero de hoy' },
  total: { en: 'Total', es: 'Total' },
  voided: { en: 'Voided', es: 'Anuladas' },
  thriftSales: { en: 'Thrift+ sales', es: 'Ventas Thrift+' },
  practiceSales: { en: 'Practice sales', es: 'Ventas de práctica' },
  lastSaleAt: { en: 'Last sale', es: 'Última venta' },
  lastSales: { en: 'Last sales', es: 'Últimas ventas' },
  noSales: { en: 'No sales yet.', es: 'Sin ventas todavía.' },
  allToday: { en: 'All today', es: 'Todas de hoy' },
  thisWeekBtn: { en: 'This week', es: 'Esta semana' },
  today: { en: 'Today', es: 'Hoy' },
  nothingToday: { en: 'Nothing yet today.', es: 'Nada todavía hoy.' },
  links: { en: 'Links', es: 'Enlaces' },
  drawersPage: { en: 'Drawers', es: 'Cajones' },
  cashPage: { en: 'Cash', es: 'Efectivo' },
  transactionsPage: { en: 'Transactions page', es: 'Página de ventas' },
  edit: { en: 'Edit', es: 'Editar' },
  couldNotLoad: { en: 'This could not be loaded.', es: 'No se pudo cargar.' },
  yesterday: { en: 'Yesterday', es: 'Ayer' },
  thisMonth: { en: 'This month', es: 'Este mes' },
  all: { en: 'All', es: 'Todo' },
  prevDay: { en: 'Day before', es: 'Día anterior' },
  nextDay: { en: 'Next day', es: 'Día siguiente' },
  showMore: { en: 'Show more', es: 'Ver más' },
  time: { en: 'When', es: 'Cuándo' },
  receipt: { en: 'Receipt', es: 'Recibo' },
  how: { en: 'Paid', es: 'Pago' },
  member: { en: 'Member', es: 'Miembro' },
  // Today's journey at a register.
  ev_opened: { en: 'Drawer opened', es: 'Cajón abierto' },
  ev_closed: { en: 'Drawer closed', es: 'Cajón cerrado' },
  ev_handoff: { en: 'Drawer handed over', es: 'Cajón entregado' },
  ev_cover: { en: 'Covering', es: 'Cubriendo' },
  ev_cover_end: { en: 'Cover ended', es: 'Fin de cubrir' },
  ev_drop: { en: 'Cash drop', es: 'Retiro de efectivo' },
  ev_paid_in: { en: 'Paid in', es: 'Entrada de efectivo' },
  ev_paid_out: { en: 'Paid out', es: 'Salida de efectivo' },
  ev_open_drawer: { en: 'Drawer opened, no sale', es: 'Cajón abierto sin venta' },
  ev_reprint: { en: 'Receipt reprinted', es: 'Recibo reimpreso' },
  ev_print_failed: { en: 'Receipt did not print', es: 'El recibo no se imprimió' },
  ev_tax_exempt: { en: 'Marked tax exempt', es: 'Marcada sin impuesto' },
  ev_tax_exempt_off: { en: 'Tax exempt taken off', es: 'Se quitó sin impuesto' },
  ev_spot_check: { en: 'Spot check', es: 'Revisión rápida' },
  from: { en: 'from', es: 'de' },
  // The Drawer window.
  cashNow: { en: 'Cash now', es: 'Efectivo ahora' },
  cashAtClose: { en: 'Cash at close', es: 'Efectivo al cerrar' },
  counts: { en: 'Counts', es: 'Conteos' },
  count_opening: { en: 'Opening count', es: 'Conteo de apertura' },
  count_handoff: { en: 'Handover count', es: 'Conteo de entrega' },
  count_close: { en: 'Closing count', es: 'Conteo de cierre' },
  counted: { en: 'Counted', es: 'Contado' },
  expected: { en: 'Expected', es: 'Esperado' },
  offBy: { en: 'Off', es: 'Diferencia' },
  bills: { en: 'bills', es: 'billetes' },
  blindNote: { en: 'Cash now and expected show when the drawer closes.', es: 'El efectivo actual y lo esperado se ven al cerrar la caja.' },
  drawerSales: { en: "This drawer's sales", es: 'Ventas de este cajón' },
  registerBtn: { en: 'Register', es: 'Caja' },
  closeOut: { en: 'Close-out', es: 'Cierre' },
  managerOnly: { en: 'Only a manager sees a past drawer.', es: 'Solo un gerente ve un cajón pasado.' },
  // The Thrift+ Member window (Dash Updates #16).
  memberNo: { en: 'Copy member number', es: 'Copiar número de miembro' },
  sd_member: { en: 'Member', es: 'Miembro' },
  sd_pending: { en: 'Needs ID check', es: 'Falta revisar ID' },
  sd_off: { en: 'Off', es: 'Inactivo' },
  secondAdult: { en: 'Second adult', es: 'Segundo adulto' },
  practiceMember: { en: 'Practice member', es: 'Miembro de práctica' },
  bucks: { en: 'ThriftBucks', es: 'ThriftBucks' },
  useBy: { en: 'use by', es: 'usar antes del' },
  creditStat: { en: 'Credit', es: 'Crédito' },
  trips: { en: 'Trips', es: 'Visitas' },
  collectedUsed: { en: 'Collected {c} · used {u}', es: 'Ganados {c} · usados {u}' },
  noTrips: { en: 'No trips yet.', es: 'Sin visitas todavía.' },
  onMembership: { en: 'On this membership', es: 'En esta membresía' },
  joined: { en: 'Joined', es: 'Se unió' },
  memberEdit: { en: 'Open the card', es: 'Abrir la tarjeta' },
  seeAll: { en: 'See all', es: 'Ver todas' },
  itemsWord: { en: 'items', es: 'artículos' },
  nothingYet: { en: 'Nothing recorded yet.', es: 'Nada registrado todavía.' },
  backToWindow: { en: 'Back', es: 'Volver' },
  ev_joined_online: { en: 'Joined online', es: 'Se unió en línea' },
  ev_joined_website: { en: 'Joined on the website', es: 'Se unió en el sitio web' },
  ev_signup: { en: 'Joined at the store', es: 'Se unió en la tienda' },
  ev_finished_joining: { en: 'ID checked, joining finished', es: 'ID revisada, membresía completa' },
  ev_staff_membership: { en: 'Staff membership', es: 'Membresía de personal' },
  ev_second_added: { en: 'Second adult added', es: 'Segundo adulto agregado' },
  ev_phone_added: { en: 'Phone added', es: 'Teléfono agregado' },
  ev_return: { en: 'Return', es: 'Devolución' },
  ev_return_late_ok: { en: 'Late return allowed', es: 'Devolución tardía permitida' },
  ev_deactivated: { en: 'Membership turned off', es: 'Membresía desactivada' },
  // The Transaction window (Dash Updates #15).
  st_completed: { en: 'Completed', es: 'Completada' },
  st_voided: { en: 'Voided', es: 'Anulada' },
  st_training: { en: 'Practice', es: 'Práctica' },
  st_open: { en: 'Open', es: 'Abierta' },
  st_suspended: { en: 'Set aside', es: 'Apartada' },
  returnedChip: { en: 'Returned', es: 'Devuelta' },
  items: { en: 'Items', es: 'Artículos' },
  saved: { en: 'Saved', es: 'Ahorro' },
  saleSection: { en: 'Sale', es: 'Venta' },
  returnsSection: { en: 'Returns', es: 'Devoluciones' },
  credit: { en: 'credit', es: 'crédito' },
  bucksTaken: { en: 'ThriftBucks taken back', es: 'ThriftBucks devueltos' },
  waiting: { en: 'Waiting for staff', es: 'Esperando al personal' },
  handled: { en: 'Handled', es: 'Atendida' },
  historySection: { en: 'History', es: 'Historial' },
  memberLink: { en: 'Thrift+ member', es: 'Miembro Thrift+' },
  ev_sale_opened: { en: 'Sale started', es: 'Venta iniciada' },
  ev_completed: { en: 'Paid', es: 'Pagada' },
  ev_card_fixed: { en: 'Card type fixed', es: 'Tipo de tarjeta corregido' },
  ev_returned: { en: 'Returned', es: 'Devuelto' },
  ev_voided: { en: 'Voided', es: 'Anulada' },
  // The sale detail (Transactions page and the Sale window).
  subtotal: { en: 'Subtotal', es: 'Subtotal' },
  tax: { en: 'Tax', es: 'Impuesto' },
  payment: { en: 'Payment', es: 'Pago' },
  noTax: { en: 'No tax', es: 'Sin impuesto' },
  coveringFor: { en: 'covering for', es: 'cubriendo a' },
  voidedBy: { en: 'Voided by', es: 'Anulada por' },
  reprint: { en: 'Reprint receipt', es: 'Reimprimir recibo' },
  voidSale: { en: 'Void transaction', es: 'Anular venta' },
  voidTitle: { en: 'Void Transaction', es: 'Anular venta' },
  voidMessage: {
    en: "Void this transaction? A paid sale's items go back on the shelf and its cash comes out of the drawer. A manager's PIN and a reason come next. This cannot be undone.",
    es: '¿Anular esta venta? Los artículos vuelven al piso y el efectivo sale del cajón. Después se pide el PIN de un gerente y un motivo. No se puede deshacer.',
  },
  voidDone: { en: 'Transaction voided', es: 'Venta anulada' },
  voidConfirm: { en: 'Void', es: 'Anular' },
} satisfies Record<string, Record<Lang, string>>;

export type CopyKey = keyof typeof COPY;

const PAID: Record<string, Record<Lang, string>> = {
  cash: { en: 'Cash', es: 'Efectivo' },
  card: { en: 'Card', es: 'Tarjeta' },
  split: { en: 'Split', es: 'Dividido' },
  payroll: { en: 'Payroll', es: 'Nómina' },
  thrift: { en: 'Thrift+', es: 'Thrift+' },
};

export { useLanguage };

export function useRetailCopy() {
  const lang = useLanguage();
  const tr = (key: CopyKey) => COPY[key][lang];
  /** How a sale was paid, in words; an unknown code shows as is. */
  const paid = (code: string) => PAID[code]?.[lang] ?? code;
  const when = (iso: string | null | undefined, pattern = 'EEE MMM d, h:mm a') =>
    iso ? format(new Date(iso), pattern, lang === 'es' ? { locale: esLocale } : undefined) : '';
  return { lang, tr, paid, when };
}

export function money(v: string | number | null | undefined): string {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '0'));
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
}
