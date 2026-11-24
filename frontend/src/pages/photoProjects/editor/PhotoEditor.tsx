/**
 * The photo editor (Dash #209; owner approved 2026-11-24): the picture, a strip of versions under it, and two tabs.
 * Edit is our own code in the browser (crop, light, color, looks, background), kept only on Save as new version; AI is
 * Grok on the server, and every run lands in the strip as a new version. The next Edit or AI run starts from the
 * version on screen. Same editor on desk (a dialog with a side panel) and phone (full screen, fixed slots).
 */
import { useEffect, useRef, useState } from 'react';
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, Tab, Tabs,
  TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  deletePhoto, deleteVersion, getPhoto, getPictureBlob, runAgain, runAi, saveEditVersion, setMain, setPhotoNote,
  type PhotoVersionDTO, type ProjectPhotoDTO,
} from '../../../api/photoProjects.api';
import { CropStage, type CropStageHandle } from '../../../components/photoEditor/CropStage';
import { EditTools } from '../../../components/photoEditor/EditTools';
import { ratioValue } from '../../../components/photoEditor/editState';
import { CHECKER, PICTURE_PAD, PicturePreview } from '../../../components/photoEditor/PicturePreview';
import type { Rect } from '../../../components/photoEditor/pixels';
import { usePhotoEdit } from '../../../components/photoEditor/usePhotoEdit';
import { downloadBlob } from '../../../utils/downloadBlob';
import { AiPanel, type AiRun } from './AiPanel';
import { useLoadedImage, useObjectUrl, usePictureBlob } from './pictures';
import { VersionStrip } from './VersionStrip';

const UNDO_MS = 5000;
/** Phone: the Edit tools and the AI tools share one fixed-height area, so switching tabs moves nothing. */
const PHONE_TOOLS_HEIGHT = 214;
const LINE = '1px solid #dfe3dc';
const SOFT = '#f3f4f0';

function errText(err: unknown, fallback: string) {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (data) {
    for (const value of Object.values(data)) {
      if (typeof value === 'string') return value;
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    }
  }
  return fallback;
}

