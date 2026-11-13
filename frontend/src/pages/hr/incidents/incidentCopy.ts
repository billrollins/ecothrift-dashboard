/** Words for HR -> Incidents (#131), English and Spanish. Plain words; no legal advice. */
import { format, parseISO } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { useLanguage } from '../../../i18n/useLanguage';
import type { IncidentKind, IncidentPlace, IncidentRole } from '../../../api/incidents.api';

type Copy = { en: string; es: string };

const COPY = {
  title: { en: 'Incident reports', es: 'Reportes de incidentes' },
  intro: {
    en: 'Write down anything that happens on site right after it happens: a fall, a car in the lot, an animal, an upset visitor. A manager follows up.',
    es: 'Anota todo lo que pase en la tienda justo después: una caída, un carro en el estacionamiento, un animal, un visitante molesto. Un gerente le da seguimiento.',
  },
  report: { en: 'Report an incident', es: 'Reportar un incidente' },
  editTitle: { en: 'Edit the report', es: 'Editar el reporte' },
  yours: { en: 'Your reports', es: 'Tus reportes' },
  all: { en: 'All', es: 'Todos' },
  open: { en: 'Open', es: 'Abierto' },
  closed: { en: 'Closed', es: 'Cerrado' },
  none: { en: 'No reports.', es: 'No hay reportes.' },
  loadFailed: { en: 'Reports did not load.', es: 'Los reportes no cargaron.' },
  when: { en: 'When did it happen?', es: '¿Cuándo pasó?' },
  kind: { en: 'What kind of incident?', es: '¿Qué tipo de incidente?' },
  where: { en: 'Where?', es: '¿Dónde?' },
  whereDetail: { en: 'Exact spot (optional)', es: 'Lugar exacto (opcional)' },
  markMap: { en: 'Mark it on the store map', es: 'Marcarlo en el mapa' },
  spotMarked: { en: 'Spot marked on the store map', es: 'Lugar marcado en el mapa' },
  change: { en: 'Change', es: 'Cambiar' },
  remove: { en: 'Remove', es: 'Quitar' },
  tapMap: { en: 'Tap where it happened.', es: 'Toca donde pasó.' },
  useSpot: { en: 'Use this spot', es: 'Usar este lugar' },
  noMap: { en: 'No store map yet.', es: 'Todavía no hay mapa.' },
  who: { en: 'Who was involved?', es: '¿Quién estuvo involucrado?' },
  name: { en: 'Name, if given', es: 'Nombre, si lo dio' },
  contact: { en: 'Phone or email, if given', es: 'Teléfono o correo, si lo dio' },
  addPerson: { en: 'Add a person', es: 'Agregar persona' },
  removePerson: { en: 'Remove this person', es: 'Quitar a esta persona' },
  what: { en: 'What happened? Plain words, in order.', es: '¿Qué pasó? En palabras sencillas, en orden.' },
  whatNeeded: { en: 'Say what happened.', es: 'Di qué pasó.' },
  injuries: { en: 'Injuries and help given', es: 'Lesiones y ayuda dada' },
  firstAid: { en: 'First aid given', es: 'Se dieron primeros auxilios' },
  called911: { en: '911 called', es: 'Se llamó al 911' },
  witnesses: { en: 'Witnesses (names, phone if given)', es: 'Testigos (nombres, teléfono si lo dieron)' },
  cameras: { en: 'Cameras that may have it', es: 'Cámaras que lo pudieron grabar' },
  photos: { en: 'Photos', es: 'Fotos' },
  addPhoto: { en: 'Add photo', es: 'Agregar foto' },
  photosHint: { en: 'The spot, any damage or the car.', es: 'El lugar, cualquier daño o el carro.' },
  followUp: { en: 'Follow-up needed', es: 'Seguimiento necesario' },
  save: { en: 'Send the report', es: 'Enviar el reporte' },
  saveEdit: { en: 'Save changes', es: 'Guardar cambios' },
  saving: { en: 'Sending…', es: 'Enviando…' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  sent: { en: 'Report sent. The owner has it.', es: 'Reporte enviado. El dueño ya lo tiene.' },
  saved: { en: 'Saved. The old text is kept.', es: 'Guardado. Se guarda el texto anterior.' },
  couldNot: { en: 'Could not save. Try again.', es: 'No se pudo guardar. Intenta otra vez.' },
  reportedBy: { en: 'Reported by', es: 'Reportado por' },
  happened: { en: 'Happened', es: 'Pasó' },
  history: { en: 'History', es: 'Historial' },
  addNote: { en: 'Add a follow-up note', es: 'Agregar una nota de seguimiento' },
  sendNote: { en: 'Add note', es: 'Agregar nota' },
  closeReport: { en: 'Close the report', es: 'Cerrar el reporte' },
  reopen: { en: 'Reopen', es: 'Reabrir' },
  edit: { en: 'Edit', es: 'Editar' },
  close: { en: 'Close', es: 'Cerrar' },
  filed: { en: 'filed the report', es: 'envió el reporte' },
  changed: { en: 'changed', es: 'cambió' },
  was: { en: 'was', es: 'antes' },
  nowIs: { en: 'now', es: 'ahora' },
  closedIt: { en: 'closed the report', es: 'cerró el reporte' },
  reopenedIt: { en: 'reopened the report', es: 'reabrió el reporte' },
  empty: { en: '(empty)', es: '(vacío)' },
  yes: { en: 'Yes', es: 'Sí' },
  no: { en: 'No', es: 'No' },
  notFound: { en: 'That report is not here.', es: 'Ese reporte no está aquí.' },
  spot: { en: 'Spot on the store map', es: 'Lugar en el mapa' },
  noPeople: { en: 'Nobody listed', es: 'Nadie anotado' },
} satisfies Record<string, Copy>;

export const KIND_COPY: Record<IncidentKind, Copy> = {
  fall: { en: 'Fall or slip', es: 'Caída o resbalón' },
  injury: { en: 'Other injury', es: 'Otra lesión' },
  health: { en: 'Someone felt sick', es: 'Alguien se sintió mal' },
  vehicle: { en: 'Car or parking lot', es: 'Carro o estacionamiento' },
  animal: { en: 'Animal', es: 'Animal' },
  conduct: { en: 'Upset or unsafe behavior', es: 'Conducta molesta o peligrosa' },
  theft: { en: 'Theft', es: 'Robo' },
  damage: { en: 'Damage to property', es: 'Daño a la propiedad' },
  other: { en: 'Something else', es: 'Otra cosa' },
};

export const PLACE_COPY: Record<IncidentPlace, Copy> = {
  sales_floor: { en: 'Sales floor', es: 'Piso de ventas' },
  checkout: { en: 'Checkout', es: 'Caja' },
  entrance: { en: 'Entrance or doors', es: 'Entrada o puertas' },
  restroom: { en: 'Restrooms', es: 'Baños' },
  back: { en: 'Back of the store (processing, Restoration)', es: 'Parte de atrás (procesamiento, Restauración)' },
  break_room: { en: 'Break room', es: 'Sala de descanso' },
  stairs: { en: 'Stairs or back hallway', es: 'Escaleras o pasillo de atrás' },
  dock: { en: 'Loading dock or donations door', es: 'Muelle de carga o puerta de donaciones' },
  parking: { en: 'Parking lot', es: 'Estacionamiento' },
  outside: { en: 'Outside or sidewalk', es: 'Afuera o banqueta' },
  other: { en: 'Somewhere else', es: 'Otro lugar' },
};

export const ROLE_COPY: Record<IncidentRole, Copy> = {
  customer: { en: 'Customer', es: 'Cliente' },
  visitor: { en: 'Visitor', es: 'Visitante' },
  staff: { en: 'Staff', es: 'Personal' },
  vendor: { en: 'Vendor or driver', es: 'Proveedor o chofer' },
  other: { en: 'Someone else', es: 'Otra persona' },
};

/** History lines name the field that changed. */
export const FIELD_COPY: Record<string, Copy> = {
  occurred_at: { en: 'When', es: 'Cuándo' },
  kind: { en: 'Kind', es: 'Tipo' },
  place: { en: 'Where', es: 'Dónde' },
  place_detail: { en: 'Exact spot', es: 'Lugar exacto' },
  people: { en: 'People involved', es: 'Personas' },
  what_happened: { en: 'What happened', es: 'Qué pasó' },
  injuries: { en: 'Injuries and help', es: 'Lesiones y ayuda' },
  first_aid: { en: 'First aid', es: 'Primeros auxilios' },
  called_911: { en: '911 called', es: 'Llamada al 911' },
  witnesses: { en: 'Witnesses', es: 'Testigos' },
  cameras: { en: 'Cameras', es: 'Cámaras' },
  follow_up: { en: 'Follow-up needed', es: 'Seguimiento' },
  map: { en: 'Spot on the map', es: 'Lugar en el mapa' },
};

export type CopyKey = keyof typeof COPY;

export function useIncidentCopy() {
  const lang = useLanguage();
  const locale = lang === 'es' ? { locale: esLocale } : undefined;
  const t = (key: CopyKey) => COPY[key][lang];
  const pick = (copy: Copy | undefined, fallback = '') => (copy ? copy[lang] : fallback);
  const at = (iso: string, pattern = 'EEE MMM d, h:mm a') => format(parseISO(iso), pattern, locale);
  return { t, pick, at, lang };
}
