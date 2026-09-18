import { Alert, Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { updateSetting } from '../../../api/core.api';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { useAuth } from '../../../hooks/useAuth';
import { useQaHistory, useQaPreview } from '../../../hooks/useRetailQa';
import { metaForKey } from './settingsRegistry';
import { SettingRow } from './SettingRow';
import { useAppSettings } from './useAppSettings';

const GROUPS: Array<{ title: string; blurb: string; keys: string[] }> = [
  {
    title: 'Baseline',
    blurb: 'How many walks make a normal aisle, and when a section is still warming up.',
    keys: [
      'retail_qa.baseline_window',
      'retail_qa.baseline_shrink',
      'retail_qa.warmup_section',
      'retail_qa.warmup_store',
    ],
  },
  {
    title: 'Cross',
    blurb: 'Tails, verify ladder, and which weekday the walk happens.',
    keys: [
      'retail_qa.cross_full_tail',
      'retail_qa.cross_zero_tail',
      'retail_qa.cross_check_weekday',
    ],
  },
  {
    title: 'Owner',
    blurb: 'Leftover R, grace, and how many drawn checks land in a spot.',
    keys: [
      'retail_qa.owner_grace',
      'retail_qa.owner_divisor_floor',
      'retail_qa.spot_check_count',
      'retail_qa.safety_cap',
    ],
  },
  {
    title: 'Checker flags',
    blurb: 'When a checker is pulled out of the baseline.',
    keys: [
      'retail_qa.flag_window',
      'retail_qa.flag_z',
      'retail_qa.flag_min_expected',
      'retail_qa.flag_followup_r',
      'retail_qa.flag_min_seconds',
      'retail_qa.flag_batch_minutes',
      'retail_qa.flag_rubber_stamp_window',
    ],
  },
  {
    title: 'Scoring',
    blurb: 'Spot, Do, and Cross shares. Missing parts renormalize to 100. Call-ins do not shrink expected.',
    keys: [
      'retail_qa.weight_spot',
      'retail_qa.weight_do',
      'retail_qa.weight_cross',
      'retail_qa.walk_floor',
      'retail_qa.section_due_after_punch_minutes',
    ],
  },
  {
    title: 'Register',
    blurb: 'When an idle register asks for a work cycle. Dismissals are logged; they do not change the grade.',
    keys: ['retail_qa.idle_prompt_minutes', 'retail_qa.idle_stretch_minutes'],
  },
];

type LadderRow = { cutoff: number; score: number };
type SeverityRow = { key: string; label: string; weight: number; r_add: number };

function asLadder(value: unknown): LadderRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => ({
    cutoff: Number((row as LadderRow).cutoff) || 0,
    score: Number((row as LadderRow).score) || 0,
  }));
}

function asSeverity(value: unknown): SeverityRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => ({
    key: String((row as SeverityRow).key || ''),
    label: String((row as SeverityRow).label || ''),
    weight: Number((row as SeverityRow).weight) || 1,
    r_add: Number((row as SeverityRow).r_add) || 0,
  }));
}

function thirdsLine(thirds: { doing: number | null; cross: number | null; owner: number | null }, letter: string | null) {
  return `Doing ${thirds.doing ?? '—'} · Cross ${thirds.cross ?? '—'} · Owner ${thirds.owner ?? '—'} → ${letter ?? '—'}`;
}

/**
 * The numbers behind the three-thirds Retail QA letter.
 *
 * Ladders and severity groups are tables. Everything else is a SettingRow.
 * Preview rescores this week in memory; Save writes the tables.
 */
