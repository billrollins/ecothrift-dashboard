import { Box, MenuItem, TextField, Typography } from '@mui/material';
import type {
  AuditTaxonomy,
  NonShelfCheck,
  WorkCycleResponses,
} from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import {
  CounterRow,
  FlagChips,
  NotesField,
  PhotoButton,
  RunnerBand,
  RunnerBody,
  RunnerCard,
  RunnerHead,
  runnerFieldSx,
} from './runnerParts';
import { runnerBlockers } from './runnerStatus';

export function emptyWorkCycle(): WorkCycleResponses {
  return {
    mode: '',
    shelf: {
      section_id: null,
      section_name: '',
      counts: {},
      flags: [],
      photo: null,
      photo_file_id: null,
      notes: '',
    },
    non_shelf: { done: [], notes: '' },
  };
}

/**
 * A log of one walk: shelf (section + counters) or non-shelf (ticks from
 * Opening and Closing). Not graded. The point is that it happened.
 */
export function WorkCycleRunner({
  title,
  responses,
  taxonomy,
  sections,
  nonShelfChecks,
  onChange,
  readOnly,
}: {
  title: string;
  responses: WorkCycleResponses;
  taxonomy: AuditTaxonomy;
  sections: Array<{ id: number; name: string }>;
  nonShelfChecks: NonShelfCheck[];
  onChange?: (next: WorkCycleResponses) => void;
  readOnly?: boolean;
}) {
  const mode = responses.mode;
  const blockers = runnerBlockers('work_cycle', responses, 0);
  const shelf = responses.shelf;
  const done = new Set(responses.non_shelf.done);

  function pickMode(next: 'shelf' | 'non_shelf') {
    onChange?.({ ...responses, mode: next });
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: dutyColors.paper }}>
      <RunnerHead
        title={title}
        subject={mode === 'shelf' ? (shelf.section_name || 'Shelf check') : mode === 'non_shelf' ? 'Non-shelf check' : 'Pick a walk'}
        progress={mode ? (blockers.length ? 0.4 : 1) : 0}
        progressLabel={blockers[0] || 'Ready to submit'}
      />
      <RunnerBody>
        <RunnerBand title="What did you do?" hint="One walk, then submit. Start another whenever you need to." />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mx: 1.25, mb: 1 }}>
          <ModeTile
            label="Shelf check"
            hint="Pick a section and log what you put right."
            active={mode === 'shelf'}
            disabled={readOnly}
            onClick={() => pickMode('shelf')}
          />
          <ModeTile
            label="Non-shelf check"
            hint="The leftover of Opening and Closing."
            active={mode === 'non_shelf'}
            disabled={readOnly}
            onClick={() => pickMode('non_shelf')}
          />
        </Box>

        {mode === 'shelf' ? (
          <>
            <RunnerBand title="Which section" hint="The aisle you just walked." />
            <RunnerCard>
              {sections.length ? (
                <TextField
                  select
                  size="small"
                  fullWidth
                  label="Section"
                  value={shelf.section_id ?? ''}
                  disabled={readOnly}
                  onChange={(e) => {
                    const id = e.target.value === '' ? null : Number(e.target.value);
                    const name = sections.find((row) => row.id === id)?.name || '';
                    onChange?.({
                      ...responses,
                      shelf: { ...shelf, section_id: id, section_name: name },
                    });
                  }}
                  sx={runnerFieldSx}
                >
                  <MenuItem value="">Pick a section</MenuItem>
                  {sections.map((row) => (
                    <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>
                  ))}
                </TextField>
              ) : (
                <Typography sx={{ fontSize: 13, color: dutyColors.ink60 }}>
                  No sections set up yet. Add them in Routine Control, Sections.
                </Typography>
              )}
            </RunnerCard>
            {taxonomy.graded.concat(taxonomy.recorded).map((category) => (
              <CounterRow
                key={category.key}
                label={category.label}
                value={shelf.counts[category.key] || 0}
                disabled={readOnly || !shelf.section_id}
                onChange={(next) => onChange?.({
                  ...responses,
                  shelf: { ...shelf, counts: { ...shelf.counts, [category.key]: Math.max(next, 0) } },
                })}
              />
            ))}
            <FlagChips
              options={taxonomy.flags}
              active={shelf.flags}
              disabled={readOnly || !shelf.section_id}
              onToggle={(key) => onChange?.({
                ...responses,
                shelf: {
                  ...shelf,
                  flags: shelf.flags.includes(key)
                    ? shelf.flags.filter((item) => item !== key)
                    : [...shelf.flags, key],
                },
              })}
            />
            <PhotoButton
              photo={shelf.photo}
              disabled={readOnly || !shelf.section_id}
              onPhoto={(photo) => onChange?.({ ...responses, shelf: { ...shelf, photo } })}
            />
            <NotesField
              value={shelf.notes}
              disabled={readOnly || !shelf.section_id}
              onChange={(notes) => onChange?.({ ...responses, shelf: { ...shelf, notes } })}
            />
          </>
        ) : null}

        {mode === 'non_shelf' ? (
          <>
            <RunnerBand title="What you put right" hint="Tick what you did. A note is enough if none of these fit." />
            {nonShelfChecks.length ? nonShelfChecks.map((check) => {
              const key = `${check.routine_key}:${check.check_id}`;
              const on = done.has(key);
              return (
                <Box
                  key={key}
                  component="button"
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    const next = new Set(done);
                    if (on) next.delete(key);
                    else next.add(key);
                    onChange?.({
                      ...responses,
                      non_shelf: { ...responses.non_shelf, done: [...next] },
                    });
                  }}
                  sx={{
                    width: 'calc(100% - 20px)',
                    mx: 1.25,
                    mb: 0.75,
                    px: 1.5,
                    py: 1.15,
                    textAlign: 'left',
                    font: 'inherit',
                    cursor: readOnly ? 'default' : 'pointer',
                    borderRadius: '10px',
                    border: `1px solid ${on ? dutyColors.brand : dutyColors.ink15}`,
                    bgcolor: on ? dutyColors.brandTint : dutyColors.card,
                  }}
                >
                  <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: dutyColors.ink40 }}>
                    {check.routine_title}
                  </Typography>
                  <Typography sx={{ fontSize: 14.5, fontWeight: 600, color: dutyColors.ink }}>
                    {check.label}
                  </Typography>
                </Box>
              );
            }) : (
              <RunnerCard>
                <Typography sx={{ fontSize: 13, color: dutyColors.ink60 }}>
                  Opening and Closing need checks before a non-shelf list can be built.
                </Typography>
              </RunnerCard>
            )}
            <NotesField
              value={responses.non_shelf.notes}
              disabled={readOnly}
              placeholder="What else you did"
              onChange={(notes) => onChange?.({
                ...responses,
                non_shelf: { ...responses.non_shelf, notes },
              })}
            />
          </>
        ) : null}
      </RunnerBody>
    </Box>
  );
}

function ModeTile({
  label,
  hint,
  active,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onClick={onClick}
      sx={{
        px: 1.25,
        py: 1.35,
        textAlign: 'left',
        font: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: '12px',
        border: `1.5px solid ${active ? dutyColors.brand : dutyColors.ink15}`,
        bgcolor: active ? dutyColors.brandTint : dutyColors.card,
        minHeight: 84,
      }}
    >
      <Typography sx={{ fontSize: 14.5, fontWeight: 800, color: dutyColors.ink }}>{label}</Typography>
      <Typography sx={{ mt: 0.35, fontSize: 11.5, color: dutyColors.ink60, lineHeight: 1.35 }}>{hint}</Typography>
    </Box>
  );
}
