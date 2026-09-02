import type { RoutineDefinition, RoutineResponses } from '../../api/routines.api';

export function responsesFromDefinition(definition: RoutineDefinition | null | undefined): RoutineResponses {
  const sections = definition?.sections ?? [];
  return {
    template_version: definition?.template_version ?? 1,
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      checks: (section.checks ?? []).map((check) => ({
        id: check.id,
        label: check.label,
        control: check.control,
        hint: check.hint || '',
        unit: check.unit || '',
        critical: Boolean(check.critical),
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
