import { describe, expect, it } from 'vitest';
import {
  buildAiBrief,
  extractJsonText,
  parseRoutineDoc,
  ROUTINE_DOC_FORMAT,
  summarizeChanges,
  type RoutineDoc,
} from './routineJson';

const current: RoutineDoc = {
  format: ROUTINE_DOC_FORMAT,
  title: 'Retail - Opening',
  intro: 'Before doors open',
  trigger: 'daily',
  due_time: '10:30',
  anchor_date: null,
  grace_days: 0,
  assignment: 'pooled',
  assigned_role: 'Staff',
  assigned_department: 3,
  assigned_user_ids: [7, 9],
  subject_pool: [],
  is_blocking: false,
  definition: {
    template_version: 1,
    sections: [{
      id: 'section-1',
      title: 'Front of house',
      checks: [
        { id: 'check-1', label: 'Unlock doors', control: 'pass_fail', hint: '', unit: '', critical: false },
        { id: 'check-2', label: 'Fridge temp', control: 'number', hint: '', unit: '°F', critical: true },
      ],
    }],
  },
};

describe('buildAiBrief', () => {
  it('carries the current data, the field guide, and a place to type the ask', () => {
    const brief = buildAiBrief(current);
    expect(brief).toContain('"title": "Retail - Opening"');
    expect(brief).toContain(ROUTINE_DOC_FORMAT);
    expect(brief).toContain('Keep the `id`');
    expect(brief.trimEnd().endsWith('## What I want changed')).toBe(true);
    expect(brief).toContain('Never use an em dash');
  });

  it('has a create mode that calls the form a starting point and asks for fresh ids', () => {
    const brief = buildAiBrief(current, 'create');
    expect(brief).toContain('Never use an em dash');
    expect(brief).toContain('new routine brief');
    expect(brief).toContain('## Starting point');
    expect(brief).toContain('placeholders');
    expect(brief).not.toContain('Never renumber');
    expect(brief.trimEnd().endsWith('## What this routine should cover')).toBe(true);
  });
});

describe('extractJsonText', () => {
  it('prefers a fenced block over surrounding prose', () => {
    const text = 'Sure! Here you go:\n```json\n{"title":"A"}\n```\nLet me know.';
    expect(extractJsonText(text)).toBe('{"title":"A"}');
  });
  it('falls back to the outermost braces', () => {
    expect(extractJsonText('Result: {"a":{"b":1}} done')).toBe('{"a":{"b":1}}');
  });
  it('returns null when there is nothing to parse', () => {
    expect(extractJsonText('   ')).toBeNull();
    expect(extractJsonText('no braces here')).toBeNull();
  });
});

describe('parseRoutineDoc', () => {
  it('merges a partial document over the current routine', () => {
    const result = parseRoutineDoc('{"title":"Retail - Opening v2","grace_days":1}', current);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.title).toBe('Retail - Opening v2');
    expect(result.doc.grace_days).toBe(1);
    expect(result.doc.trigger).toBe('daily');
    expect(result.doc.definition).toEqual(current.definition);
  });

  it('accepts a full document pasted back with prose around it', () => {
    const next = { ...current, definition: {
      sections: [{
        id: 'section-1',
        title: 'Front of house',
        checks: [
          { id: 'check-1', label: 'Unlock doors', control: 'pass_fail' },
          { label: 'Turn on signage', control: 'pass_fail', hint: 'Both windows', critical: false },
        ],
      }],
    } };
    const result = parseRoutineDoc(`Here is the update:\n\`\`\`json\n${JSON.stringify(next)}\n\`\`\``, current);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const checks = result.doc.definition.sections[0].checks;
    expect(checks).toHaveLength(2);
    expect(checks[0].id).toBe('check-1');
    expect(checks[1].id).toBe('check-turn-on-signage');
    expect(checks[1].hint).toBe('Both windows');
    expect(result.warnings.some((w) => w.includes('check-turn-on-signage'))).toBe(true);
  });

  it('rejects bad enums and empty labels with a readable message', () => {
    const result = parseRoutineDoc('{"trigger":"fortnightly"}', current);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/trigger/);

    const empty = parseRoutineDoc(
      '{"definition":{"sections":[{"id":"s","title":"S","checks":[{"id":"c","label":"","control":"text"}]}]}}',
      current,
    );
    expect(empty.ok).toBe(false);
  });

  it('rejects things that are not a routine at all', () => {
    expect(parseRoutineDoc('{"foo":1}', current).ok).toBe(false);
    expect(parseRoutineDoc('{"title": ', current).ok).toBe(false);
    expect(parseRoutineDoc('[1,2]', current).ok).toBe(false);
  });

  it('drops a unit on a non-number check and de-duplicates ids', () => {
    const result = parseRoutineDoc(JSON.stringify({
      definition: { sections: [{ id: 's', title: 'S', checks: [
        { id: 'c', label: 'A', control: 'text', unit: 'kg' },
        { id: 'c', label: 'B', control: 'number', unit: 'kg' },
      ] }] },
    }), current);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [a, b] = result.doc.definition.sections[0].checks;
    expect(a.unit).toBe('');
    expect(b.id).toBe('c-2');
    expect(b.unit).toBe('kg');
  });

  it('normalises due_time and clears an anchor when the trigger is not bi-weekly', () => {
    const result = parseRoutineDoc('{"due_time":"9:05:00","anchor_date":"2026-09-10"}', current);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.due_time).toBe('09:05');
    expect(result.doc.anchor_date).toBeNull();
  });
});

