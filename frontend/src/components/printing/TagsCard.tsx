/**
 * The tags this computer prints (Bill, Dash Updates #9, 2026-11-03): the price tag (Old or Thrift+) and what an item
 * going to Restoration gets (the Restoration tag or a price tag), each with a big live sample. All of it is this
 * computer's; the defaults are the store standard (`printPrefs.ts`).
 */
import { useEffect, useState } from 'react';
import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { LabelSize } from '../../printing/labelSize';
import type { PrintPrefs, PriceTagStyle, RestorationTagStyle } from '../../printing/printPrefs';
import { SAMPLE_PERKS_TAG, SAMPLE_PRICE_TAG } from '../../printing/printTags';
import { renderTagPng, type TagDesign } from '../../printing/tagCanvas';
import { perksTag } from '../../printing/tags/perksTag';
import { priceTag } from '../../printing/tags/priceTag';
import { restorationTag } from '../../pages/restoration/tag/restorationTag';

export const SAMPLE_RESTORATION = {
  sku: 'ITM0104829',
  title: 'KitchenAid Artisan 5 qt Stand Mixer, Empire Red',
  needs: ['Test', 'Assemble'],
  holdout: false,
  sent_on: '2026-10-28',
  sent_by: 'Ashley',
};

/** A sample tag at this size, big enough to read (about 2.5 times real size; never wider than its column). */
function Sample<T>({ design, data, size, alt }: { design: TagDesign<T>; data: T; size: LabelSize; alt: string }) {
  const [png, setPng] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    renderTagPng(design, data, size).then((p) => live && setPng(p)).catch(() => live && setPng(null));
    return () => {
      live = false;
    };
  }, [design, data, size]);
  return (
    <Box sx={{ height: 216, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {png && (
        <Box component="img" src={`data:image/png;base64,${png}`} alt={alt}
          sx={{ width: Math.round(size.w_in * 216), maxWidth: '100%', maxHeight: 216, objectFit: 'contain',
            bgcolor: '#C8E482', borderRadius: 0.5, boxShadow: 1, imageRendering: 'pixelated', mixBlendMode: 'multiply' }} />
      )}
    </Box>
  );
}

function Choice<V extends string>({ value, options, label, onChange }: {
  value: V; options: Array<[V, string]>; label: string; onChange: (v: V) => void;
}) {
  return (
    <ToggleButtonGroup exclusive fullWidth size="small" value={value} aria-label={label} sx={{ maxWidth: 360, alignSelf: 'center' }}
      onChange={(_, v: V | null) => v && onChange(v)}>
      {options.map(([v, text]) => (
        <ToggleButton key={v} value={v} sx={{ textTransform: 'none', py: 0.25 }}>{text}</ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export function TagsCard({ prefs, size, save }: { prefs: PrintPrefs; size: LabelSize; save: (c: Partial<PrintPrefs>) => void }) {
  const price = prefs.priceTag === 'perks'
    ? <Sample design={perksTag} data={SAMPLE_PERKS_TAG} size={size} alt="Sample Thrift+ price tag" />
    : <Sample design={priceTag} data={SAMPLE_PRICE_TAG} size={size} alt="Sample old price tag" />;
  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Tags</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 3 }}>
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary">Price tag</Typography>
          {price}
          <Choice<PriceTagStyle> label="Price tag" value={prefs.priceTag} onChange={(v) => save({ priceTag: v })}
            options={[['old', 'Old'], ['perks', 'Thrift+']]} />
        </Stack>
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary">Going to Restoration</Typography>
          {prefs.restorationTag === 'restoration'
            ? <Sample design={restorationTag} data={SAMPLE_RESTORATION} size={size} alt="Sample restoration tag" />
            : price}
          <Choice<RestorationTagStyle> label="Going to Restoration" value={prefs.restorationTag}
            onChange={(v) => save({ restorationTag: v })} options={[['restoration', 'Restoration'], ['price', 'Price tag']]} />
        </Stack>
      </Box>
    </Box>
  );
}
