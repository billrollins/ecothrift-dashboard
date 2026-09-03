import type {
  RoutineAssignment,
  RoutineAudienceType,
  RoutineCheckDef,
  RoutineControl,
  RoutineDefinition,
  RoutineExpireRule,
  RoutineExpireUnit,
  RoutineSectionDef,
  RoutineTrigger,
} from '../../api/routines.api';

/**
 * The portable shape of a routine: what the editor holds, minus server ids
 * and timestamps. This is what "Copy for AI" hands out and what "Update from
 * JSON" takes back, so the two sides can never drift.
 */
export const ROUTINE_DOC_FORMAT = 'ecothrift.routine/1';

export interface RoutineDoc {
  format: typeof ROUTINE_DOC_FORMAT;
  title: string;
  intro: string;
  trigger: RoutineTrigger;
  /** "HH:MM", 24h. */
  due_time: string;
  /** "YYYY-MM-DD"; only meaningful when trigger is biweekly. */
  anchor_date: string | null;
  grace_days: number;
  expire_rule: RoutineExpireRule;
  expire_count: number;
  expire_unit: RoutineExpireUnit;
  /** "HH:MM" or null. Hours start at; null is midnight. */
  expire_from_time: string | null;
  assignment: RoutineAssignment;
  audience_type: RoutineAudienceType;
  audience_all: boolean;
  assigned_shifts: string[];
  assigned_department_ids: number[];
  assigned_department: number | null;
  assigned_user_ids: number[];
  is_blocking: boolean;
  definition: RoutineDefinition;
}

export const TRIGGERS: RoutineTrigger[] = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual', 'on_demand'];
export const EXPIRE_RULES: RoutineExpireRule[] = ['never', 'end_of_day', 'end_of_week', 'after'];
export const EXPIRE_UNITS: RoutineExpireUnit[] = ['hours', 'days', 'weeks', 'months'];
export const ASSIGNMENTS: RoutineAssignment[] = ['pooled', 'per_person'];
export const AUDIENCE_TYPES: RoutineAudienceType[] = ['person', 'shift', 'department'];
export const CONTROLS: RoutineControl[] = ['pass_fail', 'pass_fail_strict', 'number', 'text', 'photo'];
export const SHIFT_CODES = [
  'retail_open', 'retail_day', 'retail_close', 'retail_cs',
  'processing', 'restoration', 'office',
];

/**
 * Who exists, so a model can pick an owner by id instead of guessing. The
 * editor already loads both lists for its dropdowns.
 */
export interface BriefContext {
  departments: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string; role: string; department: string | null }>;
}

export const EMPTY_BRIEF_CONTEXT: BriefContext = { departments: [], people: [] };

/* ------------------------------------------------------------------ brief */

/**
 * Everything an outside model needs in one paste: what a routine is, the
 * current data (or a blank starting point), who can own it, the field guide,
 * and how to answer. The user types their request under the last heading.
 */
