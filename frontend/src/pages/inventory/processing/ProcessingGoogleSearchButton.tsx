import Search from '@mui/icons-material/Search';
import { IconButton, Tooltip, type SxProps, type Theme } from '@mui/material';
import { buildProcessingGoogleQuery, googleSearchUrl } from './processingGoogleQuery';
import { processingTokens } from './processingTokens';

export interface ProcessingGoogleSearchButtonProps {
  brand?: string;
  title?: string;
  model?: string;
  searchTags?: string[];
  iconSize?: number;
  color?: string;
  sx?: SxProps<Theme>;
}

/** Opens Google search for listing identity fields (brand, title, model, tags). */
export function ProcessingGoogleSearchButton({
  brand,
  title,
  model,
  searchTags,
  iconSize = 15,
  color = processingTokens.textSoft,
  sx,
}: ProcessingGoogleSearchButtonProps) {
  const href = googleSearchUrl(
    buildProcessingGoogleQuery({ brand, title, model, searchTags }),
  );
  if (!href) return null;

  return (
    <Tooltip title="Search on Google" enterDelay={300} disableInteractive>
      <IconButton
        size="small"
        component="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Search on Google"
        onClick={(e) => e.stopPropagation()}
        sx={{
          p: 0.25,
          color,
          '&:hover': { bgcolor: 'action.hover' },
          ...sx,
        }}
      >
        <Search sx={{ fontSize: iconSize }} />
      </IconButton>
    </Tooltip>
  );
}
