import { Box, Typography } from '@mui/material';
import type { AuditTaxonomy, SectionTallyResponses } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import {
  CounterRow,
  FlagChips,
  NotesField,
  PhotoButton,
  RunnerBand,
  RunnerBody,
  RunnerHead,
} from './runnerParts';

/**
 * The daily walk of your own sections.
 *
 * Nothing here is graded, and the runner says so out loud. The number is a
 * record of the work, not a verdict on it: an aisle that needs ten items put
 * back every morning is a staffing fact, not a personal failing, and the day
 * someone starts hiding that number is the day the tally stops being useful.
 */
export function SectionTallyRunner({
  title,
  responses,
  taxonomy,
  onChange,
  readOnly,
}: {
  title: string;
  responses: SectionTallyResponses;
  taxonomy: AuditTaxonomy;
  onChange?: (next: SectionTallyResponses) => void;
  readOnly?: boolean;
}) {
  const rows = responses.sections || [];
  const touched = rows.filter((row) => (
    Object.values(row.counts || {}).some((n) => n > 0) || row.flags.length > 0 || row.notes
  )).length;

  function patch(index: number, patchRow: Partial<SectionTallyResponses['sections'][number]>) {
    onChange?.({
      ...responses,
      sections: rows.map((row, i) => (i === index ? { ...row, ...patchRow } : row)),
    });
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: dutyColors.paper }}>
      <RunnerHead
        title={title}
        subject={rows.map((row) => row.section_name).join(', ')}
        progress={rows.length ? touched / rows.length : 0}
        progressLabel={rows.length ? `${touched} of ${rows.length} walked` : 'No section yet'}
      />
      <RunnerBody>
        <Box sx={{ mx: 1.25, mt: 1.25, mb: 0.5, px: 1.5, py: 1, borderRadius: '10px', bgcolor: dutyColors.brandTint, border: `1px solid ${dutyColors.brandSoft}` }}>
          <Typography sx={{ fontSize: 12.5, color: dutyColors.brandDark, lineHeight: 1.45 }}>
            None of this counts against you. It is a record of what your section
            needs, so a busy corner of the store can be staffed like one.
          </Typography>
        </Box>

        {rows.length ? rows.map((row, index) => (
          <Box key={row.section_id}>
            <RunnerBand
              title={row.section_name}
              hint="What you had to put right this morning."
            />
            {taxonomy.graded.concat(taxonomy.recorded).map((category) => (
              <CounterRow
                key={category.key}
                label={category.label}
                value={row.counts[category.key] || 0}
                disabled={readOnly}
                onChange={(next) => patch(index, {
                  counts: { ...row.counts, [category.key]: Math.max(next, 0) },
                })}
              />
            ))}
            <FlagChips
              options={taxonomy.flags}
              active={row.flags}
              disabled={readOnly}
              onToggle={(key) => patch(index, {
                flags: row.flags.includes(key)
                  ? row.flags.filter((f) => f !== key)
                  : [...row.flags, key],
              })}
            />
            <PhotoButton
              photo={row.photo}
              disabled={readOnly}
              label="Photo, if something needs showing"
              onPhoto={(dataUrl) => patch(index, { photo: dataUrl })}
            />
            <NotesField
              value={row.notes}
              disabled={readOnly}
              onChange={(notes) => patch(index, { notes })}
            />
          </Box>
        )) : (
          <Box sx={{ mx: 1.25, mt: 2, px: 1.5, py: 2, borderRadius: '10px', border: `1px dashed ${dutyColors.ink15}` }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: dutyColors.ink }}>
              You do not keep a section yet
            </Typography>
            <Typography sx={{ mt: 0.5, fontSize: 12.5, color: dutyColors.ink60 }}>
              Ask for one to be assigned in Routine Control, under Sections.
            </Typography>
          </Box>
        )}
      </RunnerBody>
    </Box>
  );
}
