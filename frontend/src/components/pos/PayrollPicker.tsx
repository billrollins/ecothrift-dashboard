import { Alert, MenuItem, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getPayrollEligibility, getPayrollPeople } from '../../api/pos.api';
import { formatCurrency } from '../../utils/format';

/**
 * Payroll deduction at the register (staff only): pick who is buying, and see whether it fits what is left of
 * this pay period (the owner's % of their last paycheck). The server checks it all again on Complete sale.
 */
export function PayrollPicker({
  amount,
  value,
  onChange,
}: {
  amount: number;
  value: number | '';
  onChange: (id: number | '') => void;
}) {
  const people = useQuery({ queryKey: ['pos', 'payroll-people'], queryFn: async () => (await getPayrollPeople()).data });
  const check = useQuery({
    queryKey: ['pos', 'payroll-eligibility', value, amount],
    queryFn: async () => (await getPayrollEligibility(Number(value), amount)).data,
    enabled: value !== '',
  });
  const c = check.data;
  return (
    <>
      <TextField
        select
        fullWidth
        size="small"
        label="Staff member buying"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        sx={{ mb: 1 }}
      >
        {(people.data ?? []).map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
      </TextField>
      {c && (
        <Alert severity={c.eligible ? 'success' : 'warning'} sx={{ mb: 1 }}>
          {c.eligible ? (
            <>
              Comes out of their next paycheck in full. Left this pay period: {formatCurrency(Number(c.available))} of{' '}
              {formatCurrency(Number(c.limit))} ({c.percent}% of their last paycheck).
            </>
          ) : (
            c.reason
          )}
        </Alert>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Someone else rings it up, and each item has been on the floor a day.
      </Typography>
    </>
  );
}
