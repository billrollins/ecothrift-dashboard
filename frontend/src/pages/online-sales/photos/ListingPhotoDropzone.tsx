import { AddPhoto } from '../../../components/photos/AddPhoto';
import { useCallback, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';

function imageFilesFromList(list: FileList | File[] | null): File[] {
  if (!list) return [];
  return Array.from(list).filter((file) => file.type.startsWith('image/'));
}

export function ListingPhotoDropzone({
  onFiles,
  disabled = false,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);

  const take = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      onFiles(files);
    },
    [onFiles],
  );

  return (
    <Box
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        take(imageFilesFromList(e.dataTransfer.files));
      }}
      sx={{
        border: '1px dashed',
        borderColor: over ? 'primary.main' : 'divider',
        bgcolor: over ? 'action.hover' : 'transparent',
        borderRadius: 2,
        p: 2,
      }}
    >
      <Stack spacing={1} alignItems="flex-start">
        <Typography variant="body2" color="text.secondary">
          Drop photos here, or add several at once. Each one opens the framing editor
          before it uploads.
        </Typography>
        <AddPhoto
          multiple
          startIcon={<PhotoCamera />}
          disabled={disabled}
          label="Add photos"
          usedWhere="Online Sales"
          onPhotos={take}
        />
      </Stack>
    </Box>
  );
}
