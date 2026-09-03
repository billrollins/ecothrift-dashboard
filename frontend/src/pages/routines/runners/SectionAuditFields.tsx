import type { AuditTaxonomy, SectionAuditResponses } from '../../../api/routines.api';
import { SectionWalkFields, type WalkAction } from './SectionWalkFields';

export function emptyAudit(sectionId: number | null, sectionName: string): SectionAuditResponses {
  return {
    section_id: sectionId,
    section_name: sectionName,
    photo: null,
    photo_file_id: null,
    items_inspected: 0,
    counts: {},
    flags: [],
    notes: '',
  };
}

/**
 * One section walk, shared by Tuesday and the owner's spot check.
 */
export function SectionAuditFields({
  audit,
  taxonomy,
  onChange,
  readOnly,
  action,
}: {
  audit: SectionAuditResponses;
  taxonomy: AuditTaxonomy;
  onChange: (next: SectionAuditResponses) => void;
  readOnly?: boolean;
  action?: WalkAction;
}) {
  return (
    <SectionWalkFields
      title={audit.section_name || 'Section'}
      hint="What you had to put right."
      counts={audit.counts}
      flags={audit.flags}
      photo={audit.photo}
      notes={audit.notes}
      taxonomy={taxonomy}
      readOnly={readOnly}
      action={action}
      onCount={(key, value) => onChange({
        ...audit, counts: { ...audit.counts, [key]: Math.max(value, 0) },
      })}
      onFlag={(key) => {
        const on = audit.flags.includes(key);
        onChange({
          ...audit,
          flags: on ? audit.flags.filter((item) => item !== key) : [...audit.flags, key],
        });
      }}
      onPhoto={(photo) => onChange({ ...audit, photo })}
      onNotes={(notes) => onChange({ ...audit, notes })}
    />
  );
}
