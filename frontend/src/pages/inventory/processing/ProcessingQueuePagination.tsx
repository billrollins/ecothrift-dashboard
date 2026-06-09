import { Box, Button, Typography } from '@mui/material';

/** Up to ``windowSize`` consecutive 0-based page indices around the current page. */
export function windowedPageIndices(page: number, totalPages: number, windowSize = 3): number[] {
  if (totalPages <= 0) return [];
  if (totalPages <= windowSize) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const start = page === 0 ? 0 : Math.min(page, totalPages - windowSize);
  return Array.from({ length: windowSize }, (_, i) => start + i);
}

export interface ProcessingQueuePaginationProps {
  page: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** e.g. ``Lines 126–150 · 742 match (744 on order)`` */
  rangeCaption: string;
}

function PageBullet({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const isNav = label === 'BEG' || label === 'END';
  return (
    <Button
      size="small"
      variant={active ? 'contained' : 'text'}
      color={active ? 'primary' : 'inherit'}
      disabled={disabled}
      onClick={onClick}
      sx={{
        minWidth: isNav ? 36 : 30,
        px: isNav ? 0.85 : 0.5,
        py: 0.2,
        fontSize: isNav ? '0.68rem' : '0.72rem',
        fontWeight: active ? 800 : isNav ? 700 : 600,
        fontFamily: !isNav ? 'ui-monospace, monospace' : undefined,
        letterSpacing: isNav ? '0.05em' : undefined,
        lineHeight: 1.2,
        borderRadius: isNav ? 1 : '50%',
        color: active ? undefined : 'text.secondary',
      }}
    >
      {label}
    </Button>
  );
}

export function ProcessingQueuePagination({
  page,
  totalCount,
  pageSize,
  onPageChange,
  rangeCaption,
}: ProcessingQueuePaginationProps) {
  const totalPages = Math.max(0, Math.ceil(totalCount / pageSize));
  const safePage = totalPages > 0 ? Math.min(Math.max(page, 0), totalPages - 1) : 0;
  const pages = windowedPageIndices(safePage, totalPages);
  const atFirst = safePage === 0;
  const atLast = totalPages <= 1 || safePage >= totalPages - 1;
  const showPageControls = totalPages > 1;

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        px: 1.25,
        py: 0.65,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50'),
        flexShrink: 0,
        minHeight: 40,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          fontSize: '0.72rem',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {rangeCaption}
      </Typography>

      {showPageControls ? (
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.15,
            ml: 'auto',
            px: 0.35,
            py: 0.2,
            borderRadius: 1.25,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <PageBullet label="BEG" disabled={atFirst} onClick={() => onPageChange(0)} />
          {pages.map((p) => (
            <PageBullet
              key={p}
              label={String(p + 1)}
              active={p === safePage}
              onClick={() => onPageChange(p)}
            />
          ))}
          <PageBullet label="END" disabled={atLast} onClick={() => onPageChange(totalPages - 1)} />
        </Box>
      ) : null}
    </Box>
  );
}
