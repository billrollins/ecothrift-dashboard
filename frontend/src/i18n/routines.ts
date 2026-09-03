/** English / Spanish for Today, Pay, routine lists, and runner chrome. */

export type AppLanguage = 'en' | 'es';

export const STRINGS: Record<string, { en: string; es: string }> = {
  clockIn: { en: 'Clock in', es: 'Entrar' },
  clockedOut: { en: 'Clocked out', es: 'Fuera de turno' },
  readyToStart: { en: 'Which shift are you working?', es: 'Que turno vas a hacer?' },
  pickShift: { en: 'Pick your shift', es: 'Elige tu turno' },
  onTheClock: { en: 'On the clock', es: 'En turno' },
  onBreak: { en: 'On break', es: 'En descanso' },
  clockedInAt: { en: 'Clocked in at', es: 'Entraste a las' },
  changeShift: { en: 'Change', es: 'Cambiar' },
  takeBreak: { en: 'Take a break', es: 'Tomar un descanso' },
  endBreak: { en: 'End break', es: 'Terminar descanso' },
  clockOut: { en: 'Clock out', es: 'Salir' },
  today: { en: 'Today', es: 'Hoy' },
  dayAtAGlance: { en: 'Your day at a glance', es: 'Tu dia de un vistazo' },
  startWith: { en: 'Start with', es: 'Empieza con' },
  dueToday: { en: 'Due today', es: 'Para hoy' },
  inProgress: { en: 'In progress', es: 'En curso' },
  workCycle: { en: 'Work cycle', es: 'Ciclo de trabajo' },
  nothingDue: { en: 'Nothing waiting.', es: 'Nada pendiente.' },
  nothingInProgress: { en: 'Nothing in progress.', es: 'Nada en curso.' },
  continue: { en: 'Continue', es: 'Continuar' },
  fillIn: { en: 'Fill in', es: 'Llenar' },
  close: { en: 'Close', es: 'Cerrar' },
  english: { en: 'EN', es: 'EN' },
  spanish: { en: 'ES', es: 'ES' },
  verifyPrev: { en: 'Check the last shift', es: 'Revisa el turno anterior' },
  theySaid: { en: 'They said', es: 'Ellos marcaron' },
  yourCall: { en: 'Your call', es: 'Tu revision' },
  pass: { en: 'Pass', es: 'Bien' },
  fail: { en: 'Fail', es: 'Fallo' },
  na: { en: 'N/A', es: 'N/A' },
  justDo: { en: 'Just do these. Do not count them.', es: 'Hazlo y sigue. No se cuenta.' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  saveClose: { en: 'Save & close', es: 'Guardar y cerrar' },
  submit: { en: 'Submit', es: 'Enviar' },
  nextShiftConfirms: { en: 'Next shift confirms', es: 'El siguiente turno lo confirma' },
  spanishLabel: { en: 'Spanish label', es: 'Etiqueta en espanol' },
  spanishHint: { en: 'Spanish hint', es: 'Nota en espanol' },
  spanishTitle: { en: 'Spanish title', es: 'Titulo en espanol' },
  myRoutines: { en: 'My Routines', es: 'Mis rutinas' },
  catalog: { en: 'Catalog', es: 'Catalogo' },
  overdue: { en: 'Overdue', es: 'Atrasadas' },
  onDemand: { en: 'On demand', es: 'A pedido' },
  none: { en: 'None', es: 'Ninguna' },
  blocking: { en: 'Blocking', es: 'Bloqueante' },
  view: { en: 'View', es: 'Ver' },
  review: { en: 'Review', es: 'Revisar' },
  couldNotLoad: { en: 'Could not load routines.', es: 'No se pudieron cargar las rutinas.' },
  noRoutineOpen: { en: 'No routine open', es: 'Ninguna rutina abierta' },
  pickOneLeft: { en: 'Pick one on the left to fill it in.', es: 'Elige una a la izquierda para llenarla.' },
  selectRoutine: { en: 'Select a routine', es: 'Elige una rutina' },
  demo: { en: 'Demo', es: 'Demo' },
  submittedReadOnly: { en: 'Submitted · read only', es: 'Enviado · solo lectura' },
  livePreview: { en: 'Live preview', es: 'Vista previa' },
  home: { en: 'Home', es: 'Inicio' },
  settings: { en: 'Settings', es: 'Ajustes' },
  homeSubtitle: { en: 'Sales, departments, and the week at a glance', es: 'Ventas, departamentos y la semana de un vistazo' },
  paySubtitle: { en: 'This week, your pay periods, and recent shifts', es: 'Esta semana, tus periodos de pago y turnos recientes' },
  approved: { en: 'Approved', es: 'Aprobado' },
  pending: { en: 'Pending', es: 'Pendiente' },
  flagged: { en: 'Flagged', es: 'Marcado' },
  clock: { en: 'Clock', es: 'Reloj' },
  routines: { en: 'Routines', es: 'Rutinas' },
  dashboard: { en: 'Dashboard', es: 'Tablero' },
  pay: { en: 'Pay', es: 'Pago' },
  thisWeek: { en: 'This week', es: 'Esta semana' },
  hoursLeftThisWeek: { en: 'h left this week', es: 'h restantes esta semana' },
  approachingLimit: { en: 'Approaching weekly limit', es: 'Cerca del limite semanal' },
  limitReached: { en: 'Weekly limit reached · clock out, then request a time change in Pay', es: 'Limite semanal alcanzado · sal y pide un cambio de horas en Pago' },
  overtimeNotAllowed: { en: 'Overtime is not allowed', es: 'No se permiten horas extra' },
  endBreakFirst: { en: 'End your break before clocking out.', es: 'Termina tu descanso antes de salir.' },
  longShift: { en: 'This shift looks longer than a work day. Clock out, then request a time change in Pay.', es: 'Este turno parece mas largo que un dia. Sal y pide un cambio de horas en Pago.' },
  breakSince: { en: 'break since', es: 'en descanso desde' },
  goodMorning: { en: 'Good morning', es: 'Buenos dias' },
  goodAfternoon: { en: 'Good afternoon', es: 'Buenas tardes' },
  goodEvening: { en: 'Good evening', es: 'Buenas noches' },
  due: { en: 'due', es: 'para hoy' },
  inProgressLower: { en: 'in progress', es: 'en curso' },
  pickShiftToSeeDay: { en: 'Pick your shift to see your day.', es: 'Elige tu turno para ver tu dia.' },
  glanceExplainer: { en: 'Once you are on the clock this side fills with what to start, what is due, and anything you left half done.', es: 'Cuando entres en turno, aqui veras con que empezar, que toca hoy y lo que dejaste a medias.' },
  pickFromDueToday: { en: 'Nothing lined up. Pick anything from Due today.', es: 'Nada en fila. Elige algo de Para hoy.' },
  currentPeriod: { en: 'Current pay period', es: 'Periodo de pago actual' },
  pastPeriods: { en: 'Past periods', es: 'Periodos anteriores' },
  shifts: { en: 'shifts', es: 'turnos' },
  daysLeft: { en: 'days left', es: 'dias restantes' },
  approvedLower: { en: 'approved', es: 'aprobadas' },
  pendingLower: { en: 'pending', es: 'pendientes' },
  recentShifts: { en: 'Recent shifts', es: 'Turnos recientes' },
  noShiftsYet: { en: 'No shifts yet.', es: 'Aun no hay turnos.' },
  open: { en: 'Open', es: 'Abierto' },
  showPay: { en: 'Show pay', es: 'Mostrar pago' },
  hidePay: { en: 'Hide pay', es: 'Ocultar pago' },
  language: { en: 'Language', es: 'Idioma' },
  englishFull: { en: 'English', es: 'Ingles' },
  spanishFull: { en: 'Spanish', es: 'Espanol' },
  byClockOut: { en: 'by clock-out', es: 'al salir' },
  anyoneOnShift: { en: 'Anyone on shift', es: 'Cualquiera en turno' },
  anyoneAssigned: { en: 'Anyone assigned', es: 'Cualquiera asignado' },
  assigned: { en: 'Assigned', es: 'Asignado' },
  started: { en: 'Started', es: 'Empezado' },
  shelfCheck: { en: 'Shelf check', es: 'Revision de anaquel' },
  nonShelfCheck: { en: 'Non-shelf check', es: 'Revision fuera de anaquel' },
  startWhenever: { en: 'Start whenever you need it.', es: 'Empieza cuando lo necesites.' },
  unassigned: { en: 'Unassigned', es: 'Sin asignar' },
  oneShared: { en: 'one shared', es: 'una compartida' },
  each: { en: 'each', es: 'cada uno' },
  check: { en: 'check', es: 'revision' },
  checks: { en: 'checks', es: 'revisiones' },
  at: { en: 'at', es: 'a las' },
  dueNow: { en: 'Due now', es: 'Ahora' },
  passed: { en: 'Passed', es: 'Bien' },
  late: { en: 'Late', es: 'Tarde' },
  criticalFail: { en: 'Critical fail', es: 'Fallo critico' },
  failOne: { en: 'fail', es: 'fallo' },
  failMany: { en: 'fails', es: 'fallos' },
};

const TRIGGER_STRINGS: Record<string, { en: string; es: string }> = {
  daily: { en: 'Daily', es: 'Diario' },
  weekly: { en: 'Weekly', es: 'Semanal' },
  biweekly: { en: 'Every two weeks', es: 'Cada dos semanas' },
  monthly: { en: 'Monthly', es: 'Mensual' },
  quarterly: { en: 'Quarterly', es: 'Trimestral' },
  annual: { en: 'Annual', es: 'Anual' },
  on_demand: { en: 'On demand', es: 'A pedido' },
};

export function triggerLabel(trigger: string, language: string | null | undefined): string {
  const lang: AppLanguage = language === 'es' ? 'es' : 'en';
  const row = TRIGGER_STRINGS[trigger];
  return row ? row[lang] : trigger;
}

export function t(key: string, language: string | null | undefined): string {
  const lang: AppLanguage = language === 'es' ? 'es' : 'en';
  const row = STRINGS[key];
  if (!row) return key;
  return row[lang];
}

export function pick(
  obj: object | null | undefined,
  field: string,
  language: string | null | undefined,
): string {
  if (!obj) return '';
  const row = obj as Record<string, unknown>;
  const lang: AppLanguage = language === 'es' ? 'es' : 'en';
  const esKey = `${field}_es`;
  if (lang === 'es') {
    const es = row[esKey];
    if (typeof es === 'string' && es.trim()) return es;
  }
  const en = row[field];
  return typeof en === 'string' ? en : '';
}

export type ShiftOption = { key: string; en: string; es: string; department: string };

export type ShiftDepartment = {
  key: string;
  en: string;
  es: string;
  shifts: Array<{ key: string; en: string; es: string }>;
};

export const SHIFT_DEPARTMENTS: ShiftDepartment[] = [
  {
    key: 'retail',
    en: 'Retail',
    es: 'Tienda',
    shifts: [
      { key: 'retail_open', en: 'Cashier - Open', es: 'Caja - Apertura' },
      { key: 'retail_day', en: 'Cashier - Day', es: 'Caja - Dia' },
      { key: 'retail_close', en: 'Cashier - Close', es: 'Caja - Cierre' },
      { key: 'retail_cs', en: 'Customer Service', es: 'Atencion al cliente' },
    ],
  },
  {
    key: 'warehouse',
    en: 'Warehouse',
    es: 'Bodega',
    shifts: [
      { key: 'processing', en: 'Processing', es: 'Procesamiento' },
      { key: 'restoration', en: 'Restoration', es: 'Restauracion' },
    ],
  },
  {
    key: 'office',
    en: 'Office',
    es: 'Oficina',
    shifts: [
      { key: 'office', en: 'Management', es: 'Gerencia' },
    ],
  },
];

export const SHIFT_OPTIONS: ShiftOption[] = SHIFT_DEPARTMENTS.flatMap((dept) =>
  dept.shifts.map((shift) => ({ ...shift, department: dept.key })),
);

export function shiftName(code: string, language: string | null | undefined): string {
  const row = SHIFT_OPTIONS.find((item) => item.key === code);
  if (!row) return code;
  return language === 'es' ? row.es : row.en;
}

export function shiftDepartment(code: string, language: string | null | undefined): string {
  const dept = SHIFT_DEPARTMENTS.find((row) => row.shifts.some((shift) => shift.key === code));
  if (!dept) return '';
  return language === 'es' ? dept.es : dept.en;
}
