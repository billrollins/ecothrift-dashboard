/**
 * "What labels are you using?" (owner, 2026-10-28): the one label-size setting. Pick the stock (or type W x H), the
 * printer's dpi, and whether it is for the whole store or only this computer; print a test label to check before
 * saving. Used on Settings → Printing and in the print-server chip's mini window.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControlLabel,
  Link,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../hooks/useAuth';
import {
  describeLabelSize,
  LABEL_DPIS,
  LABEL_PRESETS,
  MAX_SIDE_IN,
  MIN_SIDE_IN,
  parseLabelSize,
  presetFor,
  type LabelDpi,
  type LabelSize,
} from '../../printing/labelSize';
import type { PriceTagDesign } from '../../api/core.api';
import { lastPrintedTag, printTestLabel, reprintLastTag, SAMPLE_PERKS_TAG, SAMPLE_PRICE_TAG } from '../../printing/printTags';
import { renderTagPng } from '../../printing/tagCanvas';
import { perksTag } from '../../printing/tags/perksTag';
import { priceTag } from '../../printing/tags/priceTag';
import { restorationTag } from '../../pages/restoration/tag/restorationTag';
import { useLabelSize } from '../../printing/useLabelSize';
import { IconPrint as Print } from '../../icons/ecoIcons';

const SAMPLE_RESTORATION = {
  sku: 'ITM0104829',
  title: 'KitchenAid Artisan 5 qt Stand Mixer, Empire Red',
  needs: ['Test', 'Assemble'],
  holdout: false,
  sent_on: '2026-10-28',
  sent_by: 'Ashley',
};

type Scope = 'store' | 'station';

/** The sample tags drawn at a size, shown bigger than real (1.6 times; about real size in the mini window). */
function TagPreview({ size, scale = 1.6, design = 'classic' }: { size: LabelSize; scale?: number; design?: PriceTagDesign }) {
  const [pngs, setPngs] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    const price = design === 'perks' ? renderTagPng(perksTag, SAMPLE_PERKS_TAG, size) : renderTagPng(priceTag, SAMPLE_PRICE_TAG, size);
    Promise.all([price, renderTagPng(restorationTag, SAMPLE_RESTORATION, size)])
      .then((list) => live && setPngs(list))
      .catch(() => live && setPngs([]));
    return () => {
      live = false;
    };
  }, [size, design]);
  if (!pngs.length) return null;
  const width = Math.round(size.w_in * 96 * scale);
  return (
    <Stack direction="row" spacing={1.5} useFlexGap alignItems="flex-start" sx={{ flexWrap: 'wrap' }}
      aria-label="Sample tags at this size">
      {pngs.map((png, i) => (
        <Box
          key={i}
          component="img"
          src={`data:image/png;base64,${png}`}
          alt={i === 0 ? 'Sample price tag' : 'Sample restoration tag'}
          sx={{ width, maxWidth: '100%', height: 'auto', bgcolor: '#C8E482', borderRadius: 0.5, boxShadow: 1,
            imageRendering: 'pixelated', mixBlendMode: 'multiply' }}
        />
      ))}
    </Stack>
  );
}

