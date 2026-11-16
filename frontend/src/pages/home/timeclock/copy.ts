/** English and Spanish for the TimeClock tab (Dash Updates #137, #179). */
import { useLanguage } from '../../../i18n/useLanguage';

const COPY = {
  // Now
  now: { en: 'Now', es: 'Ahora' },
  notClockedIn: { en: 'Not clocked in', es: 'Sin entrar' },
  scheduledToday: { en: 'Scheduled {t}', es: 'Horario {t}' },
  clockInAs: { en: 'Clock in · {shift}', es: 'Entrar · {shift}' },
  otherShift: { en: 'Other shift', es: 'Otro turno' },
  thisWeek: { en: 'This week', es: 'Esta semana' },
  weekOf: { en: '{worked} / {limit} h', es: '{worked} / {limit} h' },
  hLeftShort: { en: '{left} h left', es: 'Quedan {left} h' },
  hLeft: { en: '{left} h left this week.', es: 'Te quedan {left} h esta semana.' },
  soonLeft: { en: '{left} left this week. Clock out by {time} to stay under {limit} h.', es: 'Te queda {left} esta semana. Sal a las {time} para no pasar de {limit} h.' },
  atLimit: { en: 'You are at {limit} h. Clock out now: no overtime is approved.', es: 'Llegaste a {limit} h. Sal ahora: no hay horas extra aprobadas.' },
  scheduleOver: { en: 'Your schedule takes you to {total} h this week, {over} h past your {limit}. Talk to a manager.', es: 'Tu horario te lleva a {total} h esta semana, {over} h más de tus {limit}. Habla con un gerente.' },
  scheduledAhead: { en: '{ahead} h more on the schedule this week.', es: '{ahead} h más en el horario esta semana.' },
  // My schedule
  mySchedule: { en: 'My schedule', es: 'Mi horario' },
  storeSchedule: { en: 'Store schedule', es: 'Horario de la tienda' },
  buildSchedule: { en: 'Build', es: 'Armar' },
  today: { en: 'Today', es: 'Hoy' },
  nextWeek: { en: 'Next week', es: 'La próxima semana' },
  nothingScheduled: { en: 'Nothing scheduled yet', es: 'Nada en el horario aún' },
  moreShifts: { en: '+{n} more', es: '+{n} más' },
  backToTimeClock: { en: 'TimeClock', es: 'Reloj de turno' },
  // Pay
  pay: { en: 'Pay', es: 'Pago' },
  hours: { en: 'Hours', es: 'Horas' },
  daysLeft: { en: '{n} days left', es: 'Quedan {n} días' },
  lastDay: { en: 'Last day', es: 'Último día' },
  showPay: { en: 'Show pay', es: 'Ver pago' },
  hidePay: { en: 'Hide pay', es: 'Ocultar pago' },
  soFar: { en: 'So far', es: 'Hasta hoy' },
  expectedBy: { en: 'Expected {date}', es: 'Esperado {date}' },
  hoursShifts: { en: '{h} h · {n} shifts', es: '{h} h · {n} turnos' },
  hoursOneShift: { en: '{h} h · 1 shift', es: '{h} h · 1 turno' },
  shiftsCount: { en: '{n} shifts', es: '{n} turnos' },
  oneShift: { en: '1 shift', es: '1 turno' },
  aheadScheduled: { en: '+{h} h scheduled', es: '+{h} h en el horario' },
  nothingAhead: { en: 'Nothing more scheduled', es: 'Nada más en el horario' },
  overtimeIn: { en: '{h} h overtime', es: '{h} h extra' },
  // Past shifts
  pastShifts: { en: 'Past shifts', es: 'Turnos pasados' },
  noPast: { en: 'No shifts yet this pay period', es: 'Aún no hay turnos en este periodo' },
  fix: { en: 'Fix', es: 'Corregir' },
  fixShift: { en: 'Fix this shift', es: 'Corregir este turno' },
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
  nowWord: { en: 'now', es: 'ahora' },
  // Time off
  timeOff: { en: 'Time off', es: 'Días libres' },
  request: { en: 'Request', es: 'Pedir' },
  requestTimeOff: { en: 'Request time off', es: 'Pedir días libres' },
  noRequests: { en: 'None asked', es: 'Nada pedido' },
  withdraw: { en: 'Withdraw', es: 'Retirar' },
  waiting: { en: 'Waiting', es: 'En espera' },
  approved: { en: 'Approved', es: 'Aprobada' },
  declined: { en: 'Declined', es: 'Rechazada' },
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

export type Tc = ReturnType<typeof useTimeClockCopy>['tc'];
