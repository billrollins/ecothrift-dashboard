/** English / Spanish for the register's payment buttons, cash window and drawer view (2026-11-02, retail cash). */

const STRINGS = {
  cash: { en: 'Cash', es: 'Efectivo' },
  card: { en: 'Card', es: 'Tarjeta' },
  split: { en: 'Split', es: 'Dividido' },
  payroll: { en: 'Payroll (staff)', es: 'Nomina (personal)' },
  splitCashFirst: { en: 'Split: cash first', es: 'Dividido: efectivo primero' },
  due: { en: 'Due', es: 'Total' },
  received: { en: 'Received', es: 'Recibido' },
  more: { en: 'more', es: 'falta' },
  undo: { en: 'Undo', es: 'Deshacer' },
  clear: { en: 'Clear', es: 'Borrar' },
  takeOne: { en: 'Take one off', es: 'Quitar uno' },
  giveBack: { en: 'Give back', es: 'Dar cambio' },
  noChange: { en: 'No change', es: 'Sin cambio' },
  drawerShort: {
    en: 'The drawer may not have these. Give the same amount from what it has.',
    es: 'Puede que la caja no los tenga. Da la misma cantidad con lo que hay.',
  },
  complete: { en: 'Complete', es: 'Terminar' },
  completeAsCash: { en: 'Complete as cash', es: 'Terminar en efectivo' },
  cardFor: { en: 'Card for', es: 'Tarjeta por' },
  typeAmount: { en: 'Type the amount', es: 'Escribir la cantidad' },
  tapBills: { en: 'Tap the bills', es: 'Tocar los billetes' },
  cashHandedOver: { en: 'Cash handed over', es: 'Efectivo recibido' },
  typedNote: { en: 'Dash picks the bills and coins to give back.', es: 'Dash elige los billetes y monedas del cambio.' },
  drawer: { en: 'Drawer', es: 'Caja' },
  drawerPractice: { en: 'Practice drawer', es: 'Caja de practica' },
  drawerTitle: { en: 'In the drawer', es: 'En la caja' },
  drawerUnknown: { en: 'Not counted by bill yet.', es: 'Aun no se conto por billete.' },
  total: { en: 'Total', es: 'Total' },
  close: { en: 'Close', es: 'Cerrar' },
  back: { en: 'Back', es: 'Atras' },
} as const;

export type PosStringKey = keyof typeof STRINGS;

export function tp(key: PosStringKey, language: string | null | undefined): string {
  return STRINGS[key][language === 'es' ? 'es' : 'en'];
}
