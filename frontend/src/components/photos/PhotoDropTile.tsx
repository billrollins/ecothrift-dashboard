import { Box, ButtonBase, Chip, Skeleton } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import type { ReactNode } from 'react';
import type { PhotoDropDTO } from '../../api/photoDrops.api';
import { usePhotoDropThumb } from '../../hooks/usePhotoDrops';
import { t } from '../../i18n/routines';
import { useLanguage } from '../../i18n/useLanguage';

/** "Used in Processing" when the drop says where, else "Used". The tile's hover text and screen-reader words. */
export function usedLabel(drop: PhotoDropDTO, lang: string): string {
  if (!drop.used_at) return '';
  return drop.used_where ? `${t('phUsedIn', lang)} ${drop.used_where}` : t('phUsed', lang);
}

export function dropTimeLabel(drop: PhotoDropDTO, lang: string): string {
  const date = new Date(drop.created_at);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(lang === 'es' ? 'es-US' : 'en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export interface PhotoDropTileProps {
  drop: PhotoDropDTO;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** Drawn over the picture's top right corner (the page's Delete button). */
  corner?: ReactNode;
}

/** One square photo from the drawer, with its Used mark and when it was taken. */
export function PhotoDropTile({ drop, selected = false, disabled = false, onClick, corner }: PhotoDropTileProps) {
  const lang = useLanguage();
  const url = usePhotoDropThumb(drop.id);
  const used = usedLabel(drop, lang);
  const when = dropTimeLabel(drop, lang);
  const picture = (
    <Box sx={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', bgcolor: 'action.hover' }}>
      {url ? (
        <Box
          component="img"
          src={url}
          alt={when ? `${t('phDrops', lang)} ${when}` : t('phDrops', lang)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <Skeleton variant="rectangular" sx={{ width: '100%', height: '100%' }} />
      )}
      {used ? (
        <Chip
          size="small"
          label={t('phUsed', lang)}
          title={used}
          data-testid="photo-drop-used"
          sx={{
            position: 'absolute', left: 6, bottom: 6, maxWidth: 'calc(100% - 12px)',
            bgcolor: 'rgba(17,24,39,0.82)', color: '#fff', fontWeight: 700,
          }}
        />
      ) : null}
      {selected ? (
        <CheckCircleRounded
          data-testid="photo-drop-selected"
          sx={{ position: 'absolute', top: 6, left: 6, color: 'primary.main', bgcolor: '#fff', borderRadius: '50%', fontSize: 30 }}
        />
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
    <Box sx={{ position: 'relative' }} data-testid="photo-drop" data-drop-id={drop.id}>
      {onClick ? (
        <ButtonBase onClick={onClick} disabled={disabled} aria-pressed={selected} sx={frame}>
          {picture}
        </ButtonBase>
      ) : (
        <Box sx={frame}>{picture}</Box>
      )}
      {corner ? <Box sx={{ position: 'absolute', top: 6, right: 6 }}>{corner}</Box> : null}
      <Box sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5, px: 0.25 }}>
        {when}
        {drop.used_at && drop.used_where ? <Box data-testid="photo-drop-used-where">{used}</Box> : null}
      </Box>
    </Box>
  );
}
