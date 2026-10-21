/**
 * The Settings page's pieces that are not one setting per row (owner, 2026-10-07): store hours, the surcharge, staff
 * purchases, printers, AI models, permissions, Retail QA tables, and readable views of background-job state (never
 * raw JSON).
 */
import { Box, Button, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Link as RouterLink } from 'react-router-dom';
import { getAppVersion, type Setting } from '../../../api/core.api';
import { AiPanel } from './AiPanel';
import { CardSurchargeEditor } from './CardSurchargeEditor';
import { HolidayHoursCard } from './HolidayHoursCard';
import { PermissionsPanel } from './PermissionsPanel';
import { PrintingPanel } from './PrintingPanel';
import { RetailQaLog, RetailQaTables } from './RetailQaTables';
import type { CustomPiece } from './settingsLayout';
import { isKnownKey, isStateKey, metaForKey } from './settingsRegistry';
import { SettingRow } from './SettingRow';
import { StaffPurchasesEditor } from './StaffPurchasesEditor';
import { StoreHoursEditor } from './StoreHoursEditor';
import { settingByKey } from './useAppSettings';

const isScalar = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const words = (key: string) => key.replace(/_/g, ' ');

function looksLikeDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);
}

function scalarText(v: unknown): string {
  if (v === null || v === '') return '-';
  if (looksLikeDate(v)) return format(parseISO(v), 'MMM d, yyyy h:mm a');
  return String(v);
}

