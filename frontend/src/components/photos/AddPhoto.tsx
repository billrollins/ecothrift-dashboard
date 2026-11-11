import { Button, ListItemIcon, ListItemText, Menu, MenuItem, type ButtonProps } from '@mui/material';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import PhotoLibraryRounded from '@mui/icons-material/PhotoLibraryRounded';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n/routines';
import { useLanguage } from '../../i18n/useLanguage';
import { CameraDialog } from './CameraDialog';
import { PhotoDrawerDialog } from './PhotoDrawerDialog';
import { isPhotoFile } from './photoFile';
import { photoMethodOrder, useIsPhoneDevice, type PhotoMethod } from './photoMethods';

export interface AddPhotoOptions {
  /** The picked photos: one, or several when `multiple`. */
  onPhotos: (files: File[]) => void | Promise<void>;
  multiple?: boolean;
  /** Most photos one pick may return (a screen with "up to 3" passes what is left). */
  max?: number;
  /** Where the photo goes, in the screen's own words. A drawer photo then reads "Used in Processing". */
  usedWhere?: string;
  /**
   * When a drawer photo gets its Used mark. `pick` (default): at once, for a screen that saves the photo the moment
   * it is picked. `save`: the screen holds the photo until its own Save or Send, and calls `markPhotosUsed` then.
   */
  usedOn?: 'pick' | 'save';
  /** Test id of the hidden From files input (screens that already had one keep theirs). */
  fileInputTestId?: string;
}

const METHOD_ICON: Record<PhotoMethod, ReactNode> = {
  take: <PhotoCameraRounded fontSize="small" />,
  drawer: <PhotoLibraryRounded fontSize="small" />,
  files: <FolderOpenRounded fontSize="small" />,
};
const METHOD_LABEL: Record<PhotoMethod, string> = { take: 'phTakePhoto', drawer: 'phDrawer', files: 'phFromFiles' };

/**
 * The one way to add a photo anywhere in Dash (Dash Updates #82). Three ways, always the same three:
 * Take photo, Photo drawer, From files. A phone lists the camera first; a computer lists the drawer first.
 *
 * `open(anchor)` shows the choices beside `anchor`; render `node` once anywhere in the same component.
 * Most screens use the `AddPhoto` button below; this hook is for a screen with its own trigger (a tile, an icon).
 */
export function useAddPhoto({ onPhotos, multiple = false, max, usedWhere = '', usedOn = 'pick', fileInputTestId }: AddPhotoOptions) {
  const lang = useLanguage();
  const isPhone = useIsPhoneDevice();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const filesRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const limit = multiple ? Math.max(1, max ?? Number.POSITIVE_INFINITY) : 1;

  const deliver = useCallback((files: File[]) => {
    const photos = files.filter(isPhotoFile).slice(0, limit);
    if (photos.length) void onPhotos(photos);
  }, [limit, onPhotos]);

  const choose = (method: PhotoMethod) => {
    setAnchor(null);
    if (method === 'drawer') setDrawerOpen(true);
    else if (method === 'files') filesRef.current?.click();
    // A phone opens its own camera; a computer has no camera in its file picker, so it gets the webcam window.
    else if (isPhone) cameraRef.current?.click();
    else setCameraOpen(true);
  };

  const onInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    deliver(picked);
  };

  // Menus and dialogs sit in portals, but React still bubbles their clicks to this spot's parents. Stopping them here
  // lets the node live inside a clickable trigger (a drop box, a label) without opening it twice.
  const node = (
    <span style={{ display: 'contents' }} onClick={(event) => event.stopPropagation()}>
      <input
        ref={filesRef}
        type="file"
        accept="image/*"
        multiple={multiple && limit > 1}
        hidden
        data-testid={fileInputTestId ?? 'add-photo-file-input'}
        onChange={onInput}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="add-photo-camera-input"
        onChange={onInput}
      />
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ list: { 'aria-label': t('phAddPhoto', lang), 'data-testid': 'add-photo-menu' } as object }}
      >
        {photoMethodOrder(isPhone).map((method) => (
          <MenuItem
            key={method}
            onClick={() => choose(method)}
            data-testid={`add-photo-${method}`}
            sx={{ minHeight: { xs: 52, sm: 48 }, pr: 3 }}
          >
            <ListItemIcon>{METHOD_ICON[method]}</ListItemIcon>
            <ListItemText primary={t(METHOD_LABEL[method], lang)} />
          </MenuItem>
        ))}
      </Menu>
      {/* Mounted only while open: a screen that never opens the drawer asks the server nothing. */}
      {drawerOpen ? (
        <PhotoDrawerDialog
          open
          onClose={() => setDrawerOpen(false)}
          onPhotos={deliver}
          multiple={multiple && limit > 1}
          max={max}
          usedWhere={usedWhere}
          usedOn={usedOn}
        />
      ) : null}
      {cameraOpen ? (
        <CameraDialog
          open
          onClose={() => setCameraOpen(false)}
          onPhoto={(file) => deliver([file])}
          onUseDrawer={() => setDrawerOpen(true)}
          onUseFiles={() => filesRef.current?.click()}
        />
      ) : null}
    </span>
  );

  return { open: (target: HTMLElement) => setAnchor(target), node };
}

export interface AddPhotoProps extends AddPhotoOptions, Omit<ButtonProps, 'onClick' | 'children'> {
  /** Button words. Default: Add photo. */
  label?: ReactNode;
  'data-testid'?: string;
}

/** The Add photo button. Every staff screen that asks for a photo uses this one. */
export function AddPhoto({
  onPhotos, multiple, max, usedWhere, usedOn, fileInputTestId, label, 'data-testid': testId = 'add-photo', ...button
}: AddPhotoProps) {
  const lang = useLanguage();
  const picker = useAddPhoto({ onPhotos, multiple, max, usedWhere, usedOn, fileInputTestId });
  return (
    <>
      <Button
        variant="outlined"
        startIcon={<PhotoCameraRounded />}
        {...button}
        data-testid={testId}
        aria-haspopup="menu"
        onClick={(event) => picker.open(event.currentTarget)}
      >
        {label ?? t('phAddPhoto', lang)}
      </Button>
      {picker.node}
    </>
  );
}

export interface AddPhotoTriggerProps extends AddPhotoOptions {
  /** Draw your own trigger; call `open` with the element the choices should sit beside. */
  children: (open: (target: HTMLElement) => void) => ReactNode;
}

/** The same three ways behind a trigger of your own (a drop box, a tile, an avatar, a small chip). */
export function AddPhotoTrigger({ children, ...options }: AddPhotoTriggerProps) {
  const picker = useAddPhoto(options);
  return (
    <>
      {children(picker.open)}
      {picker.node}
    </>
  );
}