export function LabelSizeCard({ compact = false }: { compact?: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const { hasRole } = useAuth();
  const canSetStore = hasRole('Manager');
  const { store, station, effective, saveStore, saveStation, priceTagInDash, savePriceSwitch, priceTagDesign, savePriceDesign } =
    useLabelSize();

  const [scope, setScope] = useState<Scope>(station || !canSetStore ? 'station' : 'store');
  const current = scope === 'station' ? station ?? store : store;
  const [draft, setDraft] = useState<{ w: string; h: string; dpi: LabelDpi; custom: boolean }>(() => ({
    w: String(current.w_in), h: String(current.h_in), dpi: current.dpi, custom: !presetFor(current),
  }));
  // Follow the saved size when it loads or the scope changes.
  useEffect(() => {
    setDraft({ w: String(current.w_in), h: String(current.h_in), dpi: current.dpi, custom: !presetFor(current) });
  }, [current.w_in, current.h_in, current.dpi]); // eslint-disable-line react-hooks/exhaustive-deps

  const size = useMemo(() => parseLabelSize({ w_in: draft.w, h_in: draft.h, dpi: draft.dpi }), [draft]);
  const changed = !!size && (size.w_in !== current.w_in || size.h_in !== current.h_in || size.dpi !== current.dpi
    || (scope === 'station' && !station));
  const preset = draft.custom ? 'custom' : presetFor({ w_in: Number(draft.w), h_in: Number(draft.h) }) ?? 'custom';
  const [testing, setTesting] = useState(false);
  const [reprinting, setReprinting] = useState(false);
  const last = lastPrintedTag();

  const pickPreset = (key: string | null) => {
    if (!key) return;
    if (key === 'custom') return setDraft((d) => ({ ...d, custom: true }));
    const p = LABEL_PRESETS.find((x) => x.key === key);
    if (p) setDraft((d) => ({ ...d, w: String(p.w_in), h: String(p.h_in), custom: false }));
  };

  const save = () => {
    if (!size) return;
    if (scope === 'station') {
      saveStation(size);
      enqueueSnackbar(`This computer prints ${describeLabelSize(size)}`, { variant: 'success' });
      return;
    }
    saveStore.mutate(size, {
      onSuccess: () => enqueueSnackbar(`The store prints ${describeLabelSize(size)}`, { variant: 'success' }),
      onError: () => enqueueSnackbar('Could not save the label size', { variant: 'error' }),
    });
  };

  const test = async () => {
    if (!size) return;
    setTesting(true);
    const r = await printTestLabel(size);
    setTesting(false);
    enqueueSnackbar(r.failed ? `Test label did not print: ${r.error ?? 'is the print server running?'}` : 'Test label sent',
      { variant: r.failed ? 'error' : 'success' });
  };

  const reprint = async () => {
    setReprinting(true);
    const r = await reprintLastTag();
    setReprinting(false);
    enqueueSnackbar(r.printed ? 'Reprinted the last label' : `Did not reprint: ${r.error ?? 'is the print server running?'}`,
      { variant: r.printed ? 'success' : 'error' });
  };

  const sideError = (v: string) => {
    const n = Number(v);
    return !Number.isFinite(n) || n < MIN_SIDE_IN || n > MAX_SIDE_IN;
  };

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: '#E5E5EA' }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={600}>
          What labels are you using?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Restoration tags and test labels print at this size; price tags too once the new drawing is on.
        </Typography>

        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: compact ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)' } }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Label size (inches, width x height)
              </Typography>
              <ToggleButtonGroup exclusive size="small" value={preset} onChange={(_, v) => pickPreset(v)}
                sx={{ flexWrap: 'wrap' }}>
                {LABEL_PRESETS.map((p) => (
                  <ToggleButton key={p.key} value={p.key} sx={{ textTransform: 'none', px: 1.5 }}>
                    {p.w_in} x {p.h_in}{p.note ? ` (${p.note})` : ''}
                  </ToggleButton>
                ))}
                <ToggleButton value="custom" sx={{ textTransform: 'none', px: 1.5 }}>Custom</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {preset === 'custom' && (
              <Stack direction="row" spacing={1.5} alignItems="center">
                <TextField label="Width" size="small" type="number" value={draft.w} sx={{ width: 110 }}
                  inputProps={{ step: 0.05, min: MIN_SIDE_IN, max: MAX_SIDE_IN }} error={sideError(draft.w)}
                  onChange={(e) => setDraft((d) => ({ ...d, w: e.target.value, custom: true }))} />
                <Typography>x</Typography>
                <TextField label="Height" size="small" type="number" value={draft.h} sx={{ width: 110 }}
                  inputProps={{ step: 0.05, min: MIN_SIDE_IN, max: MAX_SIDE_IN }} error={sideError(draft.h)}
                  onChange={(e) => setDraft((d) => ({ ...d, h: e.target.value, custom: true }))} />
                <Typography variant="body2" color="text.secondary">in</Typography>
              </Stack>
            )}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Printer dpi (on the printer's sticker; most thermal label printers are 203)
              </Typography>
              <ToggleButtonGroup exclusive size="small" value={draft.dpi}
                onChange={(_, v) => v && setDraft((d) => ({ ...d, dpi: v as LabelDpi }))}>
                {LABEL_DPIS.map((dpi) => (
                  <ToggleButton key={dpi} value={dpi} sx={{ px: 2 }}>{dpi}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <RadioGroup row value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <FormControlLabel value="store" control={<Radio size="small" />} disabled={!canSetStore}
                label={canSetStore ? 'Whole store' : 'Whole store (managers)'} />
              <FormControlLabel value="station" control={<Radio size="small" />} label="Only this computer" />
            </RadioGroup>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={save} disabled={!changed || saveStore.isPending}>
                Save
              </Button>
              <Button variant="outlined" onClick={test} disabled={!size || testing}
                startIcon={testing ? <CircularProgress size={16} /> : <Print />}>
                Print a test label
              </Button>
              <Button variant="outlined" onClick={reprint} disabled={!last || reprinting}
                startIcon={reprinting ? <CircularProgress size={16} /> : undefined}>
                Reprint last label
              </Button>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Printing now at <b>{describeLabelSize(effective)}</b>
              {station ? ' (this computer’s own size). ' : ' (the store size).'}
              {station && (
                <Link component="button" type="button" onClick={() => { saveStation(null); setScope(canSetStore ? 'store' : 'station'); }}>
                  Use the store size
                </Link>
              )}
            </Typography>
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={priceTagInDash}
                    disabled={!canSetStore || savePriceSwitch.isPending}
                    onChange={(e) => savePriceSwitch.mutate(e.target.checked, {
                      onSuccess: (on) => enqueueSnackbar(on ? 'Price tags now use the new drawing' : 'Price tags back to the print server drawing', { variant: 'success' }),
                      onError: () => enqueueSnackbar('Could not change the price tag drawing', { variant: 'error' }),
                    })}
                  />
                }
                label={canSetStore ? 'Use the new price tag drawing' : 'Use the new price tag drawing (managers)'}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 5.5 }}>
                Whole store. Try Print a test label first: its sample price tag is the new drawing. Off, price tags
                print as before (the print server draws them at its own size); restoration tags always use the size above.
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Price tag design
              </Typography>
              <ToggleButtonGroup exclusive size="small" value={priceTagDesign} aria-label="Price tag design"
                disabled={!canSetStore || savePriceDesign.isPending}
                onChange={(_, v: PriceTagDesign | null) => v && v !== priceTagDesign && savePriceDesign.mutate(v, {
                  onSuccess: (d) => enqueueSnackbar(d === 'perks' ? 'Price tags: Thrift+ Perks' : 'Price tags: Classic', { variant: 'success' }),
                  onError: () => enqueueSnackbar('Could not change the price tag design', { variant: 'error' }),
                })}>
                <ToggleButton value="classic" sx={{ textTransform: 'none', px: 2 }}>Classic</ToggleButton>
                <ToggleButton value="perks" sx={{ textTransform: 'none', px: 2 }}>Thrift+ Perks</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Whole store{canSetStore ? '' : ' (managers change it)'}. Only used while the new price tag drawing is
                {priceTagInDash ? ' on (it is).' : ' on (it is off now, so price tags print Classic).'} Thrift+ Perks
                adds the QR link, the perks box and the 3-DAY RETURNS or AS IS strip; made for 2.25 x 1.25 labels.
              </Typography>
            </Box>
          </Stack>
          {size && <TagPreview size={size} scale={compact ? 1 : 1.6} design={priceTagDesign} />}
        </Box>
      </CardContent>
    </Card>
  );
}
