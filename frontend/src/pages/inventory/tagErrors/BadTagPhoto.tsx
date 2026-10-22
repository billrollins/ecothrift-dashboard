import { useEffect, useState } from 'react';
import { Button, CircularProgress, IconButton, Tooltip } from '@mui/material';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import { useSnackbar } from 'notistack';
import { fetchBadTagPhoto } from '../../../api/badTags.api';
import { ImageViewerDialog } from '../../../components/common/ImageViewerDialog';

/**
 * The finder's photo, loaded on tap. The photo needs the session's auth header, so it is
 * fetched as a blob and shown from an object URL (never a bare <img src>).
 */
export function BadTagPhoto({ url, title, variant = 'icon' }: { url: string; title: string; variant?: 'icon' | 'button' }) {
  const { enqueueSnackbar } = useSnackbar();
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => () => {
    if (src) URL.revokeObjectURL(src);
  }, [src]);

  async function open() {
    if (loading) return;
    setLoading(true);
    try {
      const blob = await fetchBadTagPhoto(url);
      setSrc(URL.createObjectURL(blob));
    } catch {
      enqueueSnackbar('Could not load the photo.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  const icon = loading ? <CircularProgress size={16} /> : <PhotoCameraOutlined fontSize="small" />;
  return (
    <>
      {variant === 'icon' ? (
        <Tooltip title="See the photo" enterDelay={250}>
          <IconButton size="small" onClick={() => void open()} aria-label={`Photo of ${title}`}>
            {icon}
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          startIcon={icon}
          onClick={() => void open()}
          sx={{ textTransform: 'none', fontWeight: 700, minHeight: 36, borderColor: 'divider' }}
        >
          Photo
        </Button>
      )}
      <ImageViewerDialog
        open={src != null}
        onClose={() => setSrc(null)}
        src={src}
        alt={`Photo of ${title}`}
        title={title}
        filename="bad-tag.jpg"
        canEdit={false}
      />
    </>
  );
}
