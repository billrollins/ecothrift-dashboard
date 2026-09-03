import { Box } from '@mui/material';
import type { AuditTaxonomy, SectionAuditResponses } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { RunnerBody, RunnerHead } from './runnerParts';
import { SectionAuditFields } from './SectionAuditFields';
import { issuesFound } from './runnerStatus';

export function SectionAuditRunner({
  title,
  subject,
  responses,
  taxonomy,
  onChange,
  readOnly,
}: {
  title: string;
  subject: string;
  responses: SectionAuditResponses;
  taxonomy: AuditTaxonomy;
  onChange?: (next: SectionAuditResponses) => void;
  readOnly?: boolean;
}) {
  const found = issuesFound('section_audit', responses);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: dutyColors.paper }}>
      <RunnerHead
        title={title}
        subject={responses.section_name || subject}
        progress={1}
        progressLabel={found ? `${found} logged` : 'Count what you fix'}
      />
      <RunnerBody>
        <SectionAuditFields
          audit={responses}
          taxonomy={taxonomy}
          readOnly={readOnly}
          onChange={(next) => onChange?.(next)}
        />
      </RunnerBody>
    </Box>
  );
}
