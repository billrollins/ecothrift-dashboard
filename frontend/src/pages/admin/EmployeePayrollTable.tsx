import type { CSSProperties } from 'react';
import { Box, Stack, Table, TableBody, TableCell, TableFooter, TableHead, TableRow, Typography } from '@mui/material';
import {
  OT_NOTICE_HOURS,
  fmtHours,
  fmtWeekHeader,
  splitWeeklyHours,
  type EmployeePayrollRow,
  sumEmployeePayroll,
} from './payrollHours';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function fmtMoney(v: number): string {
  return usd.format(v);
}

const NUM: CSSProperties = { fontVariantNumeric: 'tabular-nums' };

const COL = {
  employee: 200,
  shifts: 80,
  rate: 88,
  weeks: 280,
  time: 168,
  pay: 112,
} as const;

function WeeklyHoursLine({ total }: { total: number }) {
  const { regular, overtime } = splitWeeklyHours(total);
  if (total <= 0) {
    return (
      <Typography component="span" variant="body2" color="text.disabled" sx={NUM}>
        -
      </Typography>
    );
  }
  if (overtime <= 0) {
    return (
      <Typography component="span" variant="body2" sx={NUM}>
        {fmtHours(regular)}
      </Typography>
    );
  }
  return (
    <Typography component="span" variant="body2" sx={{ ...NUM, whiteSpace: 'nowrap' }}>
      {fmtHours(regular)}{' '}
      <Box
        component="span"
        sx={{ color: overtime >= OT_NOTICE_HOURS ? 'warning.main' : 'text.secondary' }}
      >
        (+{fmtHours(overtime)} OT)
      </Box>
    </Typography>
  );
}

function IndWeeksCell({ weekStarts, weekHours }: { weekStarts: string[]; weekHours: Record<string, number> }) {
  const shown = weekStarts.length > 0 ? weekStarts : [''];
  return (
    <Stack spacing={0.35} sx={{ py: 0.25, minHeight: 40 }}>
      {shown.map((week) => (
        <Box key={week || 'empty'} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            sx={{ minWidth: 72, ...NUM, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {week ? fmtWeekHeader(week) : '-'}
          </Typography>
          <WeeklyHoursLine total={week ? weekHours[week] ?? 0 : 0} />
        </Box>
      ))}
    </Stack>
  );
}

/** Always two lines so the first overtime hour does not grow the row. */
function TimeCell({ regular, overtime }: { regular: number; overtime: number }) {
  return (
    <Stack spacing={0.25} sx={{ py: 0.25, minWidth: 0, minHeight: 40 }}>
      <TimeLine label="Regular" value={regular} />
      <TimeLine label="Overtime" value={overtime} overtime />
    </Stack>
  );
}

function TimeLine({
  label,
  value,
  overtime,
}: {
  label: string;
  value: number;
  overtime?: boolean;
}) {
  const empty = overtime && value <= 0;
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          ...NUM,
          fontWeight: 600,
          color: empty
            ? 'text.disabled'
            : overtime && value >= OT_NOTICE_HOURS
              ? 'warning.main'
              : 'text.primary',
          whiteSpace: 'nowrap',
        }}
      >
        {empty ? '-' : fmtHours(value)}
      </Typography>
    </Box>
  );
}

export function EmployeePayrollTable({
  rows,
  weekStarts,
  loading,
}: {
  rows: EmployeePayrollRow[];
  weekStarts: string[];
  loading?: boolean;
}) {
  const totals = sumEmployeePayroll(rows, weekStarts);

  return (
    <Box sx={{ overflowX: 'auto', opacity: loading ? 0.6 : 1 }}>
      <Table
        size="small"
        sx={{
          width: 'max-content',
          maxWidth: '100%',
          '& .MuiTableCell-root': { py: 1, px: 1.25, borderColor: 'divider', verticalAlign: 'top' },
          '& .MuiTableCell-head': { fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'bottom' },
          '& .MuiTableCell-footer': {
            fontWeight: 700,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover',
          },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: COL.employee, minWidth: COL.employee }}>Employee</TableCell>
            <TableCell align="right" sx={{ width: COL.shifts }}>
              # Shifts
            </TableCell>
            <TableCell align="right" sx={{ width: COL.rate }}>
              Rate
            </TableCell>
            <TableCell sx={{ width: COL.weeks, minWidth: COL.weeks }}>Ind. weeks</TableCell>
            <TableCell sx={{ width: COL.time, minWidth: COL.time }}>Time</TableCell>
            <TableCell align="right" sx={{ width: COL.pay }}>
              Payroll
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6}>
                <Typography variant="body2" color="text.secondary">
                  No completed shifts in this range.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.employee_id} hover>
                <TableCell sx={{ width: COL.employee, maxWidth: COL.employee }}>
                  <Typography variant="body2" noWrap title={row.employee_name}>
                    {row.employee_name}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={NUM}>
                  {row.shifts}
                </TableCell>
                <TableCell align="right" sx={NUM}>
                  {fmtMoney(row.rate)}
                </TableCell>
                <TableCell>
                  <IndWeeksCell weekStarts={weekStarts} weekHours={row.weekHours} />
                </TableCell>
                <TableCell>
                  <TimeCell regular={row.regular} overtime={row.overtime} />
                </TableCell>
                <TableCell align="right" sx={{ ...NUM, fontWeight: 700 }}>
                  {fmtMoney(row.pay)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell align="right" sx={NUM}>
              {totals.shifts}
            </TableCell>
            <TableCell align="right">
              <Typography component="span" variant="body2" color="text.disabled">
                -
              </Typography>
            </TableCell>
            <TableCell>
              <IndWeeksCell weekStarts={weekStarts} weekHours={totals.weekHours} />
            </TableCell>
            <TableCell>
              <TimeCell regular={totals.regular} overtime={totals.overtime} />
            </TableCell>
            <TableCell align="right" sx={{ ...NUM, fontWeight: 700 }}>
              {fmtMoney(totals.pay)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Box>
  );
}
