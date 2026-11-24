/**
 * The Edit tab's tools (Dash #209): Crop, Light, Color, Looks, Background, then Reset / Save as new version.
 * Desk: every tool in the side panel. Phone: one tool open at a time in a fixed-height slot, so nothing moves.
 */
import { useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { Box, Button, ButtonBase, Chip, CircularProgress, IconButton, Slider, Typography } from '@mui/material';
import RotateLeftRounded from '@mui/icons-material/RotateLeftRounded';
import RotateRightRounded from '@mui/icons-material/RotateRightRounded';
import type { CropStageHandle } from './CropStage';
import { BACKDROPS, LOOKS, RATIOS, RATIO_LABEL, type EditState } from './editState';
import { CHECKER } from './PicturePreview';
import type { Adjust, Rect } from './pixels';
import type { PhotoEdit } from './usePhotoEdit';

export const RAINBOW = 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)';
/** A row that scrolls sideways on a phone without showing a scrollbar. */
export const SIDE_SCROLL = { overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } } as const;
const TOOLS = ['Crop', 'Light', 'Color', 'Looks', 'Background'] as const;
type Tool = (typeof TOOLS)[number];

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.09em', color: 'text.secondary', textTransform: 'uppercase', mb: 1 }}>
      {children}
    </Typography>
  );
}

export function Swatch({ bg, on, label, onClick, disabled, children }: {
  bg: string;
  on: boolean;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <ButtonBase
      aria-label={label}
      aria-pressed={on}
      title={label}
      disabled={disabled}
      onClick={onClick}
      sx={{
        position: 'relative', width: 32, height: 32, flex: 'none', borderRadius: '50%', border: '1px solid #b9c0b6',
        background: bg, outline: on ? '3px solid #2e7d32' : 'none', outlineOffset: 2, opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </ButtonBase>
  );
}

/** A swatch that opens the device's color picker; shows the picked color once one is chosen. */
export function ColorPickSwatch({ value, on, onPick, disabled }: { value: string | null; on: boolean; onPick: (hex: string) => void; disabled?: boolean }) {
  return (
    <Swatch bg={on && value ? `radial-gradient(${value} 55%, transparent 56%), ${RAINBOW}` : RAINBOW} on={on} label="Pick a color" disabled={disabled}>
      <Box
        component="input"
        type="color"
        aria-label="Pick a color"
        disabled={disabled}
        value={value ?? '#4fc3f7'}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onPick(e.target.value)}
        sx={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', p: 0, border: 0 }}
      />
    </Swatch>
  );
}

function SliderRow({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, height: 30 }}>
      <Typography sx={{ width: 78, flex: 'none', fontSize: 13 }}>{label}</Typography>
      <Slider
        size="small"
        aria-label={label}
        min={-100}
        max={100}
        value={value}
        track={false}
        disabled={disabled}
        onChange={(_, v) => onChange(v as number)}
        onDoubleClick={() => onChange(0)}
        sx={{ flex: 1, mr: 1 }}
      />
    </Box>
  );
}

interface Props {
  edit: PhotoEdit;
  layout: 'desk' | 'phone';
  stage: RefObject<CropStageHandle | null>;
  /** Crop to content: place this box in the frame. */
  onFit: (box: Rect) => void;
  /** Background on a busy photo: run AI Remove background instead. */
  onRemoveBackground: () => void;
  onSave: () => void;
  saving: boolean;
  /** No picture to edit (loading, or an AI version still working). */
  disabled: boolean;
}

