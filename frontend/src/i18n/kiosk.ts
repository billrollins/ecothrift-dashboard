/** English / Spanish for the time kiosk (/kiosk) and the public clock (/clock).
 *
 * Every string on either route lives here with both languages. A test fails
 * when a key is missing its Spanish value. Do not invent another mechanism;
 * a project-wide translation table is a separate initiative.
 */
import type { AppLanguage } from './routines';

export type { AppLanguage };

export const KIOSK_LANG_KEY = 'kiosk.lang';

export const KIOSK_STRINGS: Record<string, { en: string; es: string }> = {
  // Chrome
  tapToStart: { en: 'Tap to start', es: 'Toca para empezar' },
  tapToStartHint: { en: 'The screen goes full size and stays on.', es: 'La pantalla se pone a tamano completo y se queda encendida.' },
  scanYourCard: { en: 'Scan your card', es: 'Escanea tu tarjeta' },
  noCard: { en: 'No card? Ask a manager.', es: 'Sin tarjeta? Pregunta a un gerente.' },
  exit: { en: 'Exit', es: 'Salir' },
  exitTitle: { en: 'Leave the kiosk', es: 'Salir del kiosco' },
  exitHint: { en: 'Enter the kiosk host password.', es: 'Escribe la contrasena del anfitrion del kiosco.' },
  password: { en: 'Password', es: 'Contrasena' },
  wrongPassword: { en: 'Wrong password.', es: 'Contrasena incorrecta.' },
  confirm: { en: 'Confirm', es: 'Confirmar' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  back: { en: 'Back', es: 'Atras' },
  done: { en: 'Done', es: 'Listo' },
  loading: { en: 'Loading', es: 'Cargando' },
  boardEmpty: { en: 'Nobody is expected today.', es: 'Nadie tiene turno hoy.' },
  storeClosedToday: { en: 'The store is closed today.', es: 'La tienda esta cerrada hoy.' },
  managerWarning: {
    en: 'This host is a Manager or Admin. Use a dedicated kiosk account.',
    es: 'Este anfitrion es Gerente o Admin. Usa una cuenta dedicada para el kiosco.',
  },
  hostExpired: { en: 'Host session expired.', es: 'La sesion del anfitrion expiro.' },
  hostExpiredHint: { en: 'Manager sign-in needed.', es: 'Se necesita que un gerente inicie sesion.' },
  notAvailableHere: { en: 'Not available here.', es: 'No disponible aqui.' },
  other: { en: 'Other', es: 'Otros' },

  // Board chips
  chipIn: { en: 'In', es: 'Dentro' },
  chipBreak: { en: 'On break', es: 'En descanso' },
  chipExpected: { en: 'Expected', es: 'Se espera' },
  chipLate: { en: 'Late', es: 'Tarde' },
  chipCalledIn: { en: 'Called in', es: 'Aviso falta' },
  chipLeft: { en: 'Left', es: 'Salio' },
  chipOut: { en: 'Out', es: 'Fuera' },
  minLate: { en: 'min late', es: 'min tarde' },

  // Identify
  cardNotRecognized: { en: 'Card not recognized. Try again or see a manager.', es: 'Tarjeta no reconocida. Intenta de nuevo o habla con un gerente.' },
  checkingCard: { en: 'Checking your card', es: 'Revisando tu tarjeta' },

  // Out overlay
  youAreOut: { en: "You're clocked out", es: 'Estas fuera de turno' },
  suggestedShift: { en: 'Your shift today', es: 'Tu turno de hoy' },
  differentShift: { en: 'Different shift', es: 'Otro turno' },
  pickShift: { en: 'Which shift are you working?', es: 'Que turno vas a hacer?' },
  clockIn: { en: 'Clock in', es: 'Entrar' },
  noShiftToday: { en: 'No shift on the roster for you today.', es: 'No tienes turno en el horario de hoy.' },
  shiftUnmatched: { en: 'Your roster shift has no clock tile. Pick one.', es: 'Tu turno del horario no tiene boton. Elige uno.' },

  // In overlay
  youAreIn: { en: "You're clocked in", es: 'Estas en turno' },
  onBreakSince: { en: 'On break since', es: 'En descanso desde' },
  since: { en: 'since', es: 'desde' },
  clockOut: { en: 'Clock out', es: 'Salir' },
  takeBreak: { en: 'Take break', es: 'Tomar descanso' },
  endBreak: { en: 'End break', es: 'Terminar descanso' },
  somethingWrong: { en: "Something's wrong", es: 'Algo esta mal' },
  wrongShift: { en: 'Wrong shift', es: 'Turno equivocado' },
  wrongShiftHint: { en: 'Relabel this punch. Nothing closes.', es: 'Cambia la etiqueta de esta entrada. Nada se cierra.' },
  wrongStart: { en: 'Wrong start time', es: 'Hora de entrada equivocada' },
  wrongStartHint: { en: 'What time did you actually start?', es: 'A que hora empezaste de verdad?' },
  forgotBreak: { en: 'Forgot a break', es: 'Olvide un descanso' },
  forgotBreakHint: { en: 'How many minutes?', es: 'Cuantos minutos?' },
  minutes: { en: 'minutes', es: 'minutos' },
  sendRequest: { en: 'Send request', es: 'Enviar solicitud' },
  requestSent: { en: 'Request sent to a manager.', es: 'Solicitud enviada a un gerente.' },

  // Stale
  staleTitle: { en: 'You never clocked out', es: 'No marcaste tu salida' },
  staleBody: { en: 'Your last punch is still open from', es: 'Tu ultima entrada sigue abierta desde' },
  staleSuggest: { en: "We'll close it at", es: 'La cerraremos a las' },
  staleNote: { en: 'A manager will confirm the time in Pay.', es: 'Un gerente confirmara la hora en Pago.' },
  fixIt: { en: 'Fix it', es: 'Arreglarlo' },

  // Gate
  beforeYouClockIn: { en: 'Before you clock in', es: 'Antes de entrar' },
  missedTitle: { en: 'These were missed', es: 'Estas se quedaron sin hacer' },
  missedHint: { en: 'Pick a reason for each one.', es: 'Elige un motivo para cada una.' },
  sameForAll: { en: 'Same reason for all', es: 'El mismo motivo para todas' },
  reasonForgot: { en: 'Forgot', es: 'Se me olvido' },
  reasonNoTime: { en: 'Ran out of time', es: 'No alcance el tiempo' },
  reasonCalledIn: { en: 'Called in', es: 'Avise que faltaba' },
  reasonNotMySection: { en: 'Not my section that day', es: 'No era mi seccion ese dia' },
  reasonOther: { en: 'Other', es: 'Otro' },
  reasonOtherNote: { en: 'A few words', es: 'Unas palabras' },
  nudgeTitle: { en: 'A manager nudged you', es: 'Un gerente te aviso' },
  nudgeHint: { en: 'Tap Heard to continue.', es: 'Toca Escuchado para continuar.' },
  heard: { en: 'Heard', es: 'Escuchado' },
  next: { en: 'Next', es: 'Siguiente' },

  // Warnings (never blocking)
  warnStoreClosed: { en: 'The store is closed today.', es: 'La tienda esta cerrada hoy.' },
  warnOvertime: { en: "You're at the weekly hour limit.", es: 'Llegaste al limite de horas de la semana.' },
  warnLate: { en: "You're {minutes} min late for {shift}.", es: 'Llegas {minutes} min tarde para {shift}.' },
  alreadyIn: { en: 'Already clocked in.', es: 'Ya estas en turno.' },

  // Success
  successClockIn: { en: 'Clocked in', es: 'Entraste' },
  successClockOut: { en: 'Clocked out', es: 'Saliste' },
  successBreakStart: { en: 'On break', es: 'En descanso' },
  successBreakEnd: { en: 'Back from break', es: 'De vuelta del descanso' },
  successSetShift: { en: 'Shift updated', es: 'Turno actualizado' },
  successFixStale: { en: 'Old punch closed', es: 'Entrada anterior cerrada' },
  successRequest: { en: 'Request sent', es: 'Solicitud enviada' },
  at: { en: 'at', es: 'a las' },

  // Errors
  genericError: { en: 'Something went wrong. Try again.', es: 'Algo salio mal. Intenta de nuevo.' },
};

export const MISS_REASON_KEYS: Array<{ code: string; key: string }> = [
  { code: 'forgot', key: 'reasonForgot' },
  { code: 'no_time', key: 'reasonNoTime' },
  { code: 'called_in', key: 'reasonCalledIn' },
  { code: 'not_my_section', key: 'reasonNotMySection' },
  { code: 'other', key: 'reasonOther' },
];

export function tk(key: string, language: string | null | undefined, vars?: Record<string, string | number>): string {
  const lang: AppLanguage = language === 'es' ? 'es' : 'en';
  const row = KIOSK_STRINGS[key];
  let text = row ? row[lang] : key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(`{${name}}`, String(value));
    }
  }
  return text;
}

export function missReasonLabel(code: string, language: string | null | undefined): string {
  const row = MISS_REASON_KEYS.find((item) => item.code === code);
  return row ? tk(row.key, language) : code;
}

export function readKioskLang(): AppLanguage {
  try {
    return window.localStorage.getItem(KIOSK_LANG_KEY) === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

export function writeKioskLang(lang: AppLanguage): void {
  try {
    window.localStorage.setItem(KIOSK_LANG_KEY, lang);
  } catch {
    // Private mode or storage disabled; the toggle still works for this page load.
  }
}
