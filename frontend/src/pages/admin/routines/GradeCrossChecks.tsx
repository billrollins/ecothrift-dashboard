import { Box, Tooltip, Typography } from '@mui/material';
import ImageNotSupportedRounded from '@mui/icons-material/ImageNotSupportedRounded';
import { format, parseISO } from 'date-fns';
import type { AuditTaxonomy, CrossCheckRow, GradeLetter } from '../../../api/routines.api';
import { StatusTag } from '../../../components/duty/StatusTag';
import { dutyColors } from '../../../components/duty/tokens';
import { auditFindings, letterTone } from './gradeWeek';
import { GradeCard, GradeEmpty } from './gradeParts';

/**
 * The Tuesday audits, each with the wide shot that had to be taken before the
 * counters unlocked. The photo is the whole reason a zero can be trusted, so
 * it sits in the row rather than behind a click.
 */
export function GradeCrossChecks({
  rows,
  taxonomy,
  letters,
  loading,
}: {
  rows: CrossCheckRow[];
  taxonomy: AuditTaxonomy;
  letters: (score: number) => GradeLetter;
  loading: boolean;
}) {
  if (!rows.length) {
    return (
      <GradeEmpty>
        {loading ? ' ' : 'No cross-check was assigned this week. Check the Tuesday routine has section owners.'}
      </GradeEmpty>
    );
  }

  const labels = new Map(
    [...taxonomy.graded, ...taxonomy.recorded].map((entry) => [entry.key, entry.label]),
  );
  const flagLabels = new Map(taxonomy.flags.map((entry) => [entry.key, entry.label]));

  return (
    <>
      {rows.map((row) => {
        const done = row.status === 'done';
        const findings = auditFindings(row, labels);
        const letter = letters(row.score);
        return (
          <GradeCard key={row.run_id} tone={done ? 'plain' : 'warn'}>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Thumb photo={row.photo} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: dutyColors.ink }}>
                    {row.section_name || 'Unnamed section'}
                  </Typography>
                  <StatusTag
                    small
                    label={done ? `${letter} · ${row.score}` : 'Never done'}
                    tone={done ? letterTone(letter) : 'red'}
                  />
                </Box>
                <Typography noWrap sx={{ fontSize: 12, color: dutyColors.ink60 }}>
                  {row.auditor_name ?? 'Unassigned'}
                  {' · '}
                  {format(parseISO(row.date), 'EEE MMM d')}
                  {' · '}
                  {done ? `${row.items_inspected} items inspected` : 'no walk, scored zero'}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75, minHeight: 20 }}>
                  {row.flags.map((flag) => (
                    <StatusTag
                      key={flag}
                      small
                      label={flagLabels.get(flag) ?? flag}
                      tone={flag === taxonomy.safety_flag ? 'red' : 'amber'}
                    />
                  ))}
                  {findings.map((finding) => (
                    <Chip key={finding.label} label={`${finding.label}: ${finding.count}`} />
                  ))}
                  {done && !findings.length && !row.flags.length ? (
                    <Chip label="Nothing found" good />
                  ) : null}
                </Box>
                <Typography noWrap sx={{ mt: 0.5, fontSize: 12, color: dutyColors.ink60, minHeight: 18 }}>
                  {row.notes || (done ? 'No note left.' : ' ')}
                </Typography>
              </Box>
            </Box>
          </GradeCard>
        );
      })}
    </>
  );
}

function Chip({ label, good }: { label: string; good?: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        px: 0.9,
        height: 20,
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '6px',
        fontSize: 11,
        fontWeight: 650,
        color: good ? dutyColors.brandDark : dutyColors.ink60,
        bgcolor: good ? dutyColors.brandSoft : dutyColors.ink08,
      }}
    >
      {label}
    </Box>
  );
}

function Thumb({ photo }: { photo: string | null }) {
  return (
    <Tooltip title={photo ? 'The wide shot taken before the counters unlocked' : 'No photo on this audit'}>
      <Box
        sx={{
          width: 76,
          height: 76,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '10px',
          overflow: 'hidden',
          bgcolor: dutyColors.paper,
          border: `1px solid ${dutyColors.ink08}`,
          color: dutyColors.ink15,
        }}
      >
        {photo ? (
          <Box
            component="img"
            src={photo}
            alt="Section wide shot"
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <ImageNotSupportedRounded />
        )}
      </Box>
    </Tooltip>
  );
}
