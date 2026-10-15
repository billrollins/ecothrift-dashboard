/**
 * Every code the camera reads gets an answer in the middle (owner 2026-10-15, APP D14 and D15), never a toast that's
 * easy to miss. The bottom row under each is [Scan again] (TripScanner.tsx); a link adds [Open link].
 * - D14a, not our code: a product barcode, other text, or a link to another site.
 * - D14b, our code, not found: it sells as marked, with no ThriftBucks, AS IS (rulebook P11).
 * - D15, one of our links (ecothrift.us), like the terms QR on a poster.
 */
import { Box } from '@mui/material';
import BlockRounded from '@mui/icons-material/BlockRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import greenTagUrl from '../../../assets/thriftplus/our-green-tag.webp';
import { sc, u } from './scannerTheme';
import { ReturnsBadge } from './tripUi';

const titleSx = { m: 0, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(52), lineHeight: 1.1, color: sc.titleGreen } as const;
const lineSx = { mt: u(14), fontSize: u(31), color: sc.ink2, lineHeight: 1.4, maxWidth: u(760) } as const;

/** D14a: the picture of our green tag (its QR ringed in member green), then where to scan. */
export function NotOurTag() {
  return (
    <Box data-testid="answer-not-ours" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Box component="img" src={greenTagUrl} alt="Our green price tag, with its QR code" width={900} height={649}
        sx={{ display: 'block', width: u(600), maxWidth: '100%', height: 'auto', mb: u(26) }} />
      <Box component="h2" sx={titleSx}>That&apos;s not our price tag</Box>
      <Box sx={lineSx}>Look for our green tag and scan the QR code on it.</Box>
    </Box>
  );
}

/** D14b: our code, but no item. "AS IS" and "3-day" never break across lines. */
export function CantFindItem({ code, onAsIs }: { code: string; onAsIs: () => void }) {
  return (
    <Box data-testid="answer-not-found" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <BlockRounded sx={{ fontSize: u(110), color: sc.ink3 }} />
      <Box component="h2" sx={{ ...titleSx, mt: u(14) }}>We can&apos;t find that item</Box>
      <Box sx={lineSx}>{"It's priced as marked, with no ThriftBucks. Sold AS IS, so no 3‑day returns."}</Box>
      <Box sx={{ mt: u(26) }}>
        <ReturnsBadge ok={false} onClick={onAsIs} />
      </Box>
      <Box data-testid="no-thriftbucks" sx={{ mt: u(22), px: u(30), py: u(12), borderRadius: u(24), bgcolor: '#f3f3ef', fontSize: u(30), color: sc.ink2 }}>
        No ThriftBucks on this item
      </Box>
      <Box data-testid="answer-code" sx={{ mt: u(18), fontFamily: sc.mono, fontSize: u(24), color: sc.ink3 }}>{code}</Box>
    </Box>
  );
}

/** D15: one of our links. The address shows as host and path, in bold ink. */
export function OurLink({ shown }: { shown: string }) {
  return (
    <Box data-testid="answer-link" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <LinkRounded sx={{ fontSize: u(110), color: sc.green }} />
      <Box component="h2" sx={{ ...titleSx, mt: u(14) }}>That QR code is a link</Box>
      <Box sx={lineSx}>
        It opens <Box component="b" sx={{ color: sc.ink, fontWeight: 700 }}>{shown}</Box>.
        <br />
        To see a price, scan the QR code on our green tag.
      </Box>
    </Box>
  );
}