describe('parseRoutineDoc with people and departments', () => {
  const context = {
    departments: [{ id: 3, name: 'Retail' }, { id: 4, name: 'Processing' }],
    people: [
      { id: 7, name: 'Ana Reyes', role: 'Manager', department: 'Retail' },
      { id: 9, name: 'Ben Ito', role: 'Employee', department: 'Retail' },
    ],
  };

  it('lists departments and people in the brief with the pooled-department recipe', () => {
    const brief = buildAiBrief(current, 'create', context);
    expect(brief).toContain('- 3 - Retail');
    expect(brief).toContain('- 7 - Ana Reyes (Manager, Retail)');
    expect(brief).toContain('"assigned_department": <that id>');
  });

  it('resolves a department name and a person name to ids', () => {
    const result = parseRoutineDoc(
      '{"assigned_department":"retail","assigned_user_ids":["Ben Ito", 7]}',
      current,
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.assigned_department).toBe(3);
    expect(result.doc.assigned_user_ids).toEqual([9, 7]);
    expect(result.warnings.some((w) => w.includes('Retail (3)'))).toBe(true);
  });

  it('rejects unknown departments and ids when it knows the lists', () => {
    const byName = parseRoutineDoc('{"assigned_department":"Bakery"}', current, context);
    expect(byName.ok).toBe(false);
    if (!byName.ok) expect(byName.error).toContain('Retail, Processing');
    const byId = parseRoutineDoc('{"assigned_department":99}', current, context);
    expect(byId.ok).toBe(false);
    const person = parseRoutineDoc('{"assigned_user_ids":[42]}', current, context);
    expect(person.ok).toBe(false);
  });

  it('names the department in the change summary', () => {
    const next = { ...current, assigned_department: 4, assigned_user_ids: [] };
    const lines = summarizeChanges(current, next, context);
    expect(lines.find((l) => l.startsWith('Owner'))).toBe('Owner: department Retail → Processing, no named people');
  });
});

describe('summarizeChanges', () => {
  it('is empty when nothing changed', () => {
    expect(summarizeChanges(current, structuredClone(current))).toEqual([]);
  });

  it('counts checks by id and names the headline fields', () => {
    const next: RoutineDoc = structuredClone(current);
    next.title = 'Retail - Opening v2';
    next.trigger = 'weekly';
    next.definition.sections[0].checks[0].label = 'Unlock both doors';
    next.definition.sections[0].checks.push({ id: 'check-3', label: 'Lights', control: 'pass_fail' });
    next.definition.sections[0].checks.splice(1, 1);
    const lines = summarizeChanges(current, next);
    expect(lines[0]).toContain('Title');
    expect(lines.find((l) => l.startsWith('Schedule'))).toContain('daily → weekly');
    expect(lines.find((l) => l.startsWith('Checks'))).toBe('Checks: 1 added, 1 removed, 1 edited');
  });
});
