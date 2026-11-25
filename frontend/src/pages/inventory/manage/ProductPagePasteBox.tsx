/**
 * New product from a pasted vendor page (Dash Update #224, Bill 2026-11-24: "if they find a product page they can copy
 * paste all text into AI to have AI Create the new product"). The AI's draft fills the boxes below for review; nothing
 * is saved until Save. It starts from the manifest row: the page wins, the row fills what the page leaves out.
 * Server: `apps/inventory/services/product_from_page.py` (Settings > AI action "New product from a pasted page").
 */
import { useState } from 'react';
import { Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { productFromPage, type ProductFromPageDTO } from '../../../api/productPacks.api';
import { apiErrorDetail } from '../../../hooks/useProductSearch';
import { processingTokens } from '../processing/processingTokens';
import { IconAiAssist as AutoAwesome } from '../../../icons/ecoIcons';

export function pageRunLine(r: Pick<ProductFromPageDTO, 'model' | 'took_ms' | 'cost_usd'>): string {
  const secs = (r.took_ms / 1000).toFixed(1);
  const cost = r.cost_usd != null ? ` · $${Number(r.cost_usd).toFixed(4)}` : '';
  return `${r.model} · ${secs} s${cost}`;
}

export function ProductPagePasteBox({ processingRowId, onDraft }: {
  processingRowId?: number;
  onDraft: (result: ProductFromPageDTO) => void;
}) {
  const [text, setText] = useState('');
  const [done, setDone] = useState<ProductFromPageDTO | null>(null);
  const run = useMutation({
    mutationFn: async () => (await productFromPage(text, processingRowId)).data,
    onSuccess: (data) => {
      setDone(data);
      onDraft(data);
    },
  });

  return (
    <Box sx={{ p: 1.5, mb: 1.5, border: 1, borderColor: `${processingTokens.primary}55`, borderRadius: 2, bgcolor: processingTokens.primarySoft }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
        <Typography sx={{ fontSize: '0.625rem', fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase', color: processingTokens.primaryDark, flex: 1 }}>
          Paste the product page
        </Typography>
        <Button
          size="small"
          variant="contained"
          disabled={run.isPending || text.trim().length < 40}
          startIcon={run.isPending ? <CircularProgress size={14} color="inherit" /> : <AutoAwesome sx={{ fontSize: 16 }} />}
          onClick={() => run.mutate()}
        >
          Fill from the page
        </Button>
      </Box>
      <TextField
        fullWidth
        multiline
        minRows={3}
        maxRows={8}
        size="small"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="On the vendor's product page: select all, copy, paste here."
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
          `Filled from the page (${pageRunLine(done)}). Check each box, then Save.`
          + (done.problems.length ? ` ${done.problems.join(' ')}` : '')
        : ''}
      </Typography>
    </Box>
  );
}
