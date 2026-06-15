import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { processingTokens } from '../processing/processingTokens';

export interface CatalogFilterRowProps {
  totalCount: number;
  shownCount: number;
  search: string;
  isFetching?: boolean;
  /** Plural noun for the count line, e.g. "products" or "items". */
  entityPlural: string;
  filterChips?: ReactNode;
  /** Centered control above the results table (e.g. reset column widths). */
  columnReset?: ReactNode;
  /** Right-aligned actions above the results table (e.g. New product). */
  actions?: ReactNode;
}

export function CatalogFilterRow({
  totalCount,
  shownCount,
  search,
  isFetching = false,
  entityPlural,
  filterChips,
  columnReset,
  actions,
}: CatalogFilterRowProps) {
  const q = search.trim();
  const capped = totalCount > shownCount;

  let summary: string;
  if (q) {
    summary =
      capped ?
        `${shownCount.toLocaleString()} of ${totalCount.toLocaleString()} matching`
      : `${totalCount.toLocaleString()} matching`;
  } else if (capped) {
    summary = `${shownCount.toLocaleString()} of ${totalCount.toLocaleString()} ${entityPlural}`;
  } else {
    summary = `${totalCount.toLocaleString()} ${totalCount === 1 ? entityPlural.replace(/s$/, '') : entityPlural}`;
  }

  return (
    <Box
      sx={{
        flexShrink: 0,
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.75,
        minHeight: 48,
        borderBottom: 1,
        borderColor: processingTokens.border,
        bgcolor: 'background.paper',
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, justifySelf: 'start' }}>
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.72rem',
            fontWeight: 600,
            color: processingTokens.textMute,
            whiteSpace: 'nowrap',
          }}
        >
          {summary}
          {isFetching ? ' · searching…' : null}
        </Typography>
        {filterChips ?
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
            {filterChips}
          </Stack>
        : null}
      </Box>
      <Box sx={{ justifySelf: 'center' }}>{columnReset}</Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', justifySelf: 'end', minWidth: 0 }}>
        {actions}
      </Box>
    </Box>
  );
}
