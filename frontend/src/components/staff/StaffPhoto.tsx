/**
 * A staff member's photo circle (Dash Update #139): the same on Home > Profile (my own) and in the staff window (the
 * owner's view of the same person). Tap it, or its camera badge, for New photo / Remove photo; a phone offers the camera
 * or the library. The circle never changes size: while a photo uploads a spinner sits inside it.
 * Without `onUpload` it is the plain avatar (no badge, nothing to tap).
 */
import { useRef, useState } from 'react';
import { Box, ButtonBase, CircularProgress, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { PersonAvatar } from '../users/userChrome';

export function StaffPhoto({
  name,
  seed,
  photo,
  size,
  muted = false,
  onUpload,
  onRemove,
  testId = 'staff-photo',
}: {
  name: string;
  seed: string;
  photo: string | null | undefined;
  size: number;
  muted?: boolean;
  /** Save a new photo. Resolves when saved; the caller says what happened (snackbar). */
  onUpload?: (file: File) => Promise<void>;
  onRemove?: () => Promise<void>;
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);

  const avatar = <PersonAvatar name={name} seed={seed} size={size} photo={photo} muted={muted} />;
  if (!onUpload) return avatar;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const badge = Math.max(22, Math.round(size * 0.3));
  return (
    <>
      <ButtonBase
        onClick={(e) => setMenuAt(e.currentTarget)}
        disabled={busy}
        aria-label={photo ? `Change the photo of ${name}` : `Add a photo of ${name}`}
        data-testid={testId}
        sx={{ position: 'relative', width: size, height: size, borderRadius: '50%', flexShrink: 0 }}
      >
        {avatar}
        {busy ? (
          <Box
            sx={{
              position: 'absolute', inset: 0, borderRadius: '50%', display: 'grid', placeItems: 'center',
              bgcolor: 'rgba(255,255,255,0.6)',
            }}
          >
            <CircularProgress size={Math.round(size * 0.32)} />
          </Box>
        ) : null}
        <Box
          sx={{
            position: 'absolute', right: -2, bottom: -2, width: badge, height: badge, borderRadius: '50%',
            display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText',
            border: '2px solid', borderColor: 'background.paper',
          }}
        >
          <PhotoCameraRounded sx={{ fontSize: Math.round(badge * 0.55) }} />
        </Box>
      </ButtonBase>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        data-testid={`${testId}-input`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void run(() => onUpload(file));
        }}
      />
      <Menu anchorEl={menuAt} open={menuAt != null} onClose={() => setMenuAt(null)}>
        <MenuItem
          onClick={() => {
            setMenuAt(null);
            input.current?.click();
          }}
        >
          <ListItemIcon><PhotoCameraRounded fontSize="small" /></ListItemIcon>
          <ListItemText primary="New photo" secondary="Take one or pick one" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAt(null);
            if (onRemove) void run(onRemove);
          }}
          disabled={!photo || !onRemove}
        >
          <ListItemIcon><DeleteOutlineRounded fontSize="small" /></ListItemIcon>
          <ListItemText primary="Remove photo" />
        </MenuItem>
      </Menu>
    </>
  );
}
