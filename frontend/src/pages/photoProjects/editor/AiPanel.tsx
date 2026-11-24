/**
 * The AI tab (Dash #209): Grok, through the AI image router. Every run makes a new version from the one on screen and
 * shows at once as a working tile; it keeps that version's shape. Desk follows the mockup; phone packs it into the
 * same fixed-height area as the Edit tools.
 */
import { useState } from 'react';
import { Box, Button, Chip, TextField } from '@mui/material';
import type { AiAction } from '../../../api/photoProjects.api';
import { ColorPickSwatch, SectionLabel, SIDE_SCROLL, Swatch } from '../../../components/photoEditor/EditTools';

export interface AiRun {
  action: AiAction;
  color?: string;
  words?: string;
}

const FILTERS: { action: AiAction; label: string }[] = [
  { action: 'studio', label: 'Studio shot' },
  { action: 'room', label: 'Room scene' },
  { action: 'holiday', label: 'Holiday scene' },
  { action: 'clean_up', label: 'Clean up' },
];

/** `onRun` resolves true once the run has started (its error is shown by the editor). */
export function AiPanel({ layout, disabled, onRun }: { layout: 'desk' | 'phone'; disabled: boolean; onRun: (run: AiRun) => Promise<boolean> }) {
  const [color, setColor] = useState('#ffffff');
  const [custom, setCustom] = useState<string | null>(null);
  const [words, setWords] = useState('');
  const phone = layout === 'phone';

  const swatches = (
    <>
      <Swatch bg="#ffffff" on={color === '#ffffff'} label="White" disabled={disabled} onClick={() => setColor('#ffffff')} />
      <Swatch bg="#000000" on={color === '#000000'} label="Black" disabled={disabled} onClick={() => setColor('#000000')} />
      <ColorPickSwatch
        value={custom}
        on={custom != null && color === custom}
        disabled={disabled}
        onPick={(hex) => {
          setCustom(hex);
          setColor(hex);
        }}
      />
    </>
  );
  const removeBackground = (
    <Button variant="outlined" disabled={disabled} onClick={() => onRun({ action: 'remove_background', color })} sx={{ flex: 1, fontWeight: 700, py: phone ? 1 : 1.25 }}>
      Remove background
    </Button>
  );
  const runWords = () => {
    const text = words.trim();
    if (!text) return;
    onRun({ action: 'free', words: text }).then((ok) => ok && setWords(''));
  };

  if (phone) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, px: 1.75, py: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center' }}>
          {removeBackground}
          {swatches}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.875, ...SIDE_SCROLL, mx: -1.75, px: 1.75 }}>
          {[{ action: 'optimize' as AiAction, label: 'Optimize' }, ...FILTERS].map((f) => (
            <Chip key={f.action} label={f.label} clickable disabled={disabled} variant="outlined" onClick={() => onRun({ action: f.action })} sx={{ fontWeight: 600, flex: 'none' }} />
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Tell Grok what to change"
            value={words}
            disabled={disabled}
            onChange={(e) => setWords(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runWords();
            }}
          />
          <Button variant="contained" disabled={disabled || !words.trim()} onClick={runWords} sx={{ fontWeight: 700 }}>Run</Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ px: 2.25, py: 2, display: 'flex', flexDirection: 'column', gap: 2.25 }}>
      <Box>
        <Box sx={{ display: 'flex' }}>{removeBackground}</Box>
        <Box sx={{ display: 'flex', gap: 1.5, mt: 1.25, alignItems: 'center' }}>{swatches}</Box>
      </Box>
      <Button variant="outlined" disabled={disabled} onClick={() => onRun({ action: 'optimize' })} sx={{ fontWeight: 700, py: 1.25 }}>
        Optimize
      </Button>
      <Box>
        <SectionLabel>Filters</SectionLabel>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.875 }}>
          {FILTERS.map((f) => (
            <Chip key={f.action} label={f.label} clickable disabled={disabled} variant="outlined" onClick={() => onRun({ action: f.action })} sx={{ fontWeight: 600 }} />
          ))}
        </Box>
      </Box>
      <Box>
        <SectionLabel>Free edit</SectionLabel>
        <TextField
          fullWidth
          multiline
          minRows={3}
          maxRows={3}
          placeholder="Tell Grok what to change"
          value={words}
          disabled={disabled}
          onChange={(e) => setWords(e.target.value)}
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.25 }}>
          <Button variant="contained" disabled={disabled || !words.trim()} onClick={runWords} sx={{ minWidth: 90, fontWeight: 700 }}>Run</Button>
        </Box>
      </Box>
    </Box>
  );
}
