import { Box, ButtonBase, CircularProgress, Skeleton } from '@mui/material';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import type { ReactNode } from 'react';
import type { PhotoDropDTO } from '../../api/photoDrops.api';
import { usePhotoDropThumb } from '../../hooks/usePhotoDrops';
import { t } from '../../i18n/routines';
import { useLanguage } from '../../i18n/useLanguage';

/** "Used in Processing" when the drop says where, else "Used". The tile's second line and screen-reader words. */
export function usedLabel(drop: PhotoDropDTO, lang: string): string {
  if (!drop.used_at) return '';
  return drop.used_where ? `${t('phUsedIn', lang)} ${drop.used_where}` : t('phUsed', lang);
}

export function dropTimeLabel(drop: PhotoDropDTO, lang: string): string {
  const date = new Date(drop.created_at);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(lang === 'es' ? 'es-US' : 'en-US', {
    month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** The square a drawer photo sits in. The whole photo shows; nothing is cut off. */
export const TILE_FRAME_SX = {
  position: 'relative', width: '100%', aspectRatio: '1 / 1', bgcolor: '#1f2937',
} as const;
export const TILE_IMG_SX = { width: '100%', height: '100%', objectFit: 'contain', display: 'block' } as const;
/** Two caption lines on every tile, used or not, so a new Used mark never pushes the rows down. */
export const TILE_CAPTION_SX = {
  fontSize: 12, lineHeight: '17px', minHeight: 34, color: 'text.secondary', mt: 0.5, px: 0.25, flex: 1, minWidth: 0,
} as const;

export interface PhotoDropTileProps {
  drop: PhotoDropDTO;
  selected?: boolean;
  disabled?: boolean;
  /** This photo is being fetched for the screen that asked for it. */
  working?: boolean;
  onClick?: () => void;
  /** Words for the tap, for a screen reader ("Open photo"). */
  clickLabel?: string;
  /** Sits beside the caption, under the picture (the page's Delete button). */
  action?: ReactNode;
}

/** One photo from the drawer, with its Used mark and when it was taken. */
export function PhotoDropTile({
  drop, selected = false, disabled = false, working = false, onClick, clickLabel, action,
}: PhotoDropTileProps) {
  const lang = useLanguage();
  const url = usePhotoDropThumb(drop.id);
  const used = usedLabel(drop, lang);
  const when = dropTimeLabel(drop, lang);
  const picture = (
    <Box sx={TILE_FRAME_SX}>
      {url ? (
        <Box
          component="img"
          src={url}
          alt={when ? `${t('phDrops', lang)} ${when}` : t('phDrops', lang)}
          sx={TILE_IMG_SX}
        />
      ) : (
        <Skeleton variant="rectangular" sx={{ width: '100%', height: '100%', bgcolor: 'rgba(255,255,255,0.14)' }} />
      )}
      {selected ? (
        <CheckCircleRounded
          data-testid="photo-drop-selected"
          sx={{ position: 'absolute', top: 6, left: 6, color: 'primary.main', bgcolor: '#fff', borderRadius: '50%', fontSize: 30 }}
        />
      ) : null}
      {working ? (
        <Box
          data-testid="photo-drop-working"
          sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(17,24,39,0.55)' }}
        >
          <CircularProgress size={30} sx={{ color: '#fff' }} />
        </Box>
      ) : null}
    </Box>
  );
  const frame = {
    display: 'block',
    width: '100%',
    borderRadius: 1.5,
    overflow: 'hidden',
    border: '2px solid',
    borderColor: selected ? 'primary.main' : 'divider',
    textAlign: 'left' as const,
  };
  return (
    <Box data-testid="photo-drop" data-drop-id={drop.id}>
      {onClick ? (
        <ButtonBase onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={clickLabel} sx={frame}>
          {picture}
        </ButtonBase>
      ) : (
        <Box sx={frame}>{picture}</Box>
      )}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        <Box sx={TILE_CAPTION_SX}>
          <Box sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{when}</Box>
          {/* Used sits under the photo, never on it: "Used · Receiving". */}
          {used ? (
            <Box
              data-testid="photo-drop-used"
              title={used}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.4, fontWeight: 700, color: 'success.dark', minWidth: 0 }}
            >
              <CheckRounded sx={{ fontSize: 15, flex: 'none' }} />
              <Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t('phUsed', lang)}
                {drop.used_where ? (
                  <Box component="span" data-testid="photo-drop-used-where" sx={{ fontWeight: 400 }}>
                    {` · ${drop.used_where}`}
                  </Box>
                ) : null}
              </Box>
            </Box>
          ) : null}
        </Box>
        {action}
      </Box>
    </Box>
  );
}
