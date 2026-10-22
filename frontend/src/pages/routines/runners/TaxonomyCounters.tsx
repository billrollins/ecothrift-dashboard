import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import QrCodeScannerOutlined from '@mui/icons-material/QrCodeScannerOutlined';
import type { AuditCounts, AuditTaxonomy, TaxonomyGroup } from '../../../api/routines.api';
import type { BadTagReason, BadTagWhere } from '../../../api/badTags.api';
import BadTagDialog from '../../../components/badTags/BadTagDialog';
import { pick } from '../../../i18n/routines';
import { dutyColors } from '../../../components/duty/tokens';
import { CounterRow, FlagChips, RunnerBand } from './runnerParts';

/** PR-cart tag rows that can scan the tag: the tally stays the count, the scan is the record. */
const TAG_ROWS: Record<string, BadTagReason[]> = {
  reprice_tag_incorrect: ['retail_high', 'wrong_item', 'price_high', 'price_low'],
  reprice_tag_missing: ['missing'],
};

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
  badTagWhere,
}: {
  taxonomy: AuditTaxonomy;
  counts: AuditCounts;
  flags: string[];
  disabled?: boolean;
  language?: string | null;
  onCount: (key: string, value: number) => void;
  onFlag: (key: string) => void;
  /** Set on section checks and cross-checks: the tag rows offer "Scan the tag" (bad-tag record, PR Fix-it). */
  badTagWhere?: BadTagWhere;
}) {
  const groups = groupsFrom(taxonomy);
  const [scanning, setScanning] = useState<string | null>(null);

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
              <Box key={item.key}>
                <CounterRow
                  graded={group.solution === 'fix_in_place' || group.solution === 'security' || group.solution === 'reshelf_cart' || group.solution === 'reprep_cart'}
                  label={pick(item, 'label', language) || item.label}
                  value={counts[item.key] || 0}
                  disabled={disabled}
                  onChange={(next) => onCount(item.key, next)}
                />
                {badTagWhere && TAG_ROWS[item.key] && !disabled && (
                  <Button
                    size="small"
                    startIcon={<QrCodeScannerOutlined />}
                    onClick={() => setScanning(item.key)}
                    sx={{ mx: 1.25, mt: -0.25, mb: 0.75, fontWeight: 700, color: dutyColors.brandDark }}
                  >
                    {language === 'es' ? 'Escanear la etiqueta (cuenta +1)' : 'Scan the tag (counts +1)'}
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        );
      })}
      {badTagWhere && scanning && (
        <BadTagDialog
          open
          where={badTagWhere}
          reasons={scanning ? TAG_ROWS[scanning] : undefined}
          initialReason={scanning === 'reprice_tag_missing' ? 'missing' : undefined}
          onClose={() => setScanning(null)}
          onSaved={() => {
            if (scanning) onCount(scanning, (counts[scanning] || 0) + 1);
          }}
        />
      )}
    </>
  );
}
