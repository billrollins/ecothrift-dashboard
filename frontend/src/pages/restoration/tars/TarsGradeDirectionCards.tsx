import {
  Box,
  ButtonBase,
  Card,
  CardActionArea,
  Chip,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import SwipeLeft from '@mui/icons-material/SwipeLeft';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TarsGradeDirectionRow } from './tarsWorkTypes';
import { fmtUsd } from './tarsProfit';
import { tarsTokens as eco } from './tarsTokens';

const CARD_WIDTH = 208;
const CARD_MIN_HEIGHT = 132;
const CARD_GAP = 8;
const CARD_BORDER_WIDTH = 2;

interface TarsGradeDirectionCardsProps {
  directions: TarsGradeDirectionRow[];
  /** Bench-only: open the per-grade eval dialog to view/enter details (does NOT select). */
  onOpenEval?: (grade: string) => void;
  /** Bench-only: choose this grade as the decision (the filled bottom bar). */
  onChooseGrade?: (grade: string) => void;
  readOnly?: boolean;
}

export function TarsGradeDirectionCards({
  directions,
  onOpenEval,
  onChooseGrade,
  readOnly,
}: TarsGradeDirectionCardsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth - clientWidth > 4;
    setHasOverflow(overflow);
    setCanScrollLeft(overflow && scrollLeft > 4);
    setCanScrollRight(overflow && scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    el.addEventListener('scroll', updateScrollState, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', updateScrollState);
    };
  }, [directions, updateScrollState]);

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const cardStride = CARD_WIDTH + CARD_GAP;
    const cardsPerPage = Math.max(1, Math.floor((el.clientWidth + CARD_GAP) / cardStride));
    el.scrollBy({ left: direction * cardsPerPage * cardStride, behavior: 'smooth' });
  }, []);

  if (directions.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" py={1}>
        No processor grade values on this item - set grade scale in the queue first.
      </Typography>
    );
  }

  const hiddenCount = hasOverflow ? directions.length : 0;

  return (
    <Stack spacing={0.75}>
      {hasOverflow ?
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            px: 1.25,
            py: 0.85,
            borderRadius: 1.5,
            bgcolor: '#fff7ed',
            border: '2px solid #fb923c',
            boxShadow: '0 0 0 3px rgba(251, 146, 60, 0.18)',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={0.75} minWidth={0}>
            <SwipeLeft sx={{ fontSize: 22, color: '#c2410c', flexShrink: 0 }} />
            <Box minWidth={0}>
              <Typography variant="body2" fontWeight={900} sx={{ color: '#9a3412', lineHeight: 1.2 }}>
                {canScrollRight ?
                  `${hiddenCount} grade options - not all visible on screen`
                : canScrollLeft ?
                  'More grades to the left - scroll back to compare'
                : `${hiddenCount} grade options - scroll to review every one`}
              </Typography>
              <Typography variant="caption" sx={{ color: '#c2410c', fontWeight: 700 }}>
                {canScrollRight ?
                  'Use the orange arrow or swipe right before choosing a grade'
                : 'Use the arrows or swipe sideways to see every option'}
              </Typography>
            </Box>
          </Stack>
          <Chip
            label={`${directions.length} total`}
            size="small"
            sx={{
              flexShrink: 0,
              height: 26,
              fontWeight: 900,
              bgcolor: '#ea580c',
              color: '#fff',
              '& .MuiChip-label': { px: 1.1 },
            }}
          />
        </Box>
      : null}

      <Box sx={{ position: 'relative' }}>
        {canScrollLeft ?
          <>
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 56,
                zIndex: 2,
                pointerEvents: 'none',
                background: 'linear-gradient(90deg, rgba(248,250,252,0.98) 35%, transparent)',
              }}
            />
            <IconButton
              aria-label="Scroll to earlier grades"
              onClick={() => scrollByPage(-1)}
              sx={{
                position: 'absolute',
                left: 4,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 3,
                bgcolor: '#fff',
                border: '2px solid #cbd5e1',
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.18)',
                '&:hover': { bgcolor: '#f8fafc' },
              }}
            >
              <ChevronLeft />
            </IconButton>
          </>
        : null}

        {canScrollRight ?
          <>
            <Box
              sx={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 72,
                zIndex: 2,
                pointerEvents: 'none',
                background: 'linear-gradient(270deg, rgba(255,247,237,0.98) 20%, transparent)',
              }}
            />
            <IconButton
              aria-label="Scroll to more grades"
              onClick={() => scrollByPage(1)}
              sx={{
                position: 'absolute',
                right: 4,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 3,
                bgcolor: '#ea580c',
                color: '#fff',
                border: '2px solid #c2410c',
                boxShadow: '0 10px 24px rgba(234, 88, 12, 0.35)',
                animation: 'gradeCarouselNudge 1.4s ease-in-out infinite',
                '@keyframes gradeCarouselNudge': {
                  '0%, 100%': { transform: 'translateY(-50%) translateX(0)' },
                  '50%': { transform: 'translateY(-50%) translateX(4px)' },
                },
                '&:hover': { bgcolor: '#c2410c' },
              }}
            >
              <ChevronRight />
            </IconButton>
          </>
        : null}

        <Box
          ref={scrollRef}
          sx={{
            display: 'flex',
            alignItems: 'stretch',
            gap: `${CARD_GAP}px`,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollSnapType: 'x mandatory',
            scrollBehavior: 'smooth',
            pb: 0.25,
            px: canScrollLeft || canScrollRight ? 0.5 : 0,
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': { height: 8 },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: '#cbd5e1',
              borderRadius: 999,
            },
          }}
        >
          {directions.map((row) => (
            <Box key={row.grade} sx={{ scrollSnapAlign: 'start', flexShrink: 0, display: 'flex' }}>
              <GradeCard
                row={row}
                readOnly={readOnly}
                onOpen={readOnly || !onOpenEval ? undefined : () => onOpenEval(row.grade)}
                onChoose={readOnly || !onChooseGrade ? undefined : () => onChooseGrade(row.grade)}
              />
            </Box>
          ))}
        </Box>
      </Box>

      {hasOverflow ?
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.75} flexWrap="wrap" useFlexGap>
          {directions.map((row) => (
            <Box
              key={row.grade}
              title={row.grade}
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: row.isSelected ? eco.greenDark : '#cbd5e1',
                border: '2px solid',
                borderColor: row.isSelected ? '#14532d' : 'transparent',
                flexShrink: 0,
              }}
            />
          ))}
          <Typography variant="caption" fontWeight={800} color="warning.dark" sx={{ ml: 0.5 }}>
            All {directions.length} grades - keep scrolling
          </Typography>
        </Stack>
      : null}
    </Stack>
  );
}

