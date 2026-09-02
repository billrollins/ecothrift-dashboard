import { Alert } from '@mui/material';
import type {
  AnyRoutineResponses,
  AuditTaxonomy,
  OwnerSpotResponses,
  RoutineKind,
  RoutineResponses,
  SectionAuditResponses,
  SectionTallyResponses,
  VerifyContext,
} from '../../../api/routines.api';
import { RoutineRunner } from '../RoutineRunner';
import { OwnerSpotRunner } from './OwnerSpotRunner';
import { SectionAuditRunner } from './SectionAuditRunner';
import { SectionTallyRunner } from './SectionTallyRunner';

/**
 * One entry point for every routine shape. The page above stays ignorant of
 * kinds: it owns the draft, the save, and the footer, and hands the body here.
 */
export function KindRunner({
  kind,
  title,
  subject,
  responses,
  taxonomy,
  verify,
  minItems,
  onChange,
  readOnly,
}: {
  kind: RoutineKind;
  title: string;
  subject: string;
  responses: AnyRoutineResponses;
  taxonomy: AuditTaxonomy | null;
  verify: VerifyContext | null;
  minItems: number;
  onChange?: (next: AnyRoutineResponses) => void;
  readOnly?: boolean;
}) {
  if (kind === 'checklist') {
    return (
      <RoutineRunner
        title={title}
        subject={subject}
        responses={responses as RoutineResponses}
        verify={verify}
        hideFooter
        readOnly={readOnly}
        onChange={onChange}
      />
    );
  }
  if (!taxonomy) {
    return <Alert severity="error" sx={{ m: 2 }}>This routine is missing its category list.</Alert>;
  }
  if (kind === 'section_tally') {
    return (
      <SectionTallyRunner
        title={title}
        responses={responses as SectionTallyResponses}
        taxonomy={taxonomy}
        readOnly={readOnly}
        onChange={onChange}
      />
    );
  }
  if (kind === 'section_audit') {
    return (
      <SectionAuditRunner
        title={title}
        subject={subject}
        responses={responses as SectionAuditResponses}
        taxonomy={taxonomy}
        minItems={minItems}
        readOnly={readOnly}
        onChange={onChange}
      />
    );
  }
  return (
    <OwnerSpotRunner
      title={title}
      subject={subject}
      responses={responses as OwnerSpotResponses}
      taxonomy={taxonomy}
      minItems={minItems}
      readOnly={readOnly}
      onChange={onChange}
    />
  );
}
