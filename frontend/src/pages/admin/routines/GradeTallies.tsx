import { Box, Tooltip, Typography } from '@mui/material';
import type { AuditTaxonomy, TallyTotals } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { GradeEmpty } from './gradeParts';
import { tallyGrid } from './gradeWeek';

/**
 * What the daily walks turned up, per section, for the week. None of it is
 * graded. It is here to answer a different question than the letter does:
 * which corner of the store keeps generating work.
 */
export function GradeTallies({
  tallies,
  taxonomy,
  loading,
}: {
  tallies: TallyTotals[];
  taxonomy: AuditTaxonomy;
  loading: boolean;
}) {
  const grid = tallyGrid(tallies, [...taxonomy.graded, ...taxonomy.recorded]);

  if (!grid.rows.length) {
    return (
      <GradeEmpty>
        {loading ? ' ' : 'No section walks have been submitted this week.'}
      </GradeEmpty>
    );
  }

  const head = {
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: dutyColors.ink40,
  };

  return (
    <Box sx={{ mx: 2.5, mb: 1, borderRadius: '12px', bgcolor: dutyColors.card, border: `1px solid ${dutyColors.ink08}`, overflowX: 'auto' }}>
      <Box sx={{ minWidth: 320 + grid.keys.length * 54 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, px: 1.75, pt: 1.25, pb: 0.75, borderBottom: `1px solid ${dutyColors.ink08}` }}>
          <Typography sx={{ ...head, flex: 1, minWidth: 140 }}>Section</Typography>
          <Typography sx={{ ...head, width: 44, textAlign: 'right' }}>Walks</Typography>
          {grid.keys.map((entry) => (
            <Tooltip key={entry.key} title={entry.label}>
              <Typography noWrap sx={{ ...head, width: 54, textAlign: 'right' }}>
                {shortLabel(entry.label)}
              </Typography>
            </Tooltip>
          ))}
          <Typography sx={{ ...head, width: 48, textAlign: 'right' }}>All</Typography>
        </Box>
        {grid.rows.map(({ row, total }) => (
          <Box
            key={`${row.section_id}-${row.section_name}`}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.75, py: 0.85, borderBottom: `1px solid ${dutyColors.ink08}`, '&:last-of-type': { borderBottom: 'none' } }}
          >
            <Typography noWrap sx={{ flex: 1, minWidth: 140, fontSize: 13, fontWeight: 600, color: dutyColors.ink }}>
              {row.section_name || 'Unnamed section'}
            </Typography>
            <Cell value={row.walks} muted />
            {grid.keys.map((entry) => (
              <Cell key={entry.key} value={row.counts[entry.key] ?? 0} />
            ))}
            <Cell value={total} strong />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function Cell({ value, muted, strong }: { value: number; muted?: boolean; strong?: boolean }) {
  return (
    <Typography
      sx={{
        width: strong ? 48 : muted ? 44 : 54,
        flexShrink: 0,
        textAlign: 'right',
        fontSize: 13,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: strong ? 750 : 500,
        color: value === 0 ? dutyColors.ink15 : strong ? dutyColors.ink : dutyColors.ink60,
      }}
    >
      {value}
    </Typography>
  );
}

/** Column heads have to fit; the full sentence lives in the tooltip. */
function shortLabel(label: string): string {
  const words = label.replace(/^(Items|Tags|Spots) /i, '').split(' ');
  return words[0].replace(/[:,]$/, '');
}
