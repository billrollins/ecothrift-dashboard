import { Box, Typography } from '@mui/material';
import type { AuditTaxonomy, OwnerSpotResponses } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { emptyAudit, SectionAuditFields } from './SectionAuditFields';
import { RunnerBand, RunnerBody, RunnerCard, RunnerHead } from './runnerParts';
import { ChoiceRow } from './ChoiceRow';
import { runnerBlockers } from './runnerStatus';
import type { WalkAction } from './SectionWalkFields';

/**
 * The owner's daily look: two checks pulled at random out of Open, Day, and
 * Close, then one section walked the same way as Daily Check and Tuesday.
 */
export function OwnerSpotRunner({
  title,
  subject,
  responses,
  taxonomy,
  onChange,
  readOnly,
  reroll,
}: {
  title: string;
  subject: string;
  responses: OwnerSpotResponses;
  taxonomy: AuditTaxonomy;
  onChange?: (next: OwnerSpotResponses) => void;
  readOnly?: boolean;
  reroll?: WalkAction;
}) {
  const checks = responses.checks || [];
  const answered = checks.filter((check) => check.result).length;
  const blockers = runnerBlockers('owner_spot', responses, 0);
  const audit = responses.audit || emptyAudit(null, '');
  const hasSection = Boolean(audit.section_id);
  const action: WalkAction | undefined = reroll
    ? { onClick: reroll.onClick, disabled: reroll.disabled || !hasSection }
    : undefined;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: dutyColors.paper }}>
      <RunnerHead
        title={title}
        subject={hasSection ? (audit.section_name || subject) : 'NO SECTIONS LEFT TO CHECK'}
        progress={checks.length ? answered / checks.length : 1}
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

        {hasSection ? (
          <SectionAuditFields
            audit={audit}
            taxonomy={taxonomy}
            readOnly={readOnly}
            action={action}
            onChange={(next) => onChange?.({ ...responses, audit: next })}
          />
        ) : (
          <RunnerBand
            title="NO SECTIONS LEFT TO CHECK"
            hint="Every aisle has had a look this week."
            action={action ? { label: 'Choose another', onClick: action.onClick, disabled: true } : undefined}
          />
        )}
      </RunnerBody>
    </Box>
  );
}