export function EditTools({ edit, layout, stage, onFit, onRemoveBackground, onSave, saving, disabled }: Props) {
  const [tool, setTool] = useState<Tool>('Crop');
  const { state, set, info } = edit;
  const setAdjust = (patch: Partial<Adjust>) => set({ adjust: { ...state.adjust, ...patch } });
  const swappable = Boolean(info && (info.plain || info.seeThrough));
  const custom = state.backdrop && state.backdrop !== 'clear' && !BACKDROPS.some((b) => b.color === state.backdrop) ? state.backdrop : null;
  const phone = layout === 'phone';

  const cropToContent = () => {
    const box = edit.findContent();
    if (!box) return;
    if (!edit.cropping) edit.startCrop('free');
    onFit(box);
  };

  const crop = (
    <>
      <Box sx={{ display: 'flex', flexWrap: phone ? 'nowrap' : 'wrap', gap: 0.875, ...(phone ? SIDE_SCROLL : {}), mx: phone ? -1.75 : 0, px: phone ? 1.75 : 0 }}>
        {RATIOS.map((r) => (
          <Chip
            key={r}
            label={RATIO_LABEL[r]}
            clickable
            disabled={disabled}
            color={edit.cropping === r ? 'primary' : 'default'}
            variant={edit.cropping === r ? 'filled' : 'outlined'}
            onClick={() => (edit.cropping === r ? edit.stopCrop() : edit.startCrop(r))}
            sx={{ fontWeight: 600, flex: 'none' }}
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mt: 1.25 }}>
        <Button variant="outlined" sx={{ flex: 1, whiteSpace: 'nowrap' }} disabled={disabled || !swappable} onClick={cropToContent}>
          Crop to content
        </Button>
        <IconButton aria-label="Turn left" disabled={disabled} onClick={() => edit.turnBy(-1)} sx={{ border: '1px solid', borderColor: 'primary.main', borderRadius: '8px', color: 'primary.main' }}>
          <RotateLeftRounded />
        </IconButton>
        <IconButton aria-label="Turn right" disabled={disabled} onClick={() => edit.turnBy(1)} sx={{ border: '1px solid', borderColor: 'primary.main', borderRadius: '8px', color: 'primary.main' }}>
          <RotateRightRounded />
        </IconButton>
        <Button
          variant="contained"
          disabled={disabled || !edit.cropping}
          onClick={() => stage.current && edit.applyCrop(stage.current.getCrop())}
        >
          Apply
        </Button>
      </Box>
    </>
  );

  const light = (
    <>
      <SliderRow label="Brightness" value={state.adjust.brightness} disabled={disabled} onChange={(v) => setAdjust({ brightness: v })} />
      <SliderRow label="Contrast" value={state.adjust.contrast} disabled={disabled} onChange={(v) => setAdjust({ contrast: v })} />
    </>
  );

  const color = (
    <>
      <SliderRow label="Saturation" value={state.adjust.saturation} disabled={disabled} onChange={(v) => setAdjust({ saturation: v })} />
      <SliderRow label="Warmth" value={state.adjust.warmth} disabled={disabled} onChange={(v) => setAdjust({ warmth: v })} />
      <SliderRow label="Hue" value={state.adjust.hue} disabled={disabled} onChange={(v) => setAdjust({ hue: v })} />
    </>
  );

  const looks = (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.875 }}>
      {LOOKS.map((l) => (
        <Chip
          key={l.key}
          label={l.label}
          clickable
          disabled={disabled}
          color={state.look === l.key ? 'primary' : 'default'}
          variant={state.look === l.key ? 'filled' : 'outlined'}
          onClick={() => set({ look: state.look === l.key ? '' : l.key })}
          sx={{ fontWeight: 600 }}
        />
      ))}
    </Box>
  );

  const pick = (b: EditState['backdrop']) => set({ backdrop: state.backdrop === b ? null : b });
  const background = swappable || disabled ? (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', py: 0.5 }}>
      <Swatch bg={CHECKER} on={state.backdrop === 'clear'} label="See-through" disabled={disabled} onClick={() => pick('clear')} />
      {BACKDROPS.map((b) => (
        <Swatch key={b.color} bg={b.color} on={state.backdrop === b.color} label={b.label} disabled={disabled} onClick={() => pick(b.color)} />
      ))}
      <ColorPickSwatch value={custom} on={custom != null} disabled={disabled} onPick={(hex) => set({ backdrop: hex })} />
    </Box>
  ) : (
    <Button variant="outlined" fullWidth onClick={onRemoveBackground}>Remove background (AI)</Button>
  );

  const footer = (
    <Box sx={{ display: 'flex', gap: 1.25, px: phone ? 1.75 : 2.25, py: 1.5, borderTop: '1px solid #dfe3dc' }}>
      <Button disabled={!edit.dirty || saving} onClick={edit.reset} sx={{ fontWeight: 700 }}>Reset</Button>
      <Button
        variant="contained"
        disabled={!edit.dirty || saving || disabled}
        onClick={onSave}
        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        sx={{ flex: 1, fontWeight: 700 }}
      >
        Save as new version
      </Button>
    </Box>
  );

  if (phone) {
    const slot: Record<Tool, ReactNode> = { Crop: crop, Light: light, Color: color, Looks: looks, Background: background };
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ display: 'flex', gap: 0.75, px: 1.5, pt: 1.25 }}>
          {TOOLS.map((t) => (
            <ButtonBase
              key={t}
              onClick={() => setTool(t)}
              sx={{
                flex: 'auto', py: 0.875, px: 0.5, borderRadius: '8px', fontSize: 13, fontWeight: 700,
                color: tool === t ? 'primary.dark' : 'text.secondary', bgcolor: tool === t ? '#e3efdf' : 'transparent',
              }}
            >
              {t}
            </ButtonBase>
          ))}
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, px: 1.75, pt: 1.25, overflow: 'hidden' }}>{slot[tool]}</Box>
        {footer}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2.25, pt: 2, pb: 1, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
        <Box><SectionLabel>Crop</SectionLabel>{crop}</Box>
        <Box><SectionLabel>Light</SectionLabel>{light}</Box>
        <Box><SectionLabel>Color</SectionLabel>{color}</Box>
        <Box><SectionLabel>Looks</SectionLabel>{looks}</Box>
        <Box><SectionLabel>Background</SectionLabel>{background}</Box>
      </Box>
      {footer}
    </Box>
  );
}
