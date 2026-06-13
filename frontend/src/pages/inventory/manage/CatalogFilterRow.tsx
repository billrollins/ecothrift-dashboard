import { Box, Typography } from '@mui/material';
import { processingTokens } from '../processing/processingTokens';

export interface CatalogFilterRowProps {
  totalCount: number;
  shownCount: number;
  search: string;
  isFetching?: boolean;
  /** Plural noun for the count line, e.g. "products" or "items". */
  entityPlural: string;
}

export function CatalogFilterRow({
  totalCount,
  shownCount,
  search,
  isFetching = false,
  entityPlural,
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
        display: 'flex',
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
    </Box>
  );
}