export function RetailQaPanel() {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useAppSettings();
  const history = useQaHistory();
  const preview = useQaPreview();
  const isOwner = Boolean(user?.is_superuser);

  const rows = useMemo(() => new Map((settings ?? []).map((row) => [row.key, row])), [settings]);
  const [verifyLadder, setVerifyLadder] = useState<LadderRow[] | null>(null);
  const [ownerLadder, setOwnerLadder] = useState<LadderRow[] | null>(null);
  const [severity, setSeverity] = useState<SeverityRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  if (isLoading && !settings) return <LoadingScreen message="Loading Retail QA settings..." />;

  const liveVerify = asLadder(rows.get('retail_qa.verify_ladder')?.value);
  const liveOwner = asLadder(rows.get('retail_qa.owner_ladder')?.value);
  const liveSeverity = asSeverity(rows.get('retail_qa.severity_groups')?.value);
  const verify = verifyLadder ?? liveVerify;
  const owner = ownerLadder ?? liveOwner;
  const groups = severity ?? liveSeverity;

  function draftValues(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const row of settings ?? []) {
      if (row.key.startsWith('retail_qa.')) out[row.key] = row.value;
    }
    out['retail_qa.verify_ladder'] = verify;
    out['retail_qa.owner_ladder'] = owner;
    out['retail_qa.severity_groups'] = groups;
    return out;
  }

  async function saveTables() {
    setSaving(true);
    try {
      await updateSetting('retail_qa.verify_ladder', { value: verify });
      await updateSetting('retail_qa.owner_ladder', { value: owner });
      await updateSetting('retail_qa.severity_groups', { value: groups });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['routines', 'qa'] });
      enqueueSnackbar('Ladders saved', { variant: 'success' });
      setVerifyLadder(null);
      setOwnerLadder(null);
      setSeverity(null);
    } catch {
      enqueueSnackbar('Could not save the ladders', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function runPreview() {
    try {
      await preview.mutateAsync(draftValues());
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Preview failed', { variant: 'warning' });
    }
  }

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Week grade is Spot 60, Do 25, and Cross 15. Shifts are edited under Admin.
        Past weeks stay frozen under the settings they were scored with. Preview
        rescores this week only; it does not save.
      </Alert>

      {isOwner ? (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Preview this week</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Uses the numbers on this page, including unsaved ladders.
            </Typography>
            <Button size="small" variant="outlined" onClick={() => void runPreview()} disabled={preview.isPending}>
              {preview.isPending ? 'Scoring…' : 'Preview'}
            </Button>
            {preview.data ? (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="body2">Before: {thirdsLine(preview.data.before.thirds, preview.data.before.letter)}</Typography>
                <Typography variant="body2">After: {thirdsLine(preview.data.after.thirds, preview.data.after.letter)}</Typography>
              </Box>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {GROUPS.map((group) => (
        <Card key={group.title} sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{group.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{group.blurb}</Typography>
            {group.keys.map((key) => {
              const row = rows.get(key);
              const meta = metaForKey(key);
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
                  description={row.description as string | undefined}
                  meta={meta}
                />
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Verify ladder</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Fail count cutoff → score. Cutoffs rise; scores fall.
          </Typography>
          <LadderEditor rows={verify} onChange={setVerifyLadder} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 3 }}>Owner leftover ladder</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Residual R cutoff → score.
          </Typography>
          <LadderEditor rows={owner} onChange={setOwnerLadder} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 3 }}>Severity groups</Typography>
          <SeverityEditor rows={groups} onChange={setSeverity} />
          <Button sx={{ mt: 2 }} variant="contained" onClick={() => void saveTables()} disabled={saving}>
            Save ladders
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Audit log</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Who changed a Retail QA number, and from what to what.
          </Typography>
          {(history.data?.history ?? []).length ? history.data?.history.map((row) => (
            <Typography key={`${row.key}-${row.changed_at}`} variant="body2" sx={{ py: 0.4 }}>
              {row.changed_by || 'Someone'}
              {' · '}
              {row.changed_at ? format(parseISO(row.changed_at), 'MMM d h:mma') : ''}
              {' · '}
              {row.key.replace('retail_qa.', '')}
              {': '}
              {JSON.stringify(row.old_value)}
              {' → '}
              {JSON.stringify(row.new_value)}
            </Typography>
          )) : (
            <Typography variant="body2" color="text.secondary">No Retail QA changes yet.</Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

function LadderEditor({
  rows,
  onChange,
}: {
  rows: LadderRow[];
  onChange: (next: LadderRow[]) => void;
}) {
  return (
    <Box>
      {rows.map((row, index) => (
        <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <TextField
            size="small"
            label="Cutoff"
            type="number"
            value={row.cutoff}
            onChange={(e) => onChange(rows.map((item, i) => (
              i === index ? { ...item, cutoff: Number(e.target.value) } : item
            )))}
          />
          <TextField
            size="small"
            label="Score"
            type="number"
            value={row.score}
            onChange={(e) => onChange(rows.map((item, i) => (
              i === index ? { ...item, score: Number(e.target.value) } : item
            )))}
          />
        </Box>
      ))}
    </Box>
  );
}

function SeverityEditor({
  rows,
  onChange,
}: {
  rows: SeverityRow[];
  onChange: (next: SeverityRow[]) => void;
}) {
  return (
    <Box>
      {rows.map((row, index) => (
        <Box key={row.key || index} sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            label="Key"
            value={row.key}
            onChange={(e) => onChange(rows.map((item, i) => (
              i === index ? { ...item, key: e.target.value } : item
            )))}
          />
          <TextField
            size="small"
            label="Label"
            value={row.label}
            onChange={(e) => onChange(rows.map((item, i) => (
              i === index ? { ...item, label: e.target.value } : item
            )))}
          />
          <TextField
            size="small"
            label="Weight"
            type="number"
            value={row.weight}
            onChange={(e) => onChange(rows.map((item, i) => (
              i === index ? { ...item, weight: Number(e.target.value) } : item
            )))}
          />
          <TextField
            size="small"
            label="R add"
            type="number"
            value={row.r_add}
            onChange={(e) => onChange(rows.map((item, i) => (
              i === index ? { ...item, r_add: Number(e.target.value) } : item
            )))}
          />
        </Box>
      ))}
    </Box>
  );
}
