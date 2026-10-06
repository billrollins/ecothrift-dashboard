import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { countReportCsvUrl, getCountReport, type CountReport } from '../../../api/stocktake.api';

const money = (v: string | null) => (v == null ? '' : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, minWidth: 140 }}>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{label}</Typography>
      <Typography sx={{ fontSize: 24, fontWeight: 900 }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{sub}</Typography>}
    </Box>
  );
}

/** What was not found in an inventory count: the shrink. Managers and up. */
export default function CountReportPage() {
  const { id } = useParams();
  const [report, setReport] = useState<CountReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getCountReport(Number(id))
      .then(setReport)
      .catch(() => setError('Could not load the report. Reports are for managers.'));
  }, [id]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!report) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, width: '100%', minWidth: 0, maxWidth: 1000, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {report.name}
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>
            {report.status === 'open' ? 'Still open: numbers change as scans come in.' : 'Closed.'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button component={RouterLink} to="/inventory/count/days" variant="outlined">
            All inventories
          </Button>
          <Button href={countReportCsvUrl(report.id)} variant="contained">
            Download missing (CSV)
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{ mb: 3 }}>
        <Stat label="Expected on shelf" value={report.expected.toLocaleString()} />
        <Stat label="Counted" value={report.counted.toLocaleString()} />
        <Stat label="Not found" value={report.missing_count.toLocaleString()} sub={`${report.shrink_pct}% of expected`} />
        <Stat label="Missing at price" value={money(report.missing_price_total)} />
        <Stat label="Missing at retail" value={money(report.missing_retail_total)} />
        <Stat label="Missing at cost (rough)" value={money(report.missing_cost_total)} />
      </Stack>

      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
        Not found ({report.missing.length})
      </Typography>
      <Box sx={{ overflowX: 'auto', mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>SKU</TableCell>
              <TableCell>Item</TableCell>
              <TableCell>Location</TableCell>
              <TableCell align="right">Price</TableCell>
              <TableCell align="right">Retail</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {report.missing.slice(0, 500).map((r) => (
              <TableRow key={r.sku}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{r.sku}</TableCell>
                <TableCell>{r.title}</TableCell>
                <TableCell>{r.location}</TableCell>
                <TableCell align="right">{money(r.price)}</TableCell>
                <TableCell align="right">{money(r.retail)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {report.missing.length > 500 && (
          <Typography sx={{ color: 'text.secondary', mt: 1 }}>First 500 shown. The CSV has all {report.missing.length}.</Typography>
        )}
      </Box>

      {report.odd_items.length > 0 && (
        <>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
            Found, but the system says not on shelf ({report.odd_items.length})
          </Typography>
          {report.odd_items.map((r) => (
            <Typography key={r.sku} sx={{ fontSize: 14 }}>
              <b style={{ fontFamily: 'monospace' }}>{r.sku}</b> {r.title}: marked {r.status}
            </Typography>
          ))}
        </>
      )}

      {report.unknown_codes.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
            Codes with no item ({report.unknown_codes.length})
          </Typography>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 14 }}>{report.unknown_codes.join(', ')}</Typography>
        </Box>
      )}

      {report.sold_meanwhile.length > 0 && (
        <Typography sx={{ mt: 3, color: 'text.secondary' }}>
          {report.sold_meanwhile.length} item(s) were sold or moved while the count ran, so they are not counted as missing.
        </Typography>
      )}
    </Box>
  );
}
