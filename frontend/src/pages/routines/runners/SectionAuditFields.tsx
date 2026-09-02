import { Box, TextField, Typography } from '@mui/material';
import type { AuditTaxonomy, SectionAuditResponses } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import {
  CounterRow,
  FlagChips,
  NotesField,
  PhotoButton,
  RunnerBand,
  runnerFieldSx,
} from './runnerParts';

export function emptyAudit(sectionId: number | null, sectionName: string): SectionAuditResponses {
  return {
    section_id: sectionId,
    section_name: sectionName,
    photo: null,
    photo_file_id: null,
    items_inspected: 0,
    counts: {},
    flags: [],
    notes: '',
  };
}

/**
 * The body of a cross-check, shared by the Tuesday audit and the owner's spot
 * check so both are counted the same way.
 *
 * Two guards live here, and both are deliberate friction. The photo gates the
 * counters, because a wide shot is hard to fake from the break room. The items
 * inspected floor exists because "zero issues" is only meaningful if somebody
 * actually looked at a shelf's worth of stock.
 */
export function SectionAuditFields({
  audit,
  taxonomy,
  minItems,
  onChange,
  readOnly,
}: {
  audit: SectionAuditResponses;
  taxonomy: AuditTaxonomy;
  minItems: number;
  onChange: (next: SectionAuditResponses) => void;
  readOnly?: boolean;
}) {
  const locked = readOnly || !audit.photo;
  const shortOfItems = (audit.items_inspected || 0) < minItems;

  function setCount(key: string, value: number) {
    onChange({ ...audit, counts: { ...audit.counts, [key]: Math.max(value, 0) } });
  }

  function toggleFlag(key: string) {
    const on = audit.flags.includes(key);
    onChange({ ...audit, flags: on ? audit.flags.filter((f) => f !== key) : [...audit.flags, key] });
  }

  return (
    <>
      <RunnerBand
        title="Start with a photo"
        hint="A wide shot of the section, before you touch anything."
      />
      <PhotoButton
        photo={audit.photo}
        disabled={readOnly}
        onPhoto={(dataUrl) => onChange({ ...audit, photo: dataUrl })}
      />

      <RunnerBand
        title="How much did you look at"
        hint={`At least ${minItems} items. Zero issues on four is not an audit.`}
      />
      <Box sx={{ mx: 1.25, mb: 1 }}>
        <TextField
          type="number"
          value={audit.items_inspected || ''}
          onChange={(e) => onChange({ ...audit, items_inspected: Math.max(Number(e.target.value) || 0, 0) })}
          disabled={locked}
          fullWidth
          size="small"
          placeholder="Roughly how many items"
          sx={runnerFieldSx}
          inputProps={{ min: 0, style: { height: 46, boxSizing: 'border-box', fontSize: 17, fontWeight: 600 } }}
        />
        <Typography
          sx={{
            mt: 0.5,
            fontSize: 11.5,
            minHeight: 16,
            color: shortOfItems ? dutyColors.red : dutyColors.ink40,
          }}
        >
          {locked
            ? 'Take the photo first.'
            : shortOfItems
              ? `${minItems - (audit.items_inspected || 0)} more before this counts.`
              : 'Enough to say something about the section.'}
        </Typography>
      </Box>

      <RunnerBand
        title="What you had to put right"
        hint="These are the owner's job, so these are what the score reads."
      />
      {taxonomy.graded.map((category) => (
        <CounterRow
          key={category.key}
          graded
          label={category.label}
          value={audit.counts[category.key] || 0}
          disabled={locked}
          onChange={(next) => setCount(category.key, next)}
        />
      ))}

      <RunnerBand
        title="Also worth recording"
        hint="Churn and product condition. Logged, never scored."
      />
      {taxonomy.recorded.map((category) => (
        <CounterRow
          key={category.key}
          label={category.label}
          value={audit.counts[category.key] || 0}
          disabled={locked}
          onChange={(next) => setCount(category.key, next)}
        />
      ))}

      <RunnerBand title="Flags" hint="A safety problem caps the section, however tidy the rest is." />
      <FlagChips
        options={taxonomy.flags}
        active={audit.flags}
        disabled={locked}
        onToggle={toggleFlag}
      />

      <RunnerBand title="Notes" hint="Optional. Context the counts cannot carry." />
      <NotesField
        value={audit.notes}
        disabled={locked}
        onChange={(notes) => onChange({ ...audit, notes })}
      />
    </>
  );
}