export function buildAiBrief(
  doc: RoutineDoc,
  mode: 'edit' | 'create' = 'edit',
  context: BriefContext = EMPTY_BRIEF_CONTEXT,
): string {
  const creating = mode === 'create';
  const departments = context.departments.length
    ? context.departments.map((d) => `- ${d.id} - ${d.name}`)
    : ['- (none set up yet)'];
  const people = context.people.length
    ? context.people.map((p) => `- ${p.id} - ${p.name}${p.role || p.department ? ` (${[p.role, p.department].filter(Boolean).join(', ')})` : ''}`)
    : ['- (none)'];
  return [
    `# Eco-Thrift routine - ${creating ? 'new routine' : 'edit'} brief`,
    '',
    creating
      ? "You are drafting a new routine for Eco-Thrift's staff dashboard. A routine is a"
      : "You are editing a routine for Eco-Thrift's staff dashboard. A routine is a",
    'recurring checklist that staff fill in on a phone. It has a name, a schedule,',
    'an owner, and a checklist made of sections, each holding checks.',
    '',
    creating ? '## Starting point' : '## Current routine',
    '',
    ...(creating ? [
      'This is the blank form with its defaults. The section and check in it are',
      'placeholders - replace them. Anything I have already typed is kept below.',
      '',
    ] : []),
    '```json',
    JSON.stringify(doc, null, 2),
    '```',
    '',
    '## Who can own it',
    '',
    'Who gets a run is `audience_type` (person / shift / department), `audience_all`, then the list.',
    '`assignment: "pooled"` is one shared run; `"per_person"` gives each match their own.',
    'Shift routines only appear for someone clocked into a selected shift. Clocked out hides them.',
    '',
    'A standing walk for named people: `"audience_type": "person"`, `"audience_all": false`,',
    '`"assigned_user_ids": [<ids>]`. A shift checklist: `"audience_type": "shift"`,',
    '`"assigned_shifts": ["retail_open"]`. All staff share one: `"audience_type": "person"`,',
    '`"audience_all": true`, `"assignment": "pooled"`.',
    '',
    'Departments (id - name):',
    ...departments,
    '',
    'People (id - name, role, department):',
    ...people,
    '',
    '## Field guide',
    '',
    '- `title` - shown at the top of the phone. Keep it short.',
    '- `intro` - one line of context under the title. May be "".',
    `- \`trigger\` - one of: ${TRIGGERS.join(', ')}.`,
    '- `due_time` - "HH:MM", 24-hour. When the app-bar nag starts that day. The run is already on My Routines. Use 00:00 (or morning) to warn all day; use 17:50 so a close stays quiet until 5:50pm.',
    '- `anchor_date` - "YYYY-MM-DD". Only used when trigger is `biweekly`: the next due date, repeating every 14 days. Otherwise `null`.',
    '- `grace_days` - whole number 0-30. Days late before a run counts as overdue.',
    '- `expire_rule` - `never` (can still fill it late), `end_of_day`, `end_of_week`, or `after`. After this the run is Missed and cannot be filled.',
    '- `expire_count` / `expire_unit` - used when expire_rule is `after`. Unit is hours, days, weeks, or months.',
    '- `expire_from_time` - "HH:MM" or null. When the unit is hours, the clock that duration starts from. Null is midnight.',
    '- `assignment` - `pooled` (one shared run) or `per_person` (everyone matching gets their own).',
    `- \`audience_type\` - one of: ${AUDIENCE_TYPES.join(', ')}.`,
    '- `audience_all` - `true` means All staff / All shifts / All departments for that type.',
    `- \`assigned_shifts\` - shift codes when type is shift and All is off. One of: ${SHIFT_CODES.join(', ')}.`,
    '- `assigned_department_ids` - department ids when type is department and All is off. Names are also accepted.',
    '- `assigned_department` - first department id, or `null`. Kept so the section floor has one department.',
    '- `assigned_user_ids` - people ids when type is person and All is off. Full names are also accepted.',
    '- `is_blocking` - `true` pins the routine at the top of everyone\'s list until it is done.',
    '- `definition.sections[]` - ordered. Each is `{ id, title, title_es, checks[] }`. At least one section with at least one check.',
    '- check - `{ id, label, label_es, control, hint, hint_es, unit, critical, verify_prev }`',
    `  - \`control\` - ${CONTROLS.map((c) => `\`${c}\``).join(', ')}. \`pass_fail\` offers Pass / Fail / N/A; \`pass_fail_strict\` offers Pass / Fail only.`,
    '  - `hint` - optional one line under the label explaining how or why, or "".',
    '  - `label_es` / `hint_es` / `title_es` - Spanish copy. May be "".',
    '  - `verify_prev` - `true` if the next shift has to confirm this check.',
    '  - `unit` - only for `number` checks (e.g. "°F", "kg"); otherwise "".',
    '  - `critical` - `true` means a single fail fails the whole run.',
    '',
    '## How to reply',
    '',
    '1. Reply with ONE fenced ```json block holding the complete routine in exactly this shape. No text outside the block.',
    `2. Keep \`"format": "${ROUTINE_DOC_FORMAT}"\`.`,
    ...(creating ? [
      '3. Give every section and check an id: a lowercase slug such as `section-front-of-house` or `check-unlock-front-doors`. Ids must be unique.',
      '4. Group checks into sections in the order staff would walk the building. Three to eight checks per section reads well on a phone.',
      '5. Pick `control` per check: `pass_fail` for most things, `number` (with `unit`) for readings, `text` for something to write down, `photo` for proof. Mark `critical` only where one fail should fail the whole run.',
      '6. Set the owner from the lists above: `audience_type`, `audience_all` or a list, and `pooled` unless every match must do it themselves. Work out `trigger` and `due_time` from what the checklist is for. Opening that should nag all morning is 00:00 or store-open; closing that should stay quiet until 5:50 is 17:50.',
      '7. Labels are short imperatives ("Unlock front doors"). Put the how and why in `hint`.',
      '8. Never use an em dash (-) or en dash (-) in title, intro, section titles, labels, or hints. Use a hyphen, comma, or period.',
      '',
      '## What this routine should cover',
    ] : [
      '3. Keep the `id` of every section and check you retain, even if you edit or move it. Ids are how in-progress runs and history line up. Never renumber.',
      '4. New sections and checks get a fresh id: a lowercase slug such as `section-closing` or `check-back-door-locked`.',
      '5. Change only what is asked for. Copy everything else through untouched - including the owner fields, unless I ask to reassign; then use ids from the lists above.',
      '6. Labels are short imperatives ("Unlock front doors"). Put the how and why in `hint`.',
      '7. Never use an em dash (-) or en dash (-) in title, intro, section titles, labels, or hints. Use a hyphen, comma, or period. Keep an existing title that already has one only if I did not ask you to rename it.',
      '',
      '## What I want changed',
    ]),
    '',
  ].join('\n');
}

