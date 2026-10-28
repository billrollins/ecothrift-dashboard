/**
 * "Google it": opens a Google search for an object in a new tab (brand + title + model; "Generic" and repeats skipped).
 * Sits next to the copy button in an object window's header (Item, Product); any object surface can use it.
 */
import { Button, type SxProps, type Theme } from '@mui/material';
import { IconSearch } from '../../icons/ecoIcons';
import { buildProcessingGoogleQuery, googleSearchUrl } from '../../pages/inventory/processing/processingGoogleQuery';

export function googleItUrl(parts: { brand?: string; title?: string; model?: string; extra?: string[] }): string {
  const title = (parts.title ?? '').trim();
  // "KitchenAid Stand Mixer" already says KitchenAid: don't search it twice.
  const inTitle = (word?: string) => Boolean(word?.trim()) && title.toLowerCase().includes(word!.trim().toLowerCase());
  return googleSearchUrl(
    buildProcessingGoogleQuery({
      brand: inTitle(parts.brand) ? '' : parts.brand,
      title,
      model: inTitle(parts.model) ? '' : parts.model,
      searchTags: parts.extra,
    }),
  );
}

export function GoogleItLink({
  brand,
  title,
  model,
  extra,
  sx,
}: {
  brand?: string;
  title?: string;
  model?: string;
  /** More words after the model (a product's search tags). */
  extra?: string[];
  sx?: SxProps<Theme>;
}) {
  const href = googleItUrl({ brand, title, model, extra });
  if (!href) return null;
  return (
    <Button
      size="small"
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      startIcon={<IconSearch sx={{ fontSize: 16 }} />}
      onClick={(e) => e.stopPropagation()}
      sx={{ minWidth: 0, px: 0.75, py: 0.25, fontWeight: 700, textTransform: 'none', whiteSpace: 'nowrap', ...sx }}
    >
      Google it
    </Button>
  );
}
