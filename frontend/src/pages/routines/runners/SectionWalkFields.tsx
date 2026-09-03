import type { AuditTaxonomy } from '../../../api/routines.api';
import { useAuth } from '../../../hooks/useAuth';
import { NotesField, PhotoButton, RunnerBand } from './runnerParts';
import { TaxonomyCounters } from './TaxonomyCounters';

export type WalkAction = {
  onClick: () => void;
  disabled?: boolean;
};

/**
 * The section walk Daily Check, Tuesday, and Owner all share: name, counters,
 * optional photo, notes. No item count. No photo lock.
 */
export function SectionWalkFields({
  title,
  hint,
  counts,
  flags,
  photo,
  notes,
  taxonomy,
  readOnly,
  onCount,
  onFlag,
  onPhoto,
  onNotes,
  action,
}: {
  title: string;
  hint?: string;
  counts: Record<string, number>;
  flags: string[];
  photo: string | null;
  notes: string;
  taxonomy: AuditTaxonomy;
  readOnly?: boolean;
  onCount: (key: string, value: number) => void;
  onFlag: (key: string) => void;
  onPhoto: (dataUrl: string) => void;
  onNotes: (notes: string) => void;
  action?: WalkAction;
}) {
  const { user } = useAuth();
  return (
    <>
      <RunnerBand
        title={title}
        hint={hint}
        action={action ? { label: 'Choose another', ...action } : undefined}
      />
      <TaxonomyCounters
        taxonomy={taxonomy}
        counts={counts}
        flags={flags}
        disabled={readOnly}
        language={user?.language}
        onCount={onCount}
        onFlag={onFlag}
      />
      <PhotoButton
        photo={photo}
        disabled={readOnly}
        label="Photo, if something needs showing"
        onPhoto={onPhoto}
      />
      <NotesField
        value={notes}
        disabled={readOnly}
        onChange={onNotes}
      />
    </>
  );
}
