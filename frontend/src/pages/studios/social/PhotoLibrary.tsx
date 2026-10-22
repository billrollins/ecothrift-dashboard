import { forwardRef, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined';
import { useQuery } from '@tanstack/react-query';
import { listSocialPhotos, type PhotoFilters, type SocialPhoto } from '../../../api/marketing.api';
import { MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES } from '../../../constants/taxonomyV1';
import { ccTokens } from '../../../theme';

/** Taxonomy v1, less Mixed lots: the categories a photo or a post can be about. */
export const SOCIAL_CATEGORIES = TAXONOMY_V1_CATEGORY_NAMES.filter((name) => name !== MIXED_LOTS_UNCATEGORIZED);

/**
 * A hidden file input that opens the camera (`capture="environment"`, several at once where the phone allows).
 * `library`: the phone's photo picker instead of the camera.
 */
export const PhotoInput = forwardRef<HTMLInputElement, { onFiles: (files: File[]) => void; library?: boolean }>(
  function PhotoInput({ onFiles, library }, ref) {
    return (
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        {...(library ? {} : { capture: 'environment' })}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    );
  },
);

export function CameraButtons({ onFiles, busy, size = 'large' }: { onFiles: (files: File[]) => void; busy?: boolean; size?: 'large' | 'medium' }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      <Button
        variant="contained"
        size={size}
        startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <CameraAltOutlined />}
        disabled={busy}
        onClick={() => camera.current?.click()}
        sx={{ flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
      >
        Take photos
      </Button>
      <Button variant="outlined" size={size} disabled={busy} onClick={() => library.current?.click()} sx={{ flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
        Pick from files
      </Button>
      <PhotoInput ref={camera} onFiles={onFiles} />
      <PhotoInput ref={library} onFiles={onFiles} library />
    </Box>
  );
}

export function CategorySelect({ value, onChange, categories, label = 'Category', allowAll }: {
  value: string;
  onChange: (value: string) => void;
  categories: string[];
  label?: string;
  allowAll?: boolean;
}) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ minWidth: 200, flex: { xs: '1 1 100%', sm: '0 0 240px' } }}
    >
      <MenuItem value="">{allowAll ? 'All categories' : 'No category'}</MenuItem>
      {categories.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
    </TextField>
  );
}

/** The library grid with its filters. `onPick` turns it into a picker; `selectedIds` marks photos already in use here. */
export function PhotoGrid({
  categories,
  onPick,
  selectedIds = [],
  defaultUnused = false,
  refreshKey,
}: {
  categories: string[];
  onPick: (photo: SocialPhoto) => void;
  selectedIds?: number[];
  defaultUnused?: boolean;
  refreshKey?: number;
}) {
  const [filters, setFilters] = useState<PhotoFilters>({ unused: defaultUnused });
  const photos = useQuery({
    queryKey: ['marketing', 'photos', filters, refreshKey ?? 0],
    queryFn: () => listSocialPhotos(filters),
  });
  const toggle = (key: 'unused' | 'week') => setFilters((f) => ({ ...f, [key]: !f[key] }));
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1.25 }}>
        <Chip label="Unused" color={filters.unused ? 'primary' : 'default'} variant={filters.unused ? 'filled' : 'outlined'} onClick={() => toggle('unused')} />
        <Chip label="This week" color={filters.week ? 'primary' : 'default'} variant={filters.week ? 'filled' : 'outlined'} onClick={() => toggle('week')} />
        <CategorySelect value={filters.category ?? ''} onChange={(category) => setFilters((f) => ({ ...f, category }))} categories={categories} allowAll />
      </Box>
      {photos.isError ? <Alert severity="error">Could not load the photos.</Alert> : null}
      {photos.isLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box> : null}
      {photos.data && photos.data.length === 0 ? (
        <Typography sx={{ py: 3, color: ccTokens.ink2 }}>No photos here yet.</Typography>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(auto-fill, minmax(150px, 1fr))' },
          gap: { xs: 0.75, sm: 1.25 },
        }}
      >
        {(photos.data ?? []).map((photo) => {
          const selected = selectedIds.includes(photo.id);
          return (
            <Box
              key={photo.id}
              component="button"
              type="button"
              draggable
              onDragStart={(e: React.DragEvent) => e.dataTransfer.setData('text/x-social-photo', String(photo.id))}
              onClick={() => onPick(photo)}
              aria-label={`Photo ${photo.id}${photo.category ? `, ${photo.category}` : ''}`}
              sx={{
                position: 'relative',
                p: 0,
                border: `2px solid ${selected ? '#2e7d32' : 'transparent'}`,
                borderRadius: '10px',
                overflow: 'hidden',
                cursor: 'pointer',
                bgcolor: '#e8f5e9',
                aspectRatio: '1 / 1',
              }}
            >
              {photo.thumb_url ? (
                <Box component="img" src={photo.thumb_url} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : null}
              <Box sx={{ position: 'absolute', left: 4, bottom: 4, right: 4, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {photo.used_in.length ? (
                  <Chip size="small" label={`In ${photo.used_in.length}`} sx={{ height: 20, fontSize: 11, bgcolor: 'rgba(255,255,255,.9)' }} />
                ) : null}
                {photo.sku ? <Chip size="small" label={photo.sku} sx={{ height: 20, fontSize: 11, bgcolor: 'rgba(255,255,255,.9)' }} /> : null}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
