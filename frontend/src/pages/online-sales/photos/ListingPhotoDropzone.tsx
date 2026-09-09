import { useCallback, useRef, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
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
  const inputRef = useRef<HTMLInputElement | null>(null);
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
          Drop photos here, or select several at once. Each one opens the framing editor
          before it uploads.
        </Typography>
        <Button
          startIcon={<PhotoCamera />}
          variant="outlined"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Select photos
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            take(imageFilesFromList(e.target.files));
            e.target.value = '';
          }}
        />
      </Stack>
    </Box>
  );
}
