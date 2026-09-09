import { Box, Button, Chip, IconButton, Stack, TextField, Typography } from '@mui/material';
import ArrowDownward from '@mui/icons-material/ArrowDownward';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import Crop from '@mui/icons-material/Crop';
import Delete from '@mui/icons-material/Delete';
import type { WebListingImage } from '../../../api/webstore.api';
import { listingImageUrl } from '../../../api/webstore.api';

export function ListingPhotoGrid({
  images,
  altDrafts,
  title,
  busy = false,
  onOpen,
  onReframe,
  onMove,
  onDelete,
  onAltChange,
  onSaveAlt,
}: {
  images: WebListingImage[];
  altDrafts: Record<number, string>;
  title: string;
  busy?: boolean;
  onOpen: (index: number) => void;
  onReframe: (image: WebListingImage) => void;
  onMove: (imageId: number, direction: -1 | 1) => void;
  onDelete: (imageId: number) => void;
  onAltChange: (imageId: number, alt: string) => void;
  onSaveAlt: (imageId: number) => void;
}) {
  if (images.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No photos yet — a listing cannot publish without one.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {images.map((im, index) => (
        <Stack
          key={im.id}
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          alignItems={{ sm: 'flex-start' }}
          sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
        >
          <Box sx={{ width: { xs: '100%', sm: 220 }, flexShrink: 0 }}>
            <Box
              component="button"
              type="button"
              onClick={() => onOpen(index)}
              aria-label={`View full photo ${index + 1}`}
              sx={{
                display: 'block',
                width: '100%',
                p: 0,
                border: 0,
                borderRadius: 1,
                overflow: 'hidden',
                cursor: 'pointer',
                bgcolor: 'action.hover',
              }}
            >
              <Box
                component="img"
                src={listingImageUrl(im, 'main')}
                alt={altDrafts[im.id] || title}
                sx={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }}
              />
            </Box>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.75 }}>
              <Typography variant="caption" color="text.secondary">
                Main 1600 × 1200
              </Typography>
              {index === 0 ? <Chip size="small" label="Cover" color="primary" /> : null}
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Box sx={{ width: 72 }}>
                <Box
                  component="img"
                  src={listingImageUrl(im, 'grid')}
                  alt=""
                  sx={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 0.5, display: 'block' }}
                />
                <Typography variant="caption" color="text.secondary">
                  Grid 800 × 600
                </Typography>
              </Box>
              <Box sx={{ width: 56 }}>
                <Box
                  component="img"
                  src={listingImageUrl(im, 'thumb')}
                  alt=""
                  sx={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 0.5, display: 'block' }}
                />
                <Typography variant="caption" color="text.secondary">
                  Thumb 400 × 400
                </Typography>
              </Box>
            </Stack>
          </Box>
          <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
              <IconButton
                size="small"
                aria-label="Move photo up"
                disabled={index === 0 || busy}
                onClick={() => onMove(im.id, -1)}
              >
                <ArrowUpward fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label="Move photo down"
                disabled={index === images.length - 1 || busy}
                onClick={() => onMove(im.id, 1)}
              >
                <ArrowDownward fontSize="small" />
              </IconButton>
              <IconButton size="small" aria-label="Reframe photo" onClick={() => onReframe(im)}>
                <Crop fontSize="small" />
              </IconButton>
              <IconButton size="small" aria-label="Delete photo" onClick={() => onDelete(im.id)}>
                <Delete fontSize="small" />
              </IconButton>
              <Typography variant="caption" color="text.secondary">
                Position {index + 1}
              </Typography>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <TextField
                label="Alt text"
                size="small"
                value={altDrafts[im.id] ?? ''}
                onChange={(e) => onAltChange(im.id, e.target.value)}
                fullWidth
              />
              <Button size="small" variant="outlined" onClick={() => onSaveAlt(im.id)} sx={{ flexShrink: 0 }}>
                Save alt
              </Button>
            </Stack>
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}
