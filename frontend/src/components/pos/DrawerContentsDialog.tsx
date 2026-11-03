/**
 * What the drawer holds by bill and coin, as Dash knows it (2026-11-02, Bill: "see the Drawer denominations for a
 * drawer count EASY on the screen"): the last count, plus cash taken and less change given per sale, less drops. Read
 * only. A count below 0 means the drawer drifted from what Dash knows; the next count shows it.
 */
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { CASH_DENOMINATIONS, countCents, hasPieces, type CashCount } from '../../utils/cashCounts';
import { tp } from '../../i18n/pos';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function DrawerChip({
  contents, practice, lang, onClick,
}: { contents: CashCount | null | undefined; practice?: boolean; lang?: string | null; onClick: () => void }) {
  return (
    <Chip
      clickable
      onClick={onClick}
      color={practice ? 'warning' : 'default'}
      variant="outlined"
      label={`${tp(practice ? 'drawerPractice' : 'drawer', lang)} ${money(countCents(contents))}`}
      data-testid="drawer-chip"
      sx={{ fontWeight: 700, height: 36 }}
    />
  );
}

export default function DrawerContentsDialog({
  open, onClose, contents, lang,
}: { open: boolean; onClose: () => void; contents: CashCount | null | undefined; lang?: string | null }) {
  const known = hasPieces(contents);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>{tp('drawerTitle', lang)}</DialogTitle>
      <DialogContent>
        {!known ? (
          <Typography color="text.secondary">{tp('drawerUnknown', lang)}</Typography>
        ) : (
          <Box
            data-testid="drawer-contents"
            sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', columnGap: 2, rowGap: 0.75, alignItems: 'baseline' }}
          >
            {CASH_DENOMINATIONS.map((d) => {
              const n = contents?.[d.key] ?? 0;
              return (
                <Box key={d.key} sx={{ display: 'contents', color: n ? (n < 0 ? 'error.main' : 'text.primary') : 'text.disabled' }}>
                  <Typography fontWeight={800} fontSize="1.15rem">{d.label}</Typography>
                  <Typography fontSize="1.15rem" data-testid={`drawer-${d.key}`}>× {n}</Typography>
                  <Typography textAlign="right">{money(n * d.cents)}</Typography>
                </Box>
              );
            })}
            <Box sx={{ gridColumn: '1 / -1', borderTop: 1, borderColor: 'divider', mt: 0.5 }} />
            <Typography fontWeight={800}>{tp('total', lang)}</Typography>
            <span />
            <Typography fontWeight={800} textAlign="right">{money(countCents(contents))}</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} size="large">{tp('close', lang)}</Button>
      </DialogActions>
    </Dialog>
  );
}