/* ------------------------------------------------------------------ parse */

export type ParseResult =
  | { ok: true; doc: RoutineDoc; warnings: string[] }
  | { ok: false; error: string };

/**
 * Pull the JSON out of whatever came back: a bare object, a fenced block, or
 * an object buried in prose. Returns the candidate text, not a parsed value.
 */
export function extractJsonText(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/);
  if (fenced && fenced[1].trim()) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/**
 * Read a pasted or uploaded document against what the form currently holds.
 * Fields the document leaves out fall back to `current`, so a model that only
 * returns what changed still produces a whole routine. Anything malformed is a
 * hard error; anything we quietly fixed becomes a warning.
 */
/** Fields a program routine must not send back. The grade keys on them. */
export const SYSTEM_LOCKED_DOC_FIELDS = ['trigger', 'assignment', 'audience_type'] as const;

export function dropLockedDocFields(doc: RoutineDoc, current: RoutineDoc): RoutineDoc {
  return {
    ...doc,
    trigger: current.trigger,
    assignment: current.assignment,
    audience_type: current.audience_type,
  };
}

export function parseRoutineDoc(
  raw: string,
  current: RoutineDoc,
  context: BriefContext = EMPTY_BRIEF_CONTEXT,
): ParseResult {
  const candidate = extractJsonText(raw);
  if (!candidate) return { ok: false, error: 'No JSON found. Paste the block your AI returned, or upload the file.' };

  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch (error) {
    const detail = error instanceof Error ? error.message.replace(/^JSON\.parse: /, '') : '';
    return { ok: false, error: `That is not valid JSON${detail ? ` - ${detail}` : ''}.` };
  }
  if (!isRecord(value)) return { ok: false, error: 'Expected a JSON object at the top level.' };

  const known: Array<keyof RoutineDoc> = [
    'title', 'intro', 'trigger', 'due_time', 'anchor_date', 'grace_days',
    'expire_rule', 'expire_count', 'expire_unit', 'expire_from_time', 'assignment',
    'audience_type', 'audience_all', 'assigned_shifts', 'assigned_department_ids',
    'assigned_department', 'assigned_user_ids', 'is_blocking', 'definition',
  ];
  if (!known.some((key) => key in value)) {
    return { ok: false, error: 'This does not look like a routine - none of the routine fields are present.' };
  }
  if ('format' in value && value.format !== ROUTINE_DOC_FORMAT) {
    return { ok: false, error: `Unknown format "${String(value.format)}". Expected "${ROUTINE_DOC_FORMAT}".` };
  }

  const warnings: string[] = [];
  const errors: string[] = [];

  const str = (key: keyof RoutineDoc, fallback: string): string => {
    if (!(key in value)) return fallback;
    const v = value[key];
    if (v === null || v === undefined) return '';
    if (typeof v !== 'string') {
      errors.push(`\`${key}\` must be text.`);
      return fallback;
    }
    return v.trim();
  };

  const title = str('title', current.title);
  if ('title' in value && !title) errors.push('`title` cannot be empty.');
  const intro = str('intro', current.intro);

  let trigger = current.trigger;
  if ('trigger' in value) {
    const v = value.trigger;
    if (typeof v === 'string' && (TRIGGERS as string[]).includes(v)) trigger = v as RoutineTrigger;
    else errors.push(`\`trigger\` must be one of ${TRIGGERS.join(', ')}.`);
  }

  let dueTime = current.due_time;
  if ('due_time' in value) {
    const v = value.due_time;
    const m = typeof v === 'string' ? v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/) : null;
    if (m && Number(m[1]) < 24 && Number(m[2]) < 60) dueTime = `${m[1].padStart(2, '0')}:${m[2]}`;
    else errors.push('`due_time` must be "HH:MM".');
  }

  let anchor = current.anchor_date;
  if ('anchor_date' in value) {
    const v = value.anchor_date;
    if (v === null || v === '') anchor = null;
    else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) anchor = v;
    else errors.push('`anchor_date` must be "YYYY-MM-DD" or null.');
  }
  if (trigger === 'biweekly' && !anchor) {
    anchor = current.anchor_date;
    if (!anchor) warnings.push('Bi-weekly needs a next-due date; set it in Schedule before saving.');
  }
  if (trigger !== 'biweekly' && anchor) {
    anchor = null;
  }

  let grace = current.grace_days;
  if ('grace_days' in value) {
    const v = Number(value.grace_days);
    if (Number.isInteger(v) && v >= 0 && v <= 30) grace = v;
    else errors.push('`grace_days` must be a whole number from 0 to 30.');
  }

  let expireRule = current.expire_rule;
  if ('expire_rule' in value) {
    const v = value.expire_rule;
    if (typeof v === 'string' && (EXPIRE_RULES as string[]).includes(v)) expireRule = v as RoutineExpireRule;
    else errors.push(`\`expire_rule\` must be one of ${EXPIRE_RULES.join(', ')}.`);
  }

  let expireCount = current.expire_count;
  if ('expire_count' in value) {
    const v = Number(value.expire_count);
    if (Number.isInteger(v) && v >= 1 && v <= 99) expireCount = v;
    else errors.push('`expire_count` must be a whole number from 1 to 99.');
  }

  let expireUnit = current.expire_unit;
  if ('expire_unit' in value) {
    const v = value.expire_unit;
    if (typeof v === 'string' && (EXPIRE_UNITS as string[]).includes(v)) expireUnit = v as RoutineExpireUnit;
    else errors.push(`\`expire_unit\` must be one of ${EXPIRE_UNITS.join(', ')}.`);
  }

  let expireFrom = current.expire_from_time;
  if ('expire_from_time' in value) {
    const v = value.expire_from_time;
    if (v === null || v === '') expireFrom = null;
    else {
      const m = typeof v === 'string' ? v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/) : null;
      if (m && Number(m[1]) < 24 && Number(m[2]) < 60) expireFrom = `${m[1].padStart(2, '0')}:${m[2]}`;
      else errors.push('`expire_from_time` must be "HH:MM" or null.');
    }
  }

  let assignment = current.assignment;
  if ('assignment' in value) {
    const v = value.assignment;
    if (typeof v === 'string' && (ASSIGNMENTS as string[]).includes(v)) assignment = v as RoutineAssignment;
    else errors.push(`\`assignment\` must be ${ASSIGNMENTS.join(' or ')}.`);
  }

  let audienceType = current.audience_type;
  if ('audience_type' in value) {
    const v = value.audience_type;
    if (typeof v === 'string' && (AUDIENCE_TYPES as string[]).includes(v)) audienceType = v as RoutineAudienceType;
    else errors.push(`\`audience_type\` must be one of ${AUDIENCE_TYPES.join(', ')}.`);
  }

  let audienceAll = current.audience_all;
  if ('audience_all' in value) {
    const v = value.audience_all;
    if (typeof v === 'boolean') audienceAll = v;
    else errors.push('`audience_all` must be true or false.');
  }

  let assignedShifts = current.assigned_shifts;
  if ('assigned_shifts' in value) {
    const v = value.assigned_shifts;
    if (!Array.isArray(v)) errors.push('`assigned_shifts` must be a list.');
    else {
      const cleaned: string[] = [];
      v.forEach((entry) => {
        const code = String(entry).trim();
        if ((SHIFT_CODES as string[]).includes(code)) {
          if (!cleaned.includes(code)) cleaned.push(code);
        } else errors.push(`Unknown shift "${code}".`);
      });
      assignedShifts = cleaned;
    }
  }

  const fold = (s: string) => s.trim().toLowerCase();

  let departmentIds = current.assigned_department_ids;
  if ('assigned_department_ids' in value) {
    const v = value.assigned_department_ids;
    if (!Array.isArray(v)) errors.push('`assigned_department_ids` must be a list.');
    else {
      const resolved: number[] = [];
      v.forEach((entry) => {
        if (typeof entry === 'number' || (typeof entry === 'string' && /^\d+$/.test(String(entry).trim()))) {
          const id = Number(entry);
          if (context.departments.length && !context.departments.some((d) => d.id === id)) {
            errors.push(`No department has id ${id}.`);
          } else if (!resolved.includes(id)) resolved.push(id);
        } else if (typeof entry === 'string') {
          const match = context.departments.find((d) => fold(d.name) === fold(entry));
          if (match) {
            if (!resolved.includes(match.id)) resolved.push(match.id);
            warnings.push(`Matched department "${entry}" to ${match.name} (${match.id}).`);
          } else errors.push(`No department called "${entry}".`);
        } else errors.push('`assigned_department_ids` entries must be ids or names.');
      });
      departmentIds = resolved;
    }
  }

  let department = current.assigned_department;
  if ('assigned_department' in value) {
    const v = value.assigned_department;
    if (v === null || v === '') department = null;
    else if (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v.trim()))) {
      const id = Number(v);
      if (context.departments.length && !context.departments.some((d) => d.id === id)) {
        errors.push(`No department has id ${id}. Known: ${context.departments.map((d) => `${d.id} ${d.name}`).join(', ')}.`);
      } else department = id;
    } else if (typeof v === 'string') {
      const match = context.departments.find((d) => fold(d.name) === fold(v));
      if (match) {
        department = match.id;
        warnings.push(`Matched department "${v}" to ${match.name} (${match.id}).`);
      } else {
        errors.push(`No department called "${v}". Known: ${context.departments.map((d) => d.name).join(', ') || 'none'}.`);
      }
    } else errors.push('`assigned_department` must be an id, a department name, or null.');
  }

  let userIds = current.assigned_user_ids;
  if ('assigned_user_ids' in value) {
    const v = value.assigned_user_ids;
    if (!Array.isArray(v)) errors.push('`assigned_user_ids` must be a list.');
    else {
      const resolved: number[] = [];
      v.forEach((entry) => {
        if (typeof entry === 'number' || (typeof entry === 'string' && /^\d+$/.test(entry.trim()))) {
          const id = Number(entry);
          if (context.people.length && !context.people.some((p) => p.id === id)) {
            errors.push(`No person has id ${id}.`);
          } else resolved.push(id);
        } else if (typeof entry === 'string') {
          const match = context.people.find((p) => fold(p.name) === fold(entry));
          if (match) {
            resolved.push(match.id);
            warnings.push(`Matched "${entry}" to ${match.name} (${match.id}).`);
          } else errors.push(`No person called "${entry}".`);
        } else errors.push('`assigned_user_ids` entries must be ids or full names.');
      });
      userIds = [...new Set(resolved)];
    }
  }

  let blocking = current.is_blocking;
  if ('is_blocking' in value) {
    const v = value.is_blocking;
    if (typeof v === 'boolean') blocking = v;
    else errors.push('`is_blocking` must be true or false.');
  }

  let definition = current.definition;
  if ('definition' in value) {
    const parsed = parseDefinition(value.definition, errors, warnings);
    if (parsed) definition = parsed;
  }

  if ('assigned_department_ids' in value) {
    department = departmentIds[0] ?? null;
  } else if ('assigned_department' in value && department != null && !departmentIds.includes(department)) {
    departmentIds = [department];
  }

  if (errors.length) return { ok: false, error: errors.join(' ') };

  return {
    ok: true,
    warnings,
    doc: {
      format: ROUTINE_DOC_FORMAT,
      title,
      intro,
      trigger,
      due_time: dueTime,
      anchor_date: anchor,
      grace_days: grace,
      expire_rule: expireRule,
      expire_count: expireCount,
      expire_unit: expireUnit,
      expire_from_time: expireFrom,
      assignment,
      audience_type: audienceType,
      audience_all: audienceAll,
      assigned_shifts: assignedShifts,
      assigned_department_ids: departmentIds,
      assigned_department: department,
      assigned_user_ids: userIds,
      is_blocking: blocking,
      definition,
    },
  };
}

