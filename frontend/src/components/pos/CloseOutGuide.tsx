/**
 * After the close count (Retail 4 step 5, Bill 2026-11-02: "exchange with supplemental to have count match what opening
 * register needs / create a cash drop of excess"): what to keep for tomorrow's till, what to get from the office (and give
 * back the same from the rest), and the drop. By piece where the bills and coins are known; coins from the coin counter
 * go by dollars. The server works it out and keeps it on the drawer (`close_out`).
 */
import { Box, Chip, Stack, Typography } from '@mui/material';
import { CASH_DENOMINATIONS, type CashCount } from '../../utils/cashCounts';
import { tp } from '../../i18n/pos';

export interface CloseOut {
  keep_total: string;
  drop_total: string;
  short_for_till: string;
  swap_total: string;
  give_back?: string;
  keep: CashCount | null;
  from_office: CashCount | null;
  drop: CashCount | null;
  coins_from_office: string | null;
  drop_coins: string | null;
}

function money(v: string | number): string {
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
}

const some = (v: string | null | undefined) => v != null && Number.parseFloat(v) > 0;

function Pieces({ count, coins, lang }: { count: CashCount | null; coins?: string | null; lang?: string | null }) {
  const shown = CASH_DENOMINATIONS.filter((d) => (count?.[d.key] ?? 0) > 0);
  if (!shown.length && !some(coins)) return null;
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
      {shown.map((d) => (
        <Chip
          key={d.key}
          label={`${count?.[d.key]} × ${d.label}`}
          sx={{ fontWeight: 800, fontSize: '1rem', height: 38, bgcolor: d.tone.bg, color: d.tone.fg }}
        />
      ))}
      {some(coins) && <Chip label={`${money(coins ?? 0)} ${tp('coinsDollars', lang)}`} sx={{ fontWeight: 800, fontSize: '1rem', height: 38 }} />}
    </Stack>
  );
}

function Step({ title, amount, children, testId }: { title: string; amount?: string; children?: React.ReactNode; testId: string }) {
  return (
    <Box sx={{ py: 1.25, borderTop: 1, borderColor: 'divider' }} data-testid={testId}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography variant="h6" fontWeight={800}>{title}</Typography>
        {amount && <Typography variant="h6" fontWeight={800}>{money(amount)}</Typography>}
      </Stack>
      {children}
    </Box>
  );
}

export default function CloseOutGuide({ out, lang }: { out: CloseOut; lang?: string | null }) {
  const swap = some(out.swap_total);
  return (
    <Box sx={{ mt: 2 }} data-testid="close-out">
      {some(out.short_for_till) && (
        <Typography color="error.main" fontWeight={700} sx={{ mb: 1 }}>
          {tp('shortForTill', lang)} {money(out.short_for_till)}
        </Typography>
      )}
      <Step title={tp('keepForTomorrow', lang)} amount={out.keep_total} testId="close-keep">
        <Pieces count={out.keep} lang={lang} />
      </Step>
      {swap && (
        <Step title={tp('fromOffice', lang)} amount={out.swap_total} testId="close-swap">
          <Pieces count={out.from_office} coins={out.coins_from_office} lang={lang} />
          {some(out.give_back) && (
            <Typography fontWeight={700} sx={{ mt: 0.75 }}>
              {tp('giveOffice', lang)} {money(out.give_back ?? 0)}
            </Typography>
          )}
        </Step>
      )}
      {some(out.drop_total) && (
        <Step title={tp(swap ? 'dropRest' : 'drop', lang)} amount={out.drop_total} testId="close-drop">
          {!swap && <Pieces count={out.drop} coins={out.drop_coins} lang={lang} />}
        </Step>
      )}
    </Box>
  );
}
