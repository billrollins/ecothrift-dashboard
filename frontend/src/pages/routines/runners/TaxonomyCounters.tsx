import { Box, Typography } from '@mui/material';
import type { AuditCounts, AuditTaxonomy, TaxonomyGroup } from '../../../api/routines.api';
import { pick } from '../../../i18n/routines';
import { dutyColors } from '../../../components/duty/tokens';
import { CounterRow, FlagChips, RunnerBand } from './runnerParts';

function groupsFrom(taxonomy: AuditTaxonomy): TaxonomyGroup[] {
  if (taxonomy.groups?.length) return taxonomy.groups;
  return [
    { key: 'graded', solution: 'fix_in_place', label: 'What you had to put right', items: taxonomy.graded },
    { key: 'recorded', solution: 'pr_cart', label: 'Also worth recording', items: taxonomy.recorded },
    { key: 'flags', solution: 'flag', label: 'Flags', items: taxonomy.flags },
  ];
}

export function TaxonomyCounters({
  taxonomy,
  counts,
  flags,
  disabled,
  language,
  onCount,
  onFlag,
}: {
  taxonomy: AuditTaxonomy;
  counts: AuditCounts;
  flags: string[];
  disabled?: boolean;
  language?: string | null;
  onCount: (key: string, value: number) => void;
  onFlag: (key: string) => void;
}) {
  const groups = groupsFrom(taxonomy);

  return (
    <>
      {groups.map((group) => {
        if (group.solution === 'flag') {
          return (
            <Box key={group.key}>
              <RunnerBand
                title={pick(group, 'label', language) || group.label}
                hint="A safety problem caps the section, however tidy the rest is."
              />
              <FlagChips
                options={group.items.map((item) => ({
                  key: item.key,
                  label: pick(item, 'label', language) || item.label,
                }))}
                active={flags}
                disabled={disabled}
                onToggle={onFlag}
              />
            </Box>
          );
        }
        if (group.solution === 'just_do') {
          return (
            <Box key={group.key}>
              <RunnerBand
                title={pick(group, 'label', language) || group.label}
                hint="Corrected, not recorded."
              />
              {group.items.map((item) => (
                <Box
                  key={item.key}
                  sx={{
                    mx: 1.25,
                    mb: 0.75,
                    px: 1.5,
                    py: 1.1,
                    minHeight: 44,
                    borderRadius: '10px',
                    border: `1px dashed ${dutyColors.ink15}`,
                    bgcolor: dutyColors.card,
                  }}
                >
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: dutyColors.ink }}>
                    {pick(item, 'label', language) || item.label}
                  </Typography>
                  <Typography sx={{ fontSize: 11.5, color: dutyColors.ink40, minHeight: 16 }}>
                    {language === 'es' ? 'Hazlo y sigue. No se cuenta.' : 'Just do this. Do not count it.'}
                  </Typography>
                </Box>
              ))}
            </Box>
          );
        }
        return (
          <Box key={group.key}>
            <RunnerBand
              title={pick(group, 'label', language) || group.label}
              hint={group.solution === 'fix_in_place' || group.solution === 'security' || group.solution === 'reshelf_cart' || group.solution === 'reprep_cart'
                ? 'The owner should have caught this.'
                : 'Logged, never scored.'}
            />
            {group.items.map((item) => (
              <CounterRow
                key={item.key}
                graded={group.solution === 'fix_in_place' || group.solution === 'security' || group.solution === 'reshelf_cart' || group.solution === 'reprep_cart'}
                label={pick(item, 'label', language) || item.label}
                value={counts[item.key] || 0}
                disabled={disabled}
                onChange={(next) => onCount(item.key, next)}
              />
            ))}
          </Box>
        );
      })}
    </>
  );
}
