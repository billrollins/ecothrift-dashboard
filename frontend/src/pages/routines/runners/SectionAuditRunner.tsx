import { Box } from '@mui/material';
import type { AuditTaxonomy, SectionAuditResponses } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { RunnerBody, RunnerHead } from './runnerParts';
import { SectionAuditFields } from './SectionAuditFields';
import { auditBlockers } from './runnerStatus';

export function SectionAuditRunner({
  title,
  subject,
  responses,
  taxonomy,
  minItems,
  onChange,
  readOnly,
}: {
  title: string;
  subject: string;
  responses: SectionAuditResponses;
  taxonomy: AuditTaxonomy;
  minItems: number;
  onChange?: (next: SectionAuditResponses) => void;
  readOnly?: boolean;
}) {
  const blockers = auditBlockers(responses, minItems);
  // Two gates, then the walk itself. Progress reads as thirds so the photo and
  // the item count feel like part of the job rather than paperwork before it.
  const done = 2 - blockers.length;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: dutyColors.paper }}>
      <RunnerHead
        title={title}
        subject={responses.section_name || subject}
        progress={done / 2}
        progressLabel={blockers.length ? blockers[0] : 'Count what you fix'}
      />
      <RunnerBody>
        <SectionAuditFields
          audit={responses}
          taxonomy={taxonomy}
          minItems={minItems}
          readOnly={readOnly}
          onChange={(next) => onChange?.(next)}
        />
      </RunnerBody>
    </Box>
  );
}
