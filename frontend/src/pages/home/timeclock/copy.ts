/** English and Spanish for the Time clock tab (Dash Update #137). */
import { useLanguage } from '../../../i18n/useLanguage';

const COPY = {
  mine: { en: 'Mine', es: 'Mío' },
  everyone: { en: 'Everyone', es: 'Todos' },
  viewLabel: { en: 'Whose time', es: 'De quién' },
  thisWeek: { en: 'This week', es: 'Esta semana' },
  ofLimit: { en: 'of {limit} h', es: 'de {limit} h' },
  hLeft: { en: '{left} h left this week.', es: 'Te quedan {left} h esta semana.' },
  soonLeft: { en: '{left} left this week. Clock out by {time} to stay under {limit} h.', es: 'Te queda {left} esta semana. Sal a las {time} para no pasar de {limit} h.' },
  atLimit: { en: 'You are at {limit} h. Clock out now: no overtime is approved.', es: 'Llegaste a {limit} h. Sal ahora: no hay horas extra aprobadas.' },
  scheduleOver: { en: 'Your schedule takes you to {total} h this week, {over} h past your {limit}. Talk to a manager.', es: 'Tu horario te lleva a {total} h esta semana, {over} h más de tus {limit}. Habla con un gerente.' },
  scheduledAhead: { en: '{ahead} h more on the schedule this week.', es: '{ahead} h más en el horario esta semana.' },
  nextShift: { en: 'Next on the schedule', es: 'Lo próximo en tu horario' },
  nextNone: { en: 'Nothing more this pay period.', es: 'Nada más este periodo.' },
  todayAt: { en: 'Today', es: 'Hoy' },
  payPeriod: { en: 'Pay period', es: 'Periodo de pago' },
  daysLeft: { en: '{n} days left', es: 'Quedan {n} días' },
  lastDay: { en: 'Last day', es: 'Último día' },
  showPay: { en: 'Show pay', es: 'Ver pago' },
  hidePay: { en: 'Hide pay', es: 'Ocultar pago' },
  workedSoFar: { en: 'Worked so far', es: 'Trabajado' },
  shiftsCount: { en: '{n} shifts', es: '{n} turnos' },
  oneShift: { en: '1 shift', es: '1 turno' },
  paySoFar: { en: 'Pay so far', es: 'Pago hasta hoy' },
  beforeTaxes: { en: 'Before taxes', es: 'Antes de impuestos' },
  overtimeIn: { en: 'Includes {h} h overtime', es: 'Incluye {h} h extra' },
  expected: { en: 'Expected by {date}', es: 'Esperado al {date}' },
  ifScheduled: { en: '+{h} h on the schedule', es: '+{h} h en el horario' },
  nothingAhead: { en: 'Nothing more on the schedule', es: 'Nada más en el horario' },
  scheduledAheadTile: { en: 'Scheduled ahead', es: 'En el horario' },
  expectedHours: { en: 'Expected by {date}', es: 'Esperado al {date}' },
  offPayroll: { en: 'Hours only: you are not on payroll.', es: 'Solo horas: no estás en nómina.' },
  shifts: { en: 'Shifts', es: 'Turnos' },
  shiftsHint: { en: 'Something wrong? Fix opens a request to your manager.', es: '¿Algo mal? Corregir le manda una solicitud a tu gerente.' },
  day: { en: 'Day', es: 'Día' },
  scheduled: { en: 'Scheduled', es: 'Horario' },
  worked: { en: 'Worked', es: 'Trabajado' },
  hours: { en: 'Hours', es: 'Horas' },
  status: { en: 'Status', es: 'Estado' },
  fix: { en: 'Fix', es: 'Corregir' },
  fixShift: { en: 'Fix this shift', es: 'Corregir este turno' },
  noShifts: { en: 'No shifts in this pay period yet', es: 'Aún no hay turnos en este periodo' },
  noShiftsBody: { en: 'Shifts you work and shifts on the schedule show here.', es: 'Aquí salen los turnos que trabajas y los del horario.' },
  onClock: { en: 'On the clock', es: 'En turno' },
  onBreak: { en: 'On break', es: 'En descanso' },
  fixAsked: { en: 'Fix asked', es: 'Corrección pedida' },
  fixed: { en: 'Fixed', es: 'Corregido' },
  fixDeclined: { en: 'Fix declined', es: 'Corrección rechazada' },
  needsFix: { en: 'Needs a fix', es: 'Hay que corregir' },
  upcoming: { en: 'Scheduled', es: 'Programado' },
  notWorked: { en: 'Not worked', es: 'No trabajado' },
  dayOff: { en: 'Day off', es: 'Día libre' },
  dayOffAsked: { en: 'Day off asked', es: 'Día libre pedido' },
  breakMin: { en: '{m} min break', es: '{m} min descanso' },
  now: { en: 'now', es: 'ahora' },
  timeOff: { en: 'Time off', es: 'Días libres' },
  timeOffHint: { en: 'Unpaid. Your manager answers here.', es: 'Sin pago. Tu gerente responde aquí.' },
  requestTimeOff: { en: 'Request time off', es: 'Pedir días libres' },
  request: { en: 'Request', es: 'Solicitud' },
  note: { en: 'Note', es: 'Nota' },
  answer: { en: 'Answer', es: 'Respuesta' },
  withdraw: { en: 'Withdraw', es: 'Retirar' },
  waiting: { en: 'Waiting', es: 'En espera' },
  approved: { en: 'Approved', es: 'Aprobada' },
  declined: { en: 'Declined', es: 'Rechazada' },
  noRequests: { en: 'No time off asked', es: 'No has pedido días libres' },
  noRequestsBody: { en: 'Ask for a day or a run of days; your manager approves or declines it.', es: 'Pide un día o varios; tu gerente lo aprueba o lo rechaza.' },
  couldNotLoad: { en: 'Could not load your pay period.', es: 'No se pudo cargar tu periodo de pago.' },
  couldNot: { en: 'Could not do that. Try again.', es: 'No se pudo. Inténtalo otra vez.' },
} satisfies Record<string, { en: string; es: string }>;

export type TimeClockCopyKey = keyof typeof COPY;

/** `tc('hLeft', { left: '8.5' })` fills the {placeholders}. */
export function useTimeClockCopy() {
  const lang = useLanguage();
  const tc = (key: TimeClockCopyKey, vars?: Record<string, string | number>) => {
    let text: string = COPY[key][lang];
    for (const [name, value] of Object.entries(vars ?? {})) text = text.split(`{${name}}`).join(String(value));
    return text;
  };
  return { tc, lang };
}
