import type { RoutineDefinition, RoutineResponses } from '../../api/routines.api';

export function responsesFromDefinition(definition: RoutineDefinition | null | undefined): RoutineResponses {
  const sections = definition?.sections ?? [];
  return {
    template_version: definition?.template_version ?? 1,
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      title_es: section.title_es || '',
      checks: (section.checks ?? []).map((check) => ({
        id: check.id,
        label: check.label,
        label_es: check.label_es || '',
        control: check.control,
        hint: check.hint || '',
        hint_es: check.hint_es || '',
        unit: check.unit || '',
        critical: Boolean(check.critical),
        verify_prev: Boolean(check.verify_prev),
        result: '',
        value: null,
        photo: null,
        photo_file_id: null,
        notes: '',
        touched: false,
      })),
    })),
  };
}
