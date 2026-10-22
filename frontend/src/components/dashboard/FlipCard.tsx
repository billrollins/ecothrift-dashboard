/**
 * Flip cards (owner 2026-10-22): a small corner button turns a Dashboard card over to its numbers for past weeks, so
 * the front stays small. Each side's button is a real button with a label (keyboard and screen reader friendly, no
 * hover-only), and the side you cannot see is inert: it takes no focus and is not read out.
 */
import { Box, IconButton, Tooltip, useMediaQuery } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import History from '@mui/icons-material/History';
import Today from '@mui/icons-material/Today';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { dashboardPalette } from './dashboardCardStyles';

const FLIP_MS = 450;

export function FlipButton({
  label,
  side,
  onClick,
  buttonRef,
}: {
  label: string;
  side: 'front' | 'back';
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <Tooltip title={label} arrow>
      <IconButton
        ref={buttonRef}
        size="small"
        aria-label={label}
        onClick={onClick}
        sx={{
          flexShrink: 0,
          width: { xs: 40, md: 30 },
          height: { xs: 40, md: 30 },
          // Pulls the 40px phone target into the card's corner without growing the header row.
          my: { xs: -0.75, md: -0.5 },
          mr: { xs: -0.75, md: -0.5 },
          color: dashboardPalette.muted,
          border: '1px solid',
          borderColor: dashboardPalette.softBorder,
          bgcolor: side === 'back' ? dashboardPalette.greenSoft : 'transparent',
          '& svg': { fontSize: { xs: 20, md: 17 } },
          '&:focus-visible': { outline: '2px solid', outlineColor: dashboardPalette.blue, outlineOffset: 1 },
        }}
      >
        {side === 'front' ? <History /> : <Today />}
      </IconButton>
    </Tooltip>
  );
}

/**
 * Two sides in one grid cell; the card is as tall as its taller side. `front` and `back` get their side's flip
 * button to place in their own header corner.
 */
export function FlipCard({
  name,
  front,
  back,
  backLabel = 'past weeks',
  frontLabel = 'this week',
  sx,
}: {
  /** What the card is, for the button labels: "Show past weeks: Buying". */
  name: string;
  front: (flipButton: ReactNode) => ReactNode;
  back: (flipButton: ReactNode) => ReactNode;
  backLabel?: string;
  frontLabel?: string;
  sx?: SxProps<Theme>;
}) {
  const [flipped, setFlipped] = useState(false);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const frontButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);

  // `inert` through the DOM: React 18 does not pass it as a prop.
  useLayoutEffect(() => {
    frontRef.current?.toggleAttribute('inert', flipped);
    backRef.current?.toggleAttribute('inert', !flipped);
    if (moveFocus.current) {
      moveFocus.current = false;
      // Keep keyboard and screen reader users on the button they used, now on the side they turned to.
      (flipped ? backButton : frontButton).current?.focus();
    }
  }, [flipped]);

  const flip = () => {
    moveFocus.current = true;
    setFlipped((value) => !value);
  };

  const faceSx = {
    gridArea: '1 / 1',
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    '& > *': { flex: 1, minWidth: 0 },
  } as const;

  return (
    <Box sx={{ perspective: '1600px', display: 'grid', minWidth: 0, minHeight: 0, ...sx }}>
      <Box
        data-flipped={flipped ? 'true' : 'false'}
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gridTemplateRows: 'minmax(0, 1fr)',
          minWidth: 0,
          minHeight: 0,
          transformStyle: 'preserve-3d',
          transition: reduceMotion ? 'none' : `transform ${FLIP_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1)`,
          transform: flipped ? 'rotateY(180deg)' : 'none',
        }}
      >
        <Box ref={frontRef} aria-hidden={flipped} sx={faceSx}>
          {front(
            <FlipButton
              side="front"
              label={`Show ${backLabel}: ${name}`}
              onClick={flip}
              buttonRef={frontButton}
            />,
          )}
        </Box>
        <Box ref={backRef} aria-hidden={!flipped} sx={{ ...faceSx, transform: 'rotateY(180deg)' }}>
          {back(
            <FlipButton
              side="back"
              label={`Show ${frontLabel}: ${name}`}
              onClick={flip}
              buttonRef={backButton}
            />,
          )}
        </Box>
      </Box>
    </Box>
  );
}