function parseDefinition(input: unknown, errors: string[], warnings: string[]): RoutineDefinition | null {
  // Accept either { sections: [...] } or a bare sections array.
  const sectionsRaw = Array.isArray(input) ? input : isRecord(input) ? input.sections : undefined;
  if (!Array.isArray(sectionsRaw)) {
    errors.push('`definition.sections` must be a list.');
    return null;
  }
  if (!sectionsRaw.length) {
    errors.push('A routine needs at least one section.');
    return null;
  }

  const seen = new Set<string>();
  const uniqueId = (wanted: unknown, prefix: string, label: string, index: number): string => {
    let id = typeof wanted === 'string' && wanted.trim() ? wanted.trim() : '';
    if (!id) {
      id = `${prefix}-${slug(label) || index + 1}`;
      warnings.push(`Gave "${label || `${prefix} ${index + 1}`}" the id ${id}.`);
    }
    let candidate = id;
    let n = 2;
    while (seen.has(candidate)) candidate = `${id}-${n++}`;
    if (candidate !== id) warnings.push(`Duplicate id ${id} renamed to ${candidate}.`);
    seen.add(candidate);
    return candidate;
  };

  const sections: RoutineSectionDef[] = [];
  sectionsRaw.forEach((sectionRaw, sIndex) => {
    if (!isRecord(sectionRaw)) {
      errors.push(`Section ${sIndex + 1} is not an object.`);
      return;
    }
    const title = typeof sectionRaw.title === 'string' ? sectionRaw.title.trim() : '';
    const checksRaw = sectionRaw.checks;
    if (!Array.isArray(checksRaw) || !checksRaw.length) {
      errors.push(`Section "${title || sIndex + 1}" needs at least one check.`);
      return;
    }
    const checks: RoutineCheckDef[] = [];
    checksRaw.forEach((checkRaw, cIndex) => {
      if (!isRecord(checkRaw)) {
        errors.push(`Check ${cIndex + 1} in "${title || sIndex + 1}" is not an object.`);
        return;
      }
      const label = typeof checkRaw.label === 'string' ? checkRaw.label.trim() : '';
      if (!label) errors.push(`Check ${cIndex + 1} in "${title || sIndex + 1}" has no label.`);
      let control: RoutineControl = 'pass_fail';
      if (checkRaw.control === undefined) {
        warnings.push(`"${label}" had no control; set to Pass / Fail / N/A.`);
      } else if (typeof checkRaw.control === 'string' && (CONTROLS as string[]).includes(checkRaw.control)) {
        control = checkRaw.control as RoutineControl;
      } else {
        errors.push(`"${label}" has an unknown control "${String(checkRaw.control)}".`);
      }
      const hint = typeof checkRaw.hint === 'string' ? checkRaw.hint.trim() : '';
      const labelEs = typeof checkRaw.label_es === 'string' ? checkRaw.label_es.trim() : '';
      const hintEs = typeof checkRaw.hint_es === 'string' ? checkRaw.hint_es.trim() : '';
      let unit = typeof checkRaw.unit === 'string' ? checkRaw.unit.trim() : '';
      if (unit && control !== 'number') {
        warnings.push(`Dropped the unit on "${label}" - only number checks carry one.`);
        unit = '';
      }
      checks.push({
        id: uniqueId(checkRaw.id, 'check', label, cIndex),
        label,
        label_es: labelEs,
        control,
        hint,
        hint_es: hintEs,
        unit,
        critical: checkRaw.critical === true,
        verify_prev: checkRaw.verify_prev === true,
      });
    });
    sections.push({
      id: uniqueId(sectionRaw.id, 'section', title, sIndex),
      title: title || `Section ${sIndex + 1}`,
      title_es: typeof sectionRaw.title_es === 'string' ? sectionRaw.title_es.trim() : '',
      checks,
    });
  });

  return { template_version: 1, sections };
}

