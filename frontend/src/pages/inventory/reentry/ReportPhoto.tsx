import { useEffect, useState } from 'react';
import { Box, ButtonBase } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { fetchBadTagPhoto } from '../../../api/badTags.api';
import { ImageViewerDialog } from '../../../components/common/ImageViewerDialog';

const SIZE = 72;

/**
 * The photo that came with a floor report, small beside its row; a tap opens it full size. The photo needs the
 * session's sign-in, so it is fetched and shown from an object URL. The square's place is kept while it loads.
 */
export function ReportPhoto({ url, title }: { url: string; title: string }) {
  const [open, setOpen] = useState(false);
  const photo = useQuery({ queryKey: ['floor-issue-photo', url], queryFn: () => fetchBadTagPhoto(url), staleTime: Infinity, retry: 1 });
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!photo.data) return undefined;
    const made = URL.createObjectURL(photo.data);
    setSrc(made);
    return () => URL.revokeObjectURL(made);
  }, [photo.data]);

  return (
    <>
      <ButtonBase
        onClick={() => { if (src) setOpen(true); }}
        disabled={!src}
        aria-label={`See the photo of ${title}`}
        sx={{
          width: SIZE, height: SIZE, flexShrink: 0, borderRadius: 1, overflow: 'hidden', border: 1, borderColor: 'divider',
          bgcolor: 'action.hover', color: 'text.secondary', fontSize: 12,
        }}
      >
        {src ? (
          <Box component="img" src={src} alt={`Photo of ${title}`} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (photo.isError ? 'No photo' : 'Photo')}
      </ButtonBase>
      <ImageViewerDialog open={open} onClose={() => setOpen(false)} src={src} alt={`Photo of ${title}`} title={title} canEdit={false} />
    </>
  );
}
