/**
 * New product from a pasted vendor page (Dash Update #224, Bill 2026-11-24: "if they find a product page they can copy
 * paste all text into AI to have AI Create the new product"). The AI's draft fills the product details for review;
 * nothing is saved until Save. Server: `apps/inventory/services/product_from_page.py` (Settings > AI action "New
 * product from a pasted page").
 *
 * It sits UNDER the product details, as the optional way in (#230, Bill 2026-11-25: "move the Paste the Product page
 * below the Product details, this is optional or secondary ... Product page buttons are: Clear, Fill, Clear then fill
 * (on enter; when focus is in product page box)"):
 * - **Clear** empties this box.
 * - **Fill** puts what the page says into the details and leaves what the page does not say as it is. The manifest
 *   row fills what the page leaves out.
 * - **Clear then fill** empties the details first, so only the page speaks (no row). Enter in the box does this;
 *   Shift+Enter is a new line.
 */
import { useState } from 'react';
import { Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { productFromPage, type ProductFromPageDTO } from '../../../api/productPacks.api';
import { apiErrorDetail } from '../../../hooks/useProductSearch';
import { processingTokens } from '../processing/processingTokens';
import { IconAiAssist as AutoAwesome } from '../../../icons/ecoIcons';

/** How a page's draft goes into the details: over what is there, or into emptied boxes. */
export type PageFillMode = 'fill' | 'clear-then-fill';

/** The fewest characters that can be a product page (a pasted title alone is not one). */
export const PAGE_MIN_CHARS = 40;

export function pageRunLine(r: Pick<ProductFromPageDTO, 'model' | 'took_ms' | 'cost_usd'>): string {
  const secs = (r.took_ms / 1000).toFixed(1);
  const cost = r.cost_usd != null ? ` · $${Number(r.cost_usd).toFixed(4)}` : '';
  return `${r.model} · ${secs} s${cost}`;
}

export function ProductPagePasteBox({ processingRowId, onDraft }: {
  processingRowId?: number;
  onDraft: (result: ProductFromPageDTO, mode: PageFillMode) => void;
}) {
  const [text, setText] = useState('');
  const [done, setDone] = useState<{ result: ProductFromPageDTO; mode: PageFillMode } | null>(null);
  const run = useMutation({
    // "Clear then fill" is the page alone: the manifest row is left out, so nothing of it comes back in.
    mutationFn: async (mode: PageFillMode) => ({
      mode,
      result: (await productFromPage(text, mode === 'fill' ? processingRowId : undefined)).data,
    }),
    onSuccess: (data) => {
      setDone(data);
      onDraft(data.result, data.mode);
    },
  });
  const ready = !run.isPending && text.trim().length >= PAGE_MIN_CHARS;

  function clear() {
    setText('');
    setDone(null);
    run.reset();
  }

  const buttonSx = { minWidth: 0, px: 1.1, whiteSpace: 'nowrap' } as const;

  return (
    <Box
      data-testid="page-paste-box"
      sx={{ p: 1.25, border: 1, borderColor: `${processingTokens.primary}55`, borderRadius: 2, bgcolor: processingTokens.primarySoft }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
        <Typography sx={{ fontSize: '0.625rem', fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase', color: processingTokens.primaryDark, flex: 1 }}>
          Product page (optional)
        </Typography>
        <Button size="small" variant="outlined" color="inherit" disabled={run.isPending || !text} onClick={clear} sx={{ ...buttonSx, bgcolor: '#fff' }}>
          Clear
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={!ready}
          startIcon={run.isPending && run.variables === 'fill' ? <CircularProgress size={14} color="inherit" /> : <AutoAwesome sx={{ fontSize: 16 }} />}
          onClick={() => run.mutate('fill')}
          sx={{ ...buttonSx, bgcolor: '#fff' }}
        >
          Fill
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={!ready}
          startIcon={run.isPending && run.variables === 'clear-then-fill' ? <CircularProgress size={14} color="inherit" /> : <AutoAwesome sx={{ fontSize: 16 }} />}
          onClick={() => run.mutate('clear-then-fill')}
          sx={buttonSx}
        >
          Clear then fill
        </Button>
      </Box>
      <TextField
        fullWidth
        multiline
        minRows={2}
        maxRows={4}
        size="small"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter here is "Clear then fill"; the window's own Enter (save the product) stays out of this box.
          if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
          e.preventDefault();
          e.stopPropagation();
          if (ready) run.mutate('clear-then-fill');
        }}
        placeholder="On the vendor's product page: select all, copy, paste here. Enter fills the product from it."
        slotProps={{ htmlInput: { 'aria-label': 'Pasted product page' } }}
        sx={{ '& .MuiInputBase-root': { bgcolor: '#fff', fontSize: 12.5 } }}
      />
      {/* One fixed line under the box: what ran, or what went wrong. */}
      <Typography
        variant="caption"
        data-testid="page-paste-status"
        sx={{ display: 'block', minHeight: 18, mt: 0.5, fontWeight: 700, color: run.isError ? 'error.main' : processingTokens.textSoft }}
      >
        {run.isError ?
          apiErrorDetail(run.error, 'The AI could not read this page. Try again, or fill the boxes by hand.')
        : done ?
          `${done.mode === 'fill' ? 'Filled' : 'Cleared and filled'} from the page (${pageRunLine(done.result)}). Check each box, then Save.`
          + (done.result.problems.length ? ` ${done.result.problems.join(' ')}` : '')
        : ''}
      </Typography>
    </Box>
  );
}