type StatusTone = 'decision' | 'planned' | 'empty';

function cardStatus(row: TarsGradeDirectionRow, readOnly?: boolean): { label: string; tone: StatusTone } {
  if (row.isSelected) return { label: 'Your decision', tone: 'decision' };
  if (readOnly) {
    if (row.estimateHours > 0 || row.orderCount > 0) return { label: 'Planned', tone: 'planned' };
    return { label: '-', tone: 'empty' };
  }
  return { label: 'Choose this grade', tone: row.estimateHours > 0 || row.orderCount > 0 ? 'planned' : 'empty' };
}

const STATUS_BAR_STYLES: Record<
  StatusTone,
  { bgcolor: string; color: string; borderColor: string }
> = {
  decision: { bgcolor: eco.greenDark, color: '#fff', borderColor: eco.greenDark },
  planned: { bgcolor: '#eff6ff', color: '#1d4ed8', borderColor: '#93c5fd' },
  empty: { bgcolor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' },
};

function GradeCard({
  row,
  onOpen,
  onChoose,
  readOnly,
}: {
  row: TarsGradeDirectionRow;
  onOpen?: () => void;
  onChoose?: () => void;
  readOnly?: boolean;
}) {
  const status = cardStatus(row, readOnly);
  const barStyle = STATUS_BAR_STYLES[status.tone];
  const barInteractive = !readOnly && !!onChoose && !row.isSelected;

  const barContent = (
    <Typography
      variant="caption"
      fontWeight={800}
      sx={{
        fontSize: 9,
        letterSpacing: status.tone === 'decision' ? '0.06em' : '0.03em',
        textTransform: status.tone === 'decision' ? 'uppercase' : 'none',
        lineHeight: 1.2,
      }}
    >
      {status.label}
    </Typography>
  );

  const barSx = {
    width: '100%',
    minHeight: 30,
    flexShrink: 0,
    px: 0.75,
    py: 0.5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    bgcolor: barStyle.bgcolor,
    color: barStyle.color,
    borderTop: '1px solid',
    borderColor: barStyle.borderColor,
    textAlign: 'center' as const,
    boxSizing: 'border-box' as const,
  };

  return (
    <Card
      variant="outlined"
      sx={{
        width: CARD_WIDTH,
        minHeight: CARD_MIN_HEIGHT,
        height: '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        borderWidth: CARD_BORDER_WIDTH,
        borderStyle: 'solid',
        borderColor: row.isSelected ? eco.greenDark : 'divider',
        bgcolor: row.isSelected ? '#f0fdf4' : 'background.paper',
        boxShadow: row.isSelected ? `0 0 0 2px ${eco.greenAlpha22}` : 'none',
      }}
    >
      <CardActionArea
        onClick={readOnly ? undefined : onOpen}
        disabled={readOnly}
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          py: 0,
          ...(readOnly ? { cursor: 'default' } : {}),
        }}
      >
        <Box sx={{ flex: 1, px: 0.75, pt: 0.65, pb: 0.5, position: 'relative', minHeight: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Typography
              variant="caption"
              fontWeight={900}
              title={row.grade}
              sx={{
                fontSize: 11,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                minWidth: 52,
                pt: 0.15,
                color: row.isSelected ? '#14532d' : 'text.primary',
              }}
            >
              {row.grade}
            </Typography>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <ReceiptLine label="Price" value={fmtUsd(row.processorValue)} />
              <ReceiptLine
                label={`Labor (${row.estimateHours || 0}h)`}
                value={fmtUsd(row.laborCost)}
              />
              <ReceiptLine
                label={`Orders (${row.orderCount})`}
                value={fmtUsd(row.ordersCost)}
              />
              <Divider sx={{ my: 0.35, borderStyle: 'dashed' }} />
              <ReceiptLine label="Restore cost" value={fmtUsd(row.restoreCost)} bold />
            </Box>
          </Box>
        </Box>
      </CardActionArea>

      {barInteractive ?
        <ButtonBase
          onClick={onChoose}
          sx={{
            ...barSx,
            '&:hover': { filter: 'brightness(0.95)' },
          }}
        >
          {barContent}
        </ButtonBase>
      : <Box sx={barSx}>{barContent}</Box>}
    </Card>
  );
}

function ReceiptLine({
  label,
  value,
  valueColor = 'text.primary',
  bold = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 0.75, lineHeight: 1.35 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        {label}
      </Typography>
      <Typography
        variant="caption"
        fontFamily="monospace"
        fontWeight={bold ? 800 : 700}
        sx={{ fontSize: 10, color: valueColor, whiteSpace: 'nowrap' }}
      >
        {value}
      </Typography>
    </Box>
  );
}
