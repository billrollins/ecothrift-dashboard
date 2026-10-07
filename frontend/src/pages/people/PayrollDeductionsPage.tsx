import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { getPayrollDeductions, getStaffPurchaseSettings, markPayrollEntered } from '../../api/pos.api';
import { PageHeader } from '../../components/common/PageHeader';
import { ccTokens } from '../../theme';
import { dayText, errorText, shortDate } from './peopleUi';

const money = (v: string | number) => `$${Number(v).toFixed(2)}`;

/** Each pay period's payroll-deduction purchases, per person, to enter in QuickBooks Payroll, then mark entered. */
export default function PayrollDeductionsPage() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [day, setDay] = useState<string | undefined>(undefined);
  const settings = useQuery({ queryKey: ['pos', 'staff-purchase-settings'], queryFn: async () => (await getStaffPurchaseSettings()).data });
  const list = useQuery({ queryKey: ['pos', 'payroll-deductions', day ?? 'now'], queryFn: async () => (await getPayrollDeductions(day)).data });
  const data = list.data;

  return (
    <Box>
      <PageHeader
        title="Payroll deductions"
        subtitle="What staff bought by payroll deduction, per pay period. Enter each total in QuickBooks Payroll for the paycheck after the period, then mark it entered."
      />
      {settings.data && !settings.data.payroll_deduction && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Payroll deduction is off at the register. The owner turns it on in{' '}
          <RouterLink to="/admin/settings?tab=store&section=staff-purchases">Settings → Store → Staff purchases</RouterLink>.
        </Alert>
      )}
      {!data ? (
        <CircularProgress />
      ) : (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap' }}>
            <Button size="small" onClick={() => setDay(data.previous_start)}>
              ← Earlier
            </Button>
            <Typography fontWeight={700}>
              Pay period {dayText(data.start)} – {dayText(data.end)}
            </Typography>
            <Button size="small" onClick={() => setDay(data.next_start)}>
              Later →
            </Button>
            <Typography sx={{ ml: 'auto' }} color="text.secondary">
              Total {money(data.total)}
            </Typography>
          </Stack>
          {data.people.length === 0 && (
            <Typography color="text.secondary">Nobody bought by payroll deduction in this pay period.</Typography>
          )}
          <Stack spacing={1.5}>
            {data.people.map((row) => (
              <Box key={row.employee.id} sx={{ p: 2, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography fontWeight={700} sx={{ flex: 1 }}>
                    {row.employee.name}: {money(row.total)}
                  </Typography>
                  {row.entered ? (
                    <Chip
                      size="small"
                      color={row.entered.matches ? 'success' : 'warning'}
                      label={
                        row.entered.matches
                          ? `Entered in QuickBooks ${shortDate(row.entered.at)} by ${row.entered.by}`
                          : `Entered ${money(row.entered.amount)}, but it is now ${money(row.total)} (a sale was voided?)`
                      }
                    />
                  ) : null}
                  {(!row.entered || !row.entered.matches) && (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={async () => {
                        try {
                          const { data: next } = await markPayrollEntered(row.employee.id, data.start);
                          queryClient.setQueryData(['pos', 'payroll-deductions', day ?? 'now'], next);
                          enqueueSnackbar(`${row.employee.name}: ${money(row.total)} marked entered`, { variant: 'success' });
                        } catch (err) {
                          enqueueSnackbar(errorText(err, 'Could not save.'), { variant: 'error' });
                        }
                      }}
                    >
                      Mark entered in QuickBooks
                    </Button>
                  )}
                </Box>
                {row.sales.map((sale) => (
                  <Typography key={sale.cart} variant="body2" color="text.secondary">
                    {shortDate(sale.at)} · {sale.receipt || `Sale ${sale.cart}`} · {money(sale.amount)} · rung by {sale.cashier}
                  </Typography>
                ))}
              </Box>
            ))}
          </Stack>
          {list.isError && <Alert severity="error">Could not load the list.</Alert>}
        </>
      )}
    </Box>
  );
}
