import { Box, Typography } from '@mui/material';
import type { AuditTaxonomy, OwnerSpotResponses } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { RunnerBand, RunnerBody, RunnerCard, RunnerHead } from './runnerParts';
import { SectionAuditFields } from './SectionAuditFields';
import { ChoiceRow } from './ChoiceRow';
import { runnerBlockers } from './runnerStatus';

/**
 * The owner's daily look: two checks pulled at random out of Open, Day, and
 * Close, then one section walked end to end.
 *
 * The sample is drawn when the run is created, not when it is opened, so it
 * cannot be refreshed until it lands on an easy pair.
 */
export function OwnerSpotRunner({
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
  responses: OwnerSpotResponses;
  taxonomy: AuditTaxonomy;
  minItems: number;
  onChange?: (next: OwnerSpotResponses) => void;
  readOnly?: boolean;
}) {
  const checks = responses.checks || [];
  const answered = checks.filter((check) => check.result).length;
  const blockers = runnerBlockers('owner_spot', responses, minItems);
  const steps = checks.length + 2;
  const done = answered + (responses.audit?.photo ? 1 : 0)
    + ((responses.audit?.items_inspected || 0) >= minItems ? 1 : 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: dutyColors.paper }}>
      <RunnerHead
        title={title}
        subject={responses.audit?.section_name || subject}
        progress={steps ? done / steps : 0}
        progressLabel={blockers.length ? blockers[0] : 'Ready to submit'}
      />
      <RunnerBody>
        <RunnerBand
          title="Drawn at random today"
          hint="Two checks out of Open, Day, and Close. Go and look."
        />
        {checks.length ? checks.map((check, index) => (
          <RunnerCard
            key={`${check.routine_key}:${check.check_id}`}
            tone={check.result === 'fail' ? 'warn' : check.result ? 'good' : 'plain'}
          >
            <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: dutyColors.ink40 }}>
              {check.routine_title}
            </Typography>
            <Typography sx={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.3, color: dutyColors.ink }}>
              {check.label}
            </Typography>
            <ChoiceRow
              value={check.result}
              allowNa
              disabled={readOnly}
              onChange={(result) => onChange?.({
                ...responses,
                checks: checks.map((row, i) => (i === index ? { ...row, result } : row)),
              })}
            />
          </RunnerCard>
        )) : (
          <RunnerCard>
            <Typography sx={{ fontSize: 13, color: dutyColors.ink60 }}>
              Nothing to draw from yet. The Open, Day, and Close checklists need
              checks in them before a sample can be taken.
            </Typography>
          </RunnerCard>
        )}

        {responses.audit?.section_id ? (
          <SectionAuditFields
            audit={responses.audit}
            taxonomy={taxonomy}
            minItems={minItems}
            readOnly={readOnly}
            onChange={(audit) => onChange?.({ ...responses, audit })}
          />
        ) : (
          <RunnerCard>
            <Typography sx={{ fontSize: 13, color: dutyColors.ink60 }}>
              No sections set up yet. Add them in Routine Control, Sections.
            </Typography>
          </RunnerCard>
        )}
      </RunnerBody>
    </Box>
  );
}
