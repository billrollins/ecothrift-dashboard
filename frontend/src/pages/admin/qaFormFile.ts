/**
 * QA form file export/import helpers.
 *
 * Export produces a portable JSON or YAML document of a form's editable
 * fields. Import parses either format (JSON tried first, then YAML), checks
 * the shape, and fills in any missing section/check ids so hand-written or
 * AI-generated files don't need to invent them. Server-side validation
 * (apps/pos/quality_audit_controls.validate_definition) still runs on save.
 */
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import {
  QA_CONTROL_CATALOG,
  type QaControlKind,
  type QaFormDefinition,
  type QaFormDefinitionCheck,
  type QaFormDefinitionSection,
  type QualityAuditForm,
} from '../../types/qualityAudit.types';

export interface QaFormFile {
  /** Document marker so stray files are rejected early */
  kind: 'ecothrift-qa-form';
  slug: string;
  title: string;
  intro: string;
  icon: string;
  is_active: boolean;
  definition: QaFormDefinition;
}

const VALID_CONTROLS = new Set<string>(QA_CONTROL_CATALOG.map((m) => m.value));

let importIdCounter = 0;
function importId(prefix: string): string {
  importIdCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${importIdCounter}`;
}

export function qaFormToFileObject(form: {
  slug: string;
  title: string;
  intro: string;
  icon: string;
  is_active: boolean;
  definition: QaFormDefinition;
}): QaFormFile {
  return {
    kind: 'ecothrift-qa-form',
    slug: form.slug,
    title: form.title,
    intro: form.intro,
    icon: form.icon,
    is_active: form.is_active,
    definition: form.definition,
  };
}

export function serializeQaForm(file: QaFormFile, format: 'json' | 'yaml'): string {
  if (format === 'json') return `${JSON.stringify(file, null, 2)}\n`;
  return yamlDump(file, { lineWidth: 100, noRefs: true });
}

export function downloadQaForm(form: QualityAuditForm, format: 'json' | 'yaml') {
  const text = serializeQaForm(qaFormToFileObject(form), format);
  const blob = new Blob([text], { type: format === 'json' ? 'application/json' : 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qa-form-${form.slug || 'untitled'}.${format === 'json' ? 'json' : 'yaml'}`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ParsedQaFormFile {
  file: QaFormFile;
  sectionCount: number;
  checkCount: number;
}

/** Parse and normalize a JSON/YAML QA form document. Throws Error with a readable message. */
export function parseQaFormFile(text: string): ParsedQaFormFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    try {
      raw = yamlLoad(text);
    } catch {
      throw new Error('File is neither valid JSON nor valid YAML.');
    }
  }
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('File must contain a single form object.');
  }
  const doc = raw as Record<string, unknown>;
  // Accept both the exported wrapper and a bare {title, definition} document,
  // but reject files that are clearly something else.
  if (doc.kind != null && doc.kind !== 'ecothrift-qa-form') {
    throw new Error(`Not a QA form file (kind: ${String(doc.kind)}).`);
  }
  const definitionRaw = doc.definition ?? { sections: doc.sections };
  if (definitionRaw == null || typeof definitionRaw !== 'object') {
    throw new Error('Missing "definition" (or top-level "sections").');
  }
  const definition = normalizeDefinition(definitionRaw as Record<string, unknown>);
  const title = typeof doc.title === 'string' ? doc.title.trim() : '';
  if (!title) throw new Error('Form "title" is required.');

  const file: QaFormFile = {
    kind: 'ecothrift-qa-form',
    slug: typeof doc.slug === 'string' ? doc.slug.trim() : '',
    title,
    intro: typeof doc.intro === 'string' ? doc.intro : '',
    icon: typeof doc.icon === 'string' ? doc.icon : '',
    is_active: doc.is_active !== false,
    definition,
  };
  return {
    file,
    sectionCount: definition.sections.length,
    checkCount: definition.sections.reduce((sum, s) => sum + s.checks.length, 0),
  };
}

function normalizeDefinition(raw: Record<string, unknown>): QaFormDefinition {
  const sectionsRaw = raw.sections;
  if (!Array.isArray(sectionsRaw) || sectionsRaw.length === 0) {
    throw new Error('Definition needs at least one section.');
  }
  const sections: QaFormDefinitionSection[] = sectionsRaw.map((sectionRaw, si) => {
    if (sectionRaw == null || typeof sectionRaw !== 'object') {
      throw new Error(`Section ${si + 1} must be an object.`);
    }
    const section = sectionRaw as Record<string, unknown>;
    const title = typeof section.title === 'string' ? section.title.trim() : '';
    if (!title) throw new Error(`Section ${si + 1}: "title" is required.`);
    const checksRaw = section.checks;
    if (!Array.isArray(checksRaw) || checksRaw.length === 0) {
      throw new Error(`Section ${si + 1} ("${title}"): needs at least one check.`);
    }
    const checks: QaFormDefinitionCheck[] = checksRaw.map((checkRaw, ci) => {
      if (checkRaw == null || typeof checkRaw !== 'object') {
        throw new Error(`Section "${title}", check ${ci + 1}: must be an object.`);
      }
      const check = checkRaw as Record<string, unknown>;
      const label = typeof check.label === 'string' ? check.label.trim() : '';
      if (!label) throw new Error(`Section "${title}", check ${ci + 1}: "label" is required.`);
      const control = typeof check.control === 'string' ? check.control.trim().toLowerCase() : 'yesno';
      if (!VALID_CONTROLS.has(control)) {
        throw new Error(
          `Section "${title}", check "${label}": unknown control "${control}". ` +
          `Valid: ${[...VALID_CONTROLS].join(', ')}.`,
        );
      }
      const optionsRaw = check.options;
      const options = Array.isArray(optionsRaw)
        ? optionsRaw.filter((o): o is string => typeof o === 'string' && o.trim() !== '')
        : [];
      return {
        id: typeof check.id === 'string' && check.id.trim() ? check.id.trim() : importId('chk'),
        label,
        control: control as QaControlKind,
        hint: typeof check.hint === 'string' ? check.hint : '',
        options,
      };
    });
    return {
      id: typeof section.id === 'string' && section.id.trim() ? section.id.trim() : importId('sec'),
      title,
      intro: typeof section.intro === 'string' ? section.intro : '',
      icon: typeof section.icon === 'string' ? section.icon : '',
      checks,
    };
  });

  // De-duplicate ids (the backend rejects duplicates outright)
  const seen = new Set<string>();
  for (const section of sections) {
    if (seen.has(section.id)) section.id = importId('sec');
    seen.add(section.id);
    const seenChecks = new Set<string>();
    for (const check of section.checks) {
      if (seenChecks.has(check.id)) check.id = importId('chk');
      seenChecks.add(check.id);
    }
  }

  const version = typeof raw.template_version === 'number' ? raw.template_version : 1;
  return { template_version: version, sections };
}