/* ------------------------------------------------------------------- diff */

/** Plain sentences describing what applying `next` over `prev` would change. Empty when identical. */
export function summarizeChanges(
  prev: RoutineDoc,
  next: RoutineDoc,
  context: BriefContext = EMPTY_BRIEF_CONTEXT,
): string[] {
  const lines: string[] = [];
  const quote = (v: string) => `“${v || '-'}”`;
  const deptName = (id: number | null) =>
    id === null ? 'none' : (context.departments.find((d) => d.id === id)?.name ?? `#${id}`);
  const personName = (id: number) => context.people.find((p) => p.id === id)?.name ?? `#${id}`;

  if (prev.title !== next.title) lines.push(`Title ${quote(prev.title)} → ${quote(next.title)}`);
  if (prev.intro !== next.intro) lines.push('Intro line changed');

  const schedule: string[] = [];
  if (prev.trigger !== next.trigger) schedule.push(`${prev.trigger} → ${next.trigger}`);
  if (prev.due_time !== next.due_time) schedule.push(`due ${prev.due_time} → ${next.due_time}`);
  if (prev.anchor_date !== next.anchor_date) schedule.push(`next due ${prev.anchor_date ?? '-'} → ${next.anchor_date ?? '-'}`);
  if (prev.grace_days !== next.grace_days) schedule.push(`grace ${prev.grace_days} → ${next.grace_days} days`);
  if (prev.expire_rule !== next.expire_rule) schedule.push(`missed ${prev.expire_rule} → ${next.expire_rule}`);
  if (prev.expire_count !== next.expire_count || prev.expire_unit !== next.expire_unit) {
    schedule.push(`missed after ${prev.expire_count} ${prev.expire_unit} → ${next.expire_count} ${next.expire_unit}`);
  }
  if (prev.expire_from_time !== next.expire_from_time) {
    schedule.push(`hours start ${prev.expire_from_time ?? 'midnight'} → ${next.expire_from_time ?? 'midnight'}`);
  }
  if (schedule.length) lines.push(`Schedule: ${schedule.join(', ')}`);

  const owner: string[] = [];
  if (prev.assignment !== next.assignment) owner.push(`${prev.assignment} → ${next.assignment}`);
  if (prev.audience_type !== next.audience_type) owner.push(`type ${prev.audience_type} → ${next.audience_type}`);
  if (prev.audience_all !== next.audience_all) owner.push(next.audience_all ? 'All on' : 'All off');
  if (!sameNumbers(prev.assigned_department_ids, next.assigned_department_ids)) {
    owner.push(next.assigned_department_ids.length
      ? `departments → ${next.assigned_department_ids.map(deptName).join(', ')}`
      : 'no departments');
  }
  if (prev.assigned_shifts.join() !== next.assigned_shifts.join()) {
    owner.push(next.assigned_shifts.length
      ? `shifts → ${next.assigned_shifts.join(', ')}`
      : 'no shifts');
  }
  if (prev.assigned_department !== next.assigned_department) {
    owner.push(`department ${deptName(prev.assigned_department)} → ${deptName(next.assigned_department)}`);
  }
  if (!sameNumbers(prev.assigned_user_ids, next.assigned_user_ids)) {
    owner.push(next.assigned_user_ids.length
      ? `people → ${next.assigned_user_ids.map(personName).join(', ')}`
      : 'no named people');
  }
  if (prev.is_blocking !== next.is_blocking) owner.push(next.is_blocking ? 'now blocking' : 'no longer blocking');
  if (owner.length) lines.push(`Owner: ${owner.join(', ')}`);

  const prevSections = new Map(prev.definition.sections.map((s) => [s.id, s]));
  const nextSections = new Map(next.definition.sections.map((s) => [s.id, s]));
  const sectionsAdded = [...nextSections.keys()].filter((id) => !prevSections.has(id)).length;
  const sectionsRemoved = [...prevSections.keys()].filter((id) => !nextSections.has(id)).length;
  const sectionsRenamed = [...nextSections.values()].filter((s) => {
    const before = prevSections.get(s.id);
    return before !== undefined && before.title !== s.title;
  }).length;
  const sectionBits: string[] = [];
  if (sectionsAdded) sectionBits.push(`${sectionsAdded} added`);
  if (sectionsRemoved) sectionBits.push(`${sectionsRemoved} removed`);
  if (sectionsRenamed) sectionBits.push(`${sectionsRenamed} renamed`);
  if (sectionBits.length) lines.push(`Sections: ${sectionBits.join(', ')}`);

  const flatten = (doc: RoutineDoc) => new Map(
    doc.definition.sections.flatMap((s) => s.checks.map((c) => [c.id, { ...c, section: s.id }] as const)),
  );
  const prevChecks = flatten(prev);
  const nextChecks = flatten(next);
  let added = 0; let removed = 0; let edited = 0; let moved = 0;
  nextChecks.forEach((check, id) => {
    const before = prevChecks.get(id);
    if (!before) added += 1;
    else if (
      before.label !== check.label || before.control !== check.control
      || (before.hint || '') !== (check.hint || '') || (before.unit || '') !== (check.unit || '')
      || Boolean(before.critical) !== Boolean(check.critical)
    ) edited += 1;
    else if (before.section !== check.section) moved += 1;
  });
  prevChecks.forEach((_, id) => { if (!nextChecks.has(id)) removed += 1; });
  const orderChanged = added === 0 && removed === 0
    && [...prevChecks.keys()].join('|') !== [...nextChecks.keys()].join('|');
  const checkBits: string[] = [];
  if (added) checkBits.push(`${added} added`);
  if (removed) checkBits.push(`${removed} removed`);
  if (edited) checkBits.push(`${edited} edited`);
  if (moved) checkBits.push(`${moved} moved`);
  if (orderChanged) checkBits.push('reordered');
  if (checkBits.length) lines.push(`Checks: ${checkBits.join(', ')}`);

  return lines;
}

function sameNumbers(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}
