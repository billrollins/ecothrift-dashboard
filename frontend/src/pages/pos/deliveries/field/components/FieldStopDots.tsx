import { useRef } from 'react';
import { Box, Stack } from '@mui/material';
import type { DeliveryRunStop } from '../../../../../types/pos.types';
import type { DotTone } from '../fieldStepUtils';
import { ecoFieldDotColor, ecoFieldDotRing } from '../ecoFieldTheme';

type Props = {
  stops: DeliveryRunStop[];
  selectedId: number | null;
  toneFor: (stop: DeliveryRunStop) => DotTone;
  onSelect: (stopId: number) => void;
  disabled?: boolean;
};

export function FieldStopDots({ stops, selectedId, toneFor, onSelect, disabled }: Props) {
  const scrubbing = useRef(false);

  const pickFromClientX = (clientX: number, target: HTMLElement) => {
    if (disabled) return;
    const rect = target.getBoundingClientRect();
    if (!stops.length || rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const index = Math.min(stops.length - 1, Math.floor(ratio * stops.length));
    onSelect(stops[index].id);
  };

  return (
    <Stack
      direction="row"
      spacing={0.75}
      alignItems="center"
      justifyContent="center"
      role="tablist"
      aria-label="Deliveries in this step"
      onPointerDown={(e) => {
        if (disabled) return;
        scrubbing.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pickFromClientX(e.clientX, e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (!scrubbing.current) return;
        pickFromClientX(e.clientX, e.currentTarget);
      }}
      onPointerUp={() => {
        scrubbing.current = false;
      }}
      onPointerCancel={() => {
        scrubbing.current = false;
      }}
      sx={{
        px: 2,
        py: 1,
        touchAction: 'none',
        overflowX: 'auto',
        minHeight: 36,
      }}
    >
      {stops.map((stop, index) => {
        const selected = stop.id === selectedId;
        const tone = toneFor(stop);
        return (
          <Box
            key={stop.id}
            role="tab"
            aria-selected={selected}
            aria-label={`Stop ${index + 1}, ${tone}`}
            onClick={() => {
              if (!disabled) onSelect(stop.id);
            }}
            sx={{
              width: selected ? 22 : 9,
              height: 9,
              borderRadius: 99,
              bgcolor: ecoFieldDotColor(tone),
              boxShadow: selected ? `0 0 0 4px ${ecoFieldDotRing(tone)}` : 'none',
              transition: 'width 160ms ease, background-color 160ms ease',
              flexShrink: 0,
              cursor: disabled ? 'default' : 'pointer',
              opacity: disabled && !selected ? 0.55 : 1,
            }}
          />
        );
      })}
    </Stack>
  );
}
