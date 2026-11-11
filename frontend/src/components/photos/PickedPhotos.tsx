import { Box, ButtonBase, IconButton } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { useEffect, useMemo, useState } from 'react';
import { t } from '../../i18n/routines';
import { useLanguage } from '../../i18n/useLanguage';
import { PhotoTouchUp } from './PhotoTouchUp';
import { editedPhotoFile } from './photoFile';

export const PICKED_PHOTO_SIZE = 88;

export interface PickedPhotosProps {
  photos: File[];
  onRemove?: (index: number) => void;
  /** A tap opens the photo big to turn or crop it; the changed copy comes back here. */
  onChange?: (index: number, file: File) => void;
  /** How many photos the screen takes. The row keeps that much room from the start, so adding one moves nothing. */
  slots?: number;
  disabled?: boolean;
}

/**
 * The photos a form is holding until it is sent: small pictures in a row, each with the same X to take it out, and
 * a tap to see it big and turn or crop it. Every screen that holds photos shows them this way.
 */
export function PickedPhotos({ photos, onRemove, onChange, slots = 0, disabled = false }: PickedPhotosProps) {
  const lang = useLanguage();
  const [open, setOpen] = useState<number | null>(null);
  const urls = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);
  const empty = Math.max(0, slots - photos.length);
  const showing = open != null ? photos[open] ?? null : null;
  return (
    <Box data-testid="picked-photos" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', minHeight: slots ? PICKED_PHOTO_SIZE : 0 }}>
      {urls.map((url, index) => (
        <Box
          key={url}
          data-testid="picked-photo"
          sx={{
            position: 'relative', width: PICKED_PHOTO_SIZE, height: PICKED_PHOTO_SIZE, borderRadius: 1.5,
            overflow: 'hidden', bgcolor: '#1f2937', flex: 'none',
          }}
        >
          <ButtonBase
            onClick={() => setOpen(index)}
            disabled={disabled || !onChange}
            aria-label={`${t('phOpenPhoto', lang)} ${index + 1}`}
            data-testid="picked-photo-open"
            sx={{ width: '100%', height: '100%', display: 'block' }}
          >
            <Box component="img" src={url} alt={`${t('phPhoto', lang)} ${index + 1}`} sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          </ButtonBase>
          {onRemove ? (
            <IconButton
              size="small"
              aria-label={`${t('phRemove', lang)} ${index + 1}`}
              onClick={() => onRemove(index)}
              disabled={disabled}
              data-testid="picked-photo-remove"
              sx={{
                position: 'absolute', top: 2, right: 2, width: 32, height: 32,
                bgcolor: 'rgba(255,255,255,0.92)', '&:hover': { bgcolor: '#fff' },
              }}
            >
              <CloseRounded sx={{ fontSize: 18 }} />
            </IconButton>
          ) : null}
        </Box>
      ))}
      {Array.from({ length: empty }, (_, index) => (
        <Box
          key={`empty-${index}`}
          aria-hidden
          sx={{
            width: PICKED_PHOTO_SIZE, height: PICKED_PHOTO_SIZE, borderRadius: 1.5, flex: 'none',
            border: '1.5px dashed', borderColor: 'divider',
          }}
        />
      ))}
      {onChange ? (
        <PhotoTouchUp
          open={showing != null}
          photo={showing}
          onClose={() => setOpen(null)}
          onSave={(blob) => {
            if (open != null && showing) onChange(open, editedPhotoFile(showing, blob));
            setOpen(null);
          }}
          onDelete={onRemove && open != null ? () => {
            onRemove(open);
            setOpen(null);
          } : undefined}
        />
      ) : null}
    </Box>
  );
}
