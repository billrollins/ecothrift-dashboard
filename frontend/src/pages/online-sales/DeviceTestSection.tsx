/**
 * Listing templates and the phone test (Dash Updates #51). The template picker, the test form staff fill in, and the
 * report as the shop shows it. The lists mirror apps/webstore/listing_templates.py (the server checks every value and
 * builds the shop's rows); keep the two in step.
 */
import { Box, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { DeviceReport, DeviceTest } from '../../api/webstore.api';

export const TEMPLATE_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'phone', label: 'Phone / device' },
];

// key, label, Bill's five (always on the report once tested)
const CHECKS: [string, string, boolean][] = [
  ['powers_on', 'Turns on', true],
  ['charges', 'Charges', true],
  ['holds_charge', 'Holds a charge', true],
  ['screen_touch', 'Screen and touch', false],
  ['buttons', 'Buttons', false],
  ['speaker_mic', 'Speaker and mic', false],
  ['cameras', 'Cameras', false],
  ['wifi', 'Wi-Fi', false],
];
const LOCKS: [string, string, boolean][] = [
  ['carrier_locked', 'Carrier locked?', true],
  ['demo_locked', 'Demo locked?', true],
  ['activation_locked', 'iCloud / Google lock on?', false],
];
const CARRIERS: [string, string][] = [
  ['att', 'AT&T'], ['verizon', 'Verizon'], ['tmobile', 'T-Mobile'], ['us_cellular', 'US Cellular'],
  ['cricket', 'Cricket'], ['metro', 'Metro'], ['boost', 'Boost'], ['straight_talk', 'Straight Talk'],
  ['tracfone', 'Tracfone'], ['visible', 'Visible'], ['mint', 'Mint'], ['other', 'Other'],
];

function Choice({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 1.5 }} alignItems={{ sm: 'center' }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }}>{label}</Typography>
      <ToggleButtonGroup size="small" exclusive value={value} onChange={(_, v: string | null) => v && onChange(v)}
        aria-label={label} color="primary" sx={{ flexShrink: 0 }}>
        {options.map(([v, l]) => (
          <ToggleButton key={v} value={v} sx={{ textTransform: 'none', px: 1.5, py: 0.4 }}>{l}</ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );
}

const PASS_FAIL: [string, string][] = [['pass', 'Pass'], ['fail', 'Fail'], ['not_checked', 'Not checked']];
const NO_YES: [string, string][] = [['no', 'No'], ['yes', 'Yes'], ['not_checked', 'Not checked']];

export function DeviceTestForm({ test, onChange, testedLine }: {
  test: DeviceTest;
  onChange: (next: DeviceTest) => void;
  testedLine: string | null;
}) {
  const set = (patch: DeviceTest) => onChange({ ...test, ...patch });
  const pick = (key: string) => String(test[key] || 'not_checked');
  const row = ([key, label]: [string, string, boolean], options: [string, string][]) => (
    <Choice key={key} label={label} value={pick(key)} options={options} onChange={(v) => set({ [key]: v })} />
  );
  return (
    <Stack spacing={1.75}>
      <Choice label="Did we test it?" value={test.tested ? 'yes' : 'no'} options={[['yes', 'Yes'], ['no', 'No']]}
        onChange={(v) => set({ tested: v === 'yes' })} />
      {!test.tested ? (
        <Typography variant="body2" color="text.secondary">No test report on the listing.</Typography>
      ) : (
        <>
          {testedLine ? <Typography variant="caption" color="text.secondary">{testedLine}</Typography> : null}
          <Typography variant="overline" sx={{ lineHeight: 1.5 }}>Always on the report</Typography>
          {CHECKS.filter((c) => c[2]).map((c) => row(c, PASS_FAIL))}
          {row(LOCKS[0], NO_YES)}
          {pick('carrier_locked') === 'yes' ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select size="small" label="Which carrier" value={test.carrier || ''} fullWidth
                onChange={(e) => set({ carrier: e.target.value })}>
                {CARRIERS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
              </TextField>
              {test.carrier === 'other' ? (
                <TextField size="small" label="Carrier name" value={test.carrier_other || ''} fullWidth
                  inputProps={{ maxLength: 40 }} onChange={(e) => set({ carrier_other: e.target.value })} />
              ) : null}
            </Stack>
          ) : null}
          {LOCKS.slice(1).filter((c) => c[2]).map((c) => row(c, NO_YES))}
          <Typography variant="overline" sx={{ lineHeight: 1.5, pt: 0.5 }}>Only shown when checked</Typography>
          {CHECKS.filter((c) => !c[2]).map((c) => row(c, PASS_FAIL))}
          {LOCKS.filter((c) => !c[2]).map((c) => row(c, NO_YES))}
          <Stack direction="row" spacing={2}>
            <TextField size="small" label="Battery health %" value={test.battery_health ?? ''} fullWidth
              inputProps={{ inputMode: 'numeric', maxLength: 3 }}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                set({ battery_health: digits === '' ? null : Math.min(100, Number(digits)) });
              }} />
            <TextField size="small" label="Storage" placeholder="128 GB" value={test.storage || ''} fullWidth
              inputProps={{ maxLength: 20 }} onChange={(e) => set({ storage: e.target.value })} />
          </Stack>
          <TextField size="small" label="Note for buyers" value={test.note || ''} fullWidth multiline minRows={2}
            inputProps={{ maxLength: 300 }} onChange={(e) => set({ note: e.target.value })} />
        </>
      )}
    </Stack>
  );
}

const MARK = { good: '✓', bad: '✗', none: '•' } as const;
const TONE = { good: 'success.main', bad: 'error.main', none: 'text.secondary' } as const;

/** The report as the shop shows it: a mark and words on every row, never colour alone. */
export function DeviceReportView({ report }: { report: DeviceReport }) {
  const on = report.tested_on
    ? new Date(`${report.tested_on}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1.5 }}>
      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Tested by Eco-Thrift{on ? ` on ${on}` : ''}</Typography>
      <Stack component="dl" sx={{ m: 0, mt: 1 }} spacing={0.5}>
        {report.rows.map((r) => (
          <Stack key={r.key} direction="row" spacing={1} sx={{ fontSize: 13 }}>
            <Box component="dt" sx={{ flex: 1, color: 'text.secondary' }}>{r.label}</Box>
            <Box component="dd" sx={{ m: 0, fontWeight: 700, color: TONE[r.tone] }}>
              <span aria-hidden>{MARK[r.tone]} </span>{r.result}
            </Box>
          </Stack>
        ))}
      </Stack>
      {report.note ? <Typography sx={{ fontSize: 13, mt: 1 }}>{report.note}</Typography> : null}
    </Box>
  );
}
