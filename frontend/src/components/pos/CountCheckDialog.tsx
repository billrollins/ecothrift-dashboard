/**
 * After a blind count (2026-10-21, drawer life): what was counted beside what Dash expected, by bill and coin, shown
 * only once the count is in. Used after opening, handoff and close.
 */
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow,
  Typography,
} from '@mui/material';
import type { CountCheck } from '../../types/pos.types';

function money(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function signed(value: number | string, isMoney: boolean): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!n) return isMoney ? money(0) : '0';
  const text = isMoney ? money(Math.abs(n)) : String(Math.abs(n));
  return `${n > 0 ? '+' : '−'}${text}`;
}

type Props = {
  check: CountCheck | null;
  title: string;
  onClose: () => void;
};

export default function CountCheckDialog({ check, title, onClose }: Props) {
  const off = check ? parseFloat(check.difference_total) : 0;
  return (
    <Dialog open={check !== null} onClose={onClose} maxWidth="xs" fullWidth data-testid="count-check">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {check && (
          <>
            <Typography
              variant="h6"
              fontWeight={800}
              color={Math.abs(off) < 0.005 ? 'success.main' : Math.abs(off) <= 5 ? 'warning.main' : 'error.main'}
              sx={{ mb: 1 }}
            >
              {Math.abs(off) < 0.005 ? 'Right on: nothing over or short.' : `${off > 0 ? 'Over' : 'Short'} ${money(Math.abs(off))}`}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Counted {money(check.counted_total)} · expected {money(check.expected_total)}
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell align="right">Counted</TableCell>
                    <TableCell align="right">Expected</TableCell>
                    <TableCell align="right">Difference</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {check.rows.map((row) => {
                    const isMoney = row.key === 'coins';
                    const diff = typeof row.difference === 'string' ? parseFloat(row.difference) : row.difference;
                    return (
                      <TableRow key={row.key}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell align="right">{isMoney ? money(row.counted) : row.counted}</TableCell>
                        <TableCell align="right">{isMoney ? money(row.expected) : row.expected}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: diff ? 800 : 400, color: diff ? 'error.main' : undefined }}>
                          {signed(row.difference, isMoney)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