export function PhotoEditor({ photo: first, projectName, onClose }: { photo: ProjectPhotoDTO; projectName: string; onClose: () => void }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const layout = phone ? 'phone' : 'desk';
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const key = ['photoProjects', 'photo', first.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getPhoto(first.id),
    initialData: first,
    refetchInterval: (q) => (q.state.data?.versions.some((v) => v.status === 'working') ? 3000 : false),
  });
  const photo = query.data ?? first;
  const [selected, setSelected] = useState<number | null>(first.main);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [tab, setTab] = useState<'edit' | 'ai'>('edit');
  const [deleting, setDeleting] = useState<ReadonlySet<number>>(() => new Set());
  const timers = useRef(new Map<number, number>());
  const [fit, setFit] = useState<{ box: Rect; nonce: number } | null>(null);
  const stage = useRef<CropStageHandle>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(first.note);

  const version = selected == null ? null : photo.versions.find((v) => v.id === selected) ?? null;
  const ready = selected == null || version?.status === 'done';
  const picture = usePictureBlob(photo.id, selected, 'file', ready);
  const img = useLoadedImage(ready ? picture.data : null);
  const pictureUrl = useObjectUrl(ready && tab === 'ai' ? picture.data : null);
  const edit = usePhotoEdit(img, phone ? 1280 : 1600);
  const { reset, cropping } = edit;

  // Edits belong to the picture they started from.
  useEffect(() => {
    reset();
  }, [selected, reset]);
  useEffect(() => {
    if (!cropping) setFit(null);
  }, [cropping]);
  // A version that is gone (deleted, or not there any more) falls back to Raw.
  useEffect(() => {
    if (selected != null && !photo.versions.some((v) => v.id === selected)) setSelected(null);
  }, [photo.versions, selected]);

  // Main can change with any new or deleted version (the newest is Main until one is starred): read both again.
  const refreshGrid = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['photoProjects', 'photos', photo.project] });
  };
  const patchPhoto = (fn: (p: ProjectPhotoDTO) => ProjectPhotoDTO) => qc.setQueryData<ProjectPhotoDTO>(key, (p) => (p ? fn(p) : p));
  const upsert = (v: PhotoVersionDTO) =>
    patchPhoto((p) => ({
      ...p,
      versions: p.versions.some((x) => x.id === v.id) ? p.versions.map((x) => (x.id === v.id ? v : x)) : [...p.versions, v],
    }));

  const run = useMutation({
    mutationFn: (r: AiRun) => runAi(photo.id, { ...r, made_from: selectedRef.current }),
    onSuccess: (v) => {
      upsert(v);
      refreshGrid();
    },
    onError: (e) => enqueueSnackbar(errText(e, 'Could not start the AI run.'), { variant: 'error' }),
  });
  const save = useMutation({
    mutationFn: async () => {
      const pending = edit.cropping && stage.current ? stage.current.getCrop() : null;
      const { blob, caption } = await edit.render(pending);
      return saveEditVersion(photo.id, blob, selectedRef.current, caption);
    },
    onSuccess: (v) => {
      upsert(v);
      setSelected(v.id);
      refreshGrid();
    },
    onError: (e) => enqueueSnackbar(errText(e, 'Could not save the version.'), { variant: 'error' }),
  });
  const star = useMutation({
    mutationFn: (v: number | null) => setMain(photo.id, v),
    onSuccess: (p) => {
      qc.setQueryData(key, p);
      refreshGrid();
    },
    onError: (e) => enqueueSnackbar(errText(e, 'Could not make it Main.'), { variant: 'error' }),
  });
  const again = useMutation({
    mutationFn: (id: number) => runAgain(id),
    onSuccess: upsert,
    onError: (e) => enqueueSnackbar(errText(e, 'Could not run it again.'), { variant: 'error' }),
  });
  const removePhoto = useMutation({
    mutationFn: () => deletePhoto(photo.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['photoProjects'] });
      onClose();
    },
    onError: (e) => enqueueSnackbar(errText(e, 'Could not delete the photo.'), { variant: 'error' }),
  });
  const saveNote = useMutation({
    mutationFn: (text: string) => setPhotoNote(photo.id, text),
    onSuccess: (p) => {
      patchPhoto((x) => ({ ...x, note: p.note }));
      refreshGrid();
    },
  });

  const unmark = (id: number) =>
    setDeleting((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  const commitDelete = (id: number) => {
    timers.current.delete(id);
    const gone = photo.versions.find((v) => v.id === id);
    deleteVersion(id)
      .then(() => {
        if (selectedRef.current === id) {
          const back = gone?.made_from ?? null;
          setSelected(back != null && photo.versions.some((v) => v.id === back) ? back : null);
        }
        patchPhoto((p) => ({ ...p, versions: p.versions.filter((v) => v.id !== id) }));
        refreshGrid();
      })
      .catch((e) => enqueueSnackbar(errText(e, 'Could not delete the version.'), { variant: 'error' }))
      .finally(() => unmark(id));
  };
  const startDelete = (id: number) => {
    setDeleting((s) => new Set(s).add(id));
    timers.current.set(id, window.setTimeout(() => commitDelete(id), UNDO_MS));
  };
  const undoDelete = (id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    unmark(id);
  };
  // Closing the editor keeps the X's promise: deletes still in their Undo time go now.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      const jobs = [...pending.entries()].map(([id, t]) => {
        window.clearTimeout(t);
        return deleteVersion(id).catch(() => undefined);
      });
      pending.clear();
      Promise.all(jobs).finally(() => qc.invalidateQueries({ queryKey: ['photoProjects'] }));
    };
  }, [qc]);

  const download = async () => {
    try {
      const blob = picture.data ?? (await getPictureBlob(photo.id, selected, 'file'));
      const base = photo.item_sku || photo.scanned_code || 'photo';
      downloadBlob(blob, `${base}-${photo.id}-${version ? `v${version.id}` : 'raw'}.${blob.type === 'image/png' ? 'png' : 'jpg'}`);
    } catch {
      enqueueSnackbar('Could not download the picture.', { variant: 'error' });
    }
  };

  const title = photo.item_title || photo.item_sku || photo.scanned_code || 'No tag';
  const count = photo.versions.length;
  const sub = [photo.item_title ? photo.item_sku : '', projectName, `${count} version${count === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  const { state, info } = edit;
  const fill = state.backdrop === 'clear' || (!state.backdrop && info?.seeThrough) ? CHECKER : state.backdrop || '#ffffff';

  let picturePane;
  if (version?.status === 'working') {
    picturePane = (
      <Box sx={{ textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 1.5, fontWeight: 700 }}>{version.caption}</Typography>
      </Box>
    );
  } else if (version?.status === 'failed') {
    picturePane = (
      <Box sx={{ textAlign: 'center', px: 3 }}>
        <Typography sx={{ color: 'error.main', fontWeight: 700 }}>{version.error || 'The AI run failed.'}</Typography>
        <Button variant="contained" sx={{ mt: 1.5 }} disabled={again.isPending} onClick={() => again.mutate(version.id)}>Run again</Button>
      </Box>
    );
  } else if (!img) {
    picturePane = <CircularProgress />;
  } else if (tab === 'ai') {
    picturePane = pictureUrl ? (
      <Box
        component="img"
        src={pictureUrl}
        alt=""
        sx={{ maxWidth: `calc(100% - ${2 * PICTURE_PAD}px)`, maxHeight: `calc(100% - ${2 * PICTURE_PAD}px)`, display: 'block', borderRadius: '4px', background: version?.see_through ? CHECKER : undefined }}
      />
    ) : null;
  } else if (cropping) {
    picturePane = (
      <CropStage
        ref={stage}
        view={edit.view}
        tick={edit.tick}
        size={edit.size}
        aspect={ratioValue(cropping)}
        initial={state.crop && state.ratio === cropping ? state.crop : null}
        fit={fit}
        fill={fill}
        zoomSlider={!phone}
      />
    );
  } else {
    picturePane = <PicturePreview view={edit.view} tick={edit.tick} clear={edit.clear} />;
  }

  const strip = (
    <VersionStrip
      photo={photo}
      selected={selected}
      onSelect={setSelected}
      deleting={deleting}
      onDelete={startDelete}
      onUndo={undoDelete}
      onStar={(v) => star.mutate(v)}
      onRetry={(id) => again.mutate(id)}
      layout={layout}
    />
  );
  const editTools = (
    <EditTools
      edit={edit}
      layout={layout}
      stage={stage}
      onFit={(box) => setFit({ box, nonce: Date.now() })}
      onRemoveBackground={() => run.mutate({ action: 'remove_background', color: '#ffffff' })}
      onSave={() => save.mutate()}
      saving={save.isPending}
      disabled={!img || !ready}
    />
  );
  const aiTools = <AiPanel layout={layout} disabled={!ready} onRun={(r) => run.mutateAsync(r).then(() => true, () => false)} />;
  const tabs = (
    <Tabs value={tab} onChange={(_, t) => setTab(t)} variant="fullWidth" sx={{ borderBottom: LINE, minHeight: 44, flex: 'none', '& .MuiTab-root': { fontWeight: 700, minHeight: 44, textTransform: 'none', fontSize: 15 } }}>
      <Tab value="edit" label="Edit" />
      <Tab value="ai" label="AI" />
    </Tabs>
  );
  const dialogs = (
    <>
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Delete this photo for good?</DialogTitle>
        <DialogContent>Raw and its {count} version{count === 1 ? '' : 's'} go, files too.</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
          <Button color="error" variant="contained" disabled={removePhoto.isPending} onClick={() => removePhoto.mutate()}>Delete</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={noteOpen} onClose={() => setNoteOpen(false)} fullWidth>
        <DialogTitle>Note</DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline minRows={2} maxRows={5} value={note} onChange={(e) => setNote(e.target.value)} autoFocus sx={{ mt: 0.5 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNoteOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              saveNote.mutate(note);
              setNoteOpen(false);
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );

  if (phone) {
    return (
      <Dialog open fullScreen onClose={onClose}>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#fff' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.75, borderBottom: LINE, flex: 'none' }}>
            <IconButton aria-label="Back" onClick={onClose}><ArrowBackRounded /></IconButton>
            <Typography noWrap sx={{ flex: 1, fontWeight: 800, fontSize: 16.5 }}>{title}</Typography>
            <IconButton aria-label="More" onClick={(e) => setMenu(e.currentTarget)}><MoreVertRounded /></IconButton>
            <Button onClick={onClose} sx={{ fontWeight: 800 }}>Done</Button>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, position: 'relative', bgcolor: SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {picturePane}
          </Box>
          <Box sx={{ borderTop: LINE, flex: 'none' }}>{strip}</Box>
          {tabs}
          <Box sx={{ height: PHONE_TOOLS_HEIGHT, flex: 'none', overflow: 'hidden' }}>{tab === 'edit' ? editTools : aiTools}</Box>
        </Box>
        <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
          <MenuItem disabled={!ready} onClick={() => { setMenu(null); download(); }}>Download</MenuItem>
          <MenuItem onClick={() => { setMenu(null); setNote(photo.note); setNoteOpen(true); }}>Note</MenuItem>
          <MenuItem onClick={() => { setMenu(null); setConfirmDelete(true); }} sx={{ color: 'error.main' }}>Delete photo</MenuItem>
        </Menu>
        {dialogs}
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={false}
      PaperProps={{ sx: { width: 'min(1270px, calc(100vw - 32px))', height: 'min(900px, calc(100vh - 32px))', maxWidth: 'none', maxHeight: 'none', m: 2, borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2.5, py: 1.5, borderBottom: LINE, flex: 'none' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 19, fontWeight: 800 }}>{title}</Typography>
          <Typography noWrap sx={{ fontSize: 12.5, color: 'text.secondary' }}>{sub}</Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose}><CloseRounded /></IconButton>
      </Box>
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', px: 2.5, pt: 2.25, pb: 1 }}>
          <Box sx={{ flex: 1, minHeight: 0, position: 'relative', bgcolor: SOFT, borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {picturePane}
          </Box>
          {strip}
        </Box>
        <Box sx={{ width: 340, flex: 'none', borderLeft: LINE, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {tabs}
          <Box sx={{ flex: 1, minHeight: 0, overflowY: tab === 'ai' ? 'auto' : 'hidden' }}>{tab === 'edit' ? editTools : aiTools}</Box>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.25, borderTop: LINE, flex: 'none' }}>
        <Button color="error" onClick={() => setConfirmDelete(true)} sx={{ fontWeight: 700 }}>Delete photo</Button>
        <TextField
          size="small"
          placeholder="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== photo.note && saveNote.mutate(note)}
          sx={{ flex: 1, maxWidth: 480, ml: 1 }}
        />
        <Box sx={{ flex: 1 }} />
        <Button disabled={!ready} onClick={download} sx={{ fontWeight: 700 }}>Download</Button>
        <Button variant="contained" onClick={onClose} sx={{ fontWeight: 700 }}>Done</Button>
      </Box>
      {dialogs}
    </Dialog>
  );
}
