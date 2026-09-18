import { Box, Typography } from '@mui/material';
import type { AuditTaxonomy, OwnerSpotResponses, SpotScoreCard } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { emptyAudit, SectionAuditFields } from './SectionAuditFields';
import { RunnerBand, RunnerBody, RunnerCard, RunnerHead } from './runnerParts';
import { ChoiceRow } from './ChoiceRow';
import { runnerBlockers } from './runnerStatus';
import type { WalkAction } from './SectionWalkFields';

/**
 * The owner's daily look: three checks pulled at random out of Open, Day,
 * and Close, then one section that has already been tallied today.
 */
export function OwnerSpotRunner({
  title,
  subject,
  responses,
  taxonomy,
  onChange,
  readOnly,
  reroll,
  spotState,
  tallyLine,
  scoreCard,
}: {
  title: string;
  subject: string;
  responses: OwnerSpotResponses;
  taxonomy: AuditTaxonomy;
  onChange?: (next: OwnerSpotResponses) => void;
  readOnly?: boolean;
  reroll?: WalkAction;
  spotState?: 'waiting' | 'ready' | null;
  tallyLine?: string;
  scoreCard?: SpotScoreCard | null;
}) {
  const checks = responses.checks || [];
  const answered = checks.filter((check) => check.result).length;
  const blockers = runnerBlockers('owner_spot', responses, 0);
  const audit = responses.audit || emptyAudit(null, '');
  const hasSection = Boolean(audit.section_id);
  const waiting = spotState === 'waiting' || !hasSection;
  const action: WalkAction | undefined = reroll
    ? { onClick: reroll.onClick, disabled: reroll.disabled || waiting }
    : undefined;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: dutyColors.paper }}>
      <RunnerHead
        title={title}
        subject={waiting ? 'Waiting on a tally' : (audit.section_name || subject)}
        progress={checks.length ? answered / checks.length : 1}
        progressLabel={waiting ? 'Nothing tallied yet, check back later' : (blockers.length ? blockers[0] : 'Ready to submit')}
      />
      <RunnerBody>
        {scoreCard ? (
          <RunnerCard tone="good">
            <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: dutyColors.ink40 }}>
              Spot score
            </Typography>
            <Typography sx={{ fontSize: 28, fontWeight: 750, color: dutyColors.ink, fontVariantNumeric: 'tabular-nums' }}>
              {scoreCard.spot_score}
            </Typography>
            <Typography sx={{ fontSize: 13, color: dutyColors.ink60, mt: 0.5 }}>
              {scoreCard.explanation}
            </Typography>
          </RunnerCard>
        ) : null}

        <RunnerBand
          title="Drawn at random today"
          hint="Three checks out of Open, Day, and Close. Go and look."
        />
        {checks.length ? checks.map((check, index) => (
          <RunnerCard
            key={`${check.routine_key}:${check.check_id}`}
            tone={check.result === 'fail' ? 'warn' : check.result ? 'good' : 'plain'}
          >
            <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: dutyColors.ink40 }}>
              {check.routine_title}
              {check.severity && check.severity !== 'standard' ? ` · ${check.severity}` : ''}
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

        {waiting ? (
          <RunnerBand
            title="Nothing tallied yet, check back later"
            hint="The owner walk only opens after a section has been tallied or cross-checked today."
            action={action ? { label: 'Switch', onClick: action.onClick, disabled: true } : undefined}
          />
        ) : (
          <>
            <RunnerBand
              title={audit.section_name || subject}
              hint={tallyLine || 'Walk the aisle the same way as Daily Check.'}
              action={action ? { label: 'Switch', onClick: action.onClick, disabled: action.disabled } : undefined}
            />
            <SectionAuditFields
              audit={audit}
              taxonomy={taxonomy}
              readOnly={readOnly}
              onChange={(next) => onChange?.({ ...responses, audit: next })}
            />
          </>
        )}
      </RunnerBody>
    </Box>
  );
}
