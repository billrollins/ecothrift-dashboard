import { Alert, Box, Card, CardContent, Typography } from '@mui/material';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { metaForKey } from './settingsRegistry';
import { SettingRow } from './SettingRow';
import { useAppSettings } from './useAppSettings';

/**
 * The numbers behind the retail letter grade.
 *
 * Grouped the way an argument about a grade actually goes: how the day is
 * weighed, where the letters cut, and what counts as a real audit. Every row
 * here moves the standard for everyone from the next materialize onward, so
 * each one says what it does rather than restating its own name.
 */
const GROUPS: Array<{ title: string; blurb: string; keys: string[] }> = [
  {
    title: 'Weights',
    blurb: 'How the parts of a day and a week combine.',
    keys: ['retail_qa.owner_weight', 'retail_qa.weekly_daily_weight', 'retail_qa.late_credit'],
  },
  {
    title: 'Letters',
    blurb: 'Where each grade starts. Below the D line is an F.',
    keys: ['retail_qa.grade_a', 'retail_qa.grade_b', 'retail_qa.grade_c', 'retail_qa.grade_d'],
  },
  {
    title: 'Cross-checks',
    blurb: 'What an audit has to do before it counts, and how its findings score.',
    keys: [
      'retail_qa.audit_min_items',
      'retail_qa.audit_minor_max',
      'retail_qa.audit_needs_work_max',
      'retail_qa.spot_check_count',
    ],
  },
  {
    title: 'Register',
    blurb: 'When an idle register asks for a work cycle. Dismissals are logged; they do not change the grade.',
    keys: ['retail_qa.idle_prompt_minutes'],
  },
];

export function RetailQaPanel() {
  const { data: settings, isLoading } = useAppSettings();

  if (isLoading && !settings) return <LoadingScreen message="Loading Retail QA settings..." />;

  const rows = new Map((settings ?? []).map((row) => [row.key, row]));

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        A day is the three checklists plus the owner spot check when one happened. A week is the
        average of its days plus the Tuesday cross-checks. Daily section walks are recorded but never
        scored, so a busy aisle is not held against the person who keeps it.
      </Alert>
      {GROUPS.map((group) => (
        <Card key={group.title} sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {group.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {group.blurb}
            </Typography>
            {group.keys.map((key) => {
              const row = rows.get(key);
              const meta = metaForKey(key);
              // A key the seed migration has not reached yet still has a label
              // and a default in code, so name it rather than hiding the gap.
              if (!row) {
                return (
                  <Box key={key} sx={{ py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle1">{meta.label}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Not in the database yet. The built-in default is in use.
                    </Typography>
                  </Box>
                );
              }
              return (
                <SettingRow
                  key={key}
                  settingKey={key}
                  value={row.value}
                  description={typeof row.description === 'string' ? row.description : undefined}
                  meta={meta}
                />
              );
            })}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