/** Any JSON as plain rows: scalars as text, lists of scalars as a list, objects as nested rows (two levels). */
export function Readable({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (isScalar(value)) return <span>{scalarText(value)}</span>;
  if (Array.isArray(value)) {
    if (value.every(isScalar)) return <span>{value.map(scalarText).join(', ') || '-'}</span>;
    return <span>{value.length} rows</span>;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (depth >= 2) return <span>{entries.length} fields</span>;
  return (
    <Table size="small" sx={{ '& td': { py: 0.5, borderBottom: 0, verticalAlign: 'top' } }}>
      <TableBody>
        {entries.map(([k, v]) => (
          <TableRow key={k}>
            <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap', width: '1%' }}>{words(k)}</TableCell>
            <TableCell sx={{ wordBreak: 'break-word' }}>
              <Readable value={v} depth={depth + 1} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AppVersion() {
  const { data } = useQuery({ queryKey: ['appVersion'], queryFn: async () => (await getAppVersion()).data, staleTime: Infinity });
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      <Box>
        <Typography variant="caption" color="text.secondary">Version</Typography>
        <Typography variant="h5" fontWeight={600}>{data?.version ?? '-'}</Typography>
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary">Build date</Typography>
        <Typography>{data?.build_date ? format(parseISO(data.build_date), 'MMMM d, yyyy') : '-'}</Typography>
      </Box>
    </Box>
  );
}

/** Background-job state kept in the settings table, read-only and readable. */
function BackgroundJobs({ settings }: { settings: Setting[] }) {
  const state = settings.filter((s) => isStateKey(s.key)).sort((a, b) => a.key.localeCompare(b.key));
  const cleanups = state.filter((s) => s.key.startsWith('ai_cleanup_job:'));
  const others = state.filter((s) => !s.key.startsWith('ai_cleanup_job:'));
  const v = (s: Setting) => (s.value ?? {}) as Record<string, unknown>;
  return (
    <Box>
      {cleanups.length ? (
        <>
          <Typography sx={{ fontWeight: 700, mb: 0.5 }}>AI cleanup jobs</Typography>
          <Box sx={{ overflowX: 'auto', mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Order</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Model</TableCell>
                  <TableCell align="right">Rows saved</TableCell>
                  <TableCell>Started by</TableCell>
                  <TableCell>Finished</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cleanups.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell>{s.key.split(':')[1]}</TableCell>
                    <TableCell>{scalarText(v(s).status)}</TableCell>
                    <TableCell>{scalarText(v(s).model)}</TableCell>
                    <TableCell align="right">{scalarText(v(s).rows_saved)}</TableCell>
                    <TableCell>{scalarText(v(s).started_by)}</TableCell>
                    <TableCell>{scalarText(v(s).finished_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </>
      ) : null}
      {others.map((s) => {
        const value = v(s);
        const summary = Object.fromEntries(Object.entries(value).filter(([, x]) => isScalar(x)));
        return (
          <Box key={s.key} sx={{ mb: 2 }}>
            <Typography sx={{ fontWeight: 700 }}>{metaForKey(s.key).label}</Typography>
            <Typography variant="body2" color="text.secondary">{metaForKey(s.key).help}</Typography>
            <Readable value={Object.keys(summary).length ? summary : value} />
          </Box>
        );
      })}
      {!state.length ? <Typography color="text.secondary">No background job has saved anything.</Typography> : null}
    </Box>
  );
}

/** Settings no section names: should stay empty. */
function Unsorted({ settings }: { settings: Setting[] }) {
  const rows = settings.filter((s) => !isKnownKey(s.key));
  if (!rows.length) return <Typography color="text.secondary">Every setting has a home.</Typography>;
  return (
    <>
      {rows.map((s) => (
        <SettingRow key={s.key} settingKey={s.key} value={s.value} description={s.description as string | undefined}
          meta={metaForKey(s.key)} changedBy={s.updated_by_name as string | null} changedAt={s.updated_at as string | null} />
      ))}
    </>
  );
}

export function Piece({ piece, settings }: { piece: CustomPiece; settings: Setting[] }) {
  switch (piece) {
    case 'store-hours':
      return <StoreHoursEditor value={settingByKey(settings, 'online_sales.hours')?.value} />;
    case 'holiday-hours':
      return <HolidayHoursCard />;
    case 'card-surcharge': {
      const meta = metaForKey('pos.card_surcharge');
      const row = settingByKey(settings, 'pos.card_surcharge');
      return (
        <Box sx={{ py: 2 }}>
          <Typography variant="subtitle1">{meta.label}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{meta.help}</Typography>
          {row ? <CardSurchargeEditor key={JSON.stringify(row.value)} value={row.value} /> : <Typography color="text.secondary">Not in the database yet.</Typography>}
        </Box>
      );
    }
    case 'staff-purchases':
      return <StaffPurchasesEditor />;
    case 'calculator-link':
      return (
        <Button component={RouterLink} to="/thrift-plus?tab=calculator" variant="outlined" size="small" sx={{ mt: 1.5, textTransform: 'none' }}>
          Try rules in the Thrift+ calculator
        </Button>
      );
    case 'shipping-formula':
      return (
        <Box sx={{ py: 2 }}>
          <Typography variant="subtitle1">Shipping formula</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{metaForKey('buying_shipping_formula').help}</Typography>
          <Readable value={settingByKey(settings, 'buying_shipping_formula')?.value ?? null} />
        </Box>
      );
    case 'seller-factors':
      return <Readable value={settingByKey(settings, 'buying_seller_revenue_factors')?.value ?? null} />;
    case 'retail-qa-tables':
      return <RetailQaTables />;
    case 'retail-qa-log':
      return <RetailQaLog />;
    case 'printing':
      return <PrintingPanel />;
    case 'ai-models':
      return <AiPanel />;
    case 'permissions':
      return <PermissionsPanel />;
    case 'careers-link':
      return (
        <Button component={RouterLink} to="/people/jobs" variant="outlined" size="small" sx={{ textTransform: 'none' }}>
          Open People → Jobs
        </Button>
      );
    case 'app-version':
      return <AppVersion />;
    case 'background-jobs':
      return <BackgroundJobs settings={settings} />;
    case 'unsorted':
      return <Unsorted settings={settings} />;
    default:
      return null;
  }
}
