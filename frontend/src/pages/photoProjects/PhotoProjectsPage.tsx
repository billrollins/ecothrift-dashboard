/**
 * Photo projects (owner 2026-11-24). Phone first: open a project, Scan + photo, repeat. On a desk: rename, share,
 * delete, open a photo, run a Grok edit, download. The owner sees every project; the creator picks who else sees it.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Card, CardActionArea, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  createProject, deletePhoto, deleteProject, editPhoto, getPhotoBlob, getProject, listPeople, listPhotos, listProjects,
  setPhotoNote, updateProject, type EditKind, type PhotoProjectDTO, type PhotoVariant, type ProjectPhotoDTO,
} from '../../api/photoProjects.api';
import { PhotoCapture } from './PhotoCapture';

const EDITS: { kind: EditKind; label: string }[] = [
  { kind: 'remove_background', label: 'Remove background' },
  { kind: 'clean_up', label: 'Clean up' },
  { kind: 'square', label: 'Square thumbnail' },
];

function useBlobUrl(id: number | null, variant: PhotoVariant, version = '') {
  const q = useQuery({
    queryKey: ['photoProjects', 'blob', id, variant, version],
    queryFn: () => getPhotoBlob(id as number, variant),
    enabled: id != null,
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data) return undefined;
    const u = URL.createObjectURL(q.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [q.data]);
  return url;
}

function errText(err: unknown, fallback: string) {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (data && typeof data.detail === 'string') return data.detail;
  return fallback;
}

// ── Project form (new / edit) ──────────────────────────────────────────────

function ProjectDialog({ open, project, onClose }: { open: boolean; project: PhotoProjectDTO | null; onClose: (saved?: PhotoProjectDTO) => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const people = useQuery({ queryKey: ['photoProjects', 'people'], queryFn: listPeople, enabled: open });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shared, setShared] = useState<number[]>([]);
  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? '');
    setDescription(project?.description ?? '');
    setShared(project?.shared_with ?? []);
  }, [open, project]);
  const save = useMutation({
    mutationFn: () => (project
      ? updateProject(project.id, { name: name.trim(), description, shared_with: shared })
      : createProject({ name: name.trim(), description, shared_with: shared })),
    onSuccess: (p) => onClose(p),
    onError: (e) => enqueueSnackbar(errText(e, 'Could not save the project.'), { variant: 'error' }),
  });
  const options = people.data ?? [];
  return (
    <Dialog open={open} onClose={() => onClose()} fullWidth maxWidth="sm">
      <DialogTitle>{project ? 'Edit project' : 'New photo project'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        <TextField label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
        <Autocomplete
          multiple
          options={options}
          getOptionLabel={(o) => o.name}
          value={options.filter((o) => shared.includes(o.id))}
          onChange={(_, v) => setShared(v.map((o) => o.id))}
          renderInput={(params) => <TextField {...params} label="Who else can see it" helperText="You and the owner always can." />}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()}>Cancel</Button>
        <Button variant="contained" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Project list ───────────────────────────────────────────────────────────

function ProjectList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ['photoProjects', 'list'], queryFn: listProjects });
  const [creating, setCreating] = useState(false);
  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, flex: 1 }}>Photo projects</Typography>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New</Button>
      </Box>
      {projects.isLoading ? <CircularProgress /> : null}
      {projects.data && !projects.data.length ? <Alert severity="info">No projects yet. Tap New to start one.</Alert> : null}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        {(projects.data ?? []).map((p) => (
          <Card key={p.id} variant="outlined">
            <CardActionArea onClick={() => navigate(`/photo-projects/${p.id}`)} sx={{ p: 2 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 17 }}>{p.name}</Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                #{p.id} · {p.photo_count} photo{p.photo_count === 1 ? '' : 's'} · {p.created_by_name}
              </Typography>
              {p.description ? <Typography sx={{ fontSize: 14, mt: 0.5 }} noWrap>{p.description}</Typography> : null}
            </CardActionArea>
          </Card>
        ))}
      </Box>
      <ProjectDialog
        open={creating}
        project={null}
        onClose={(saved) => {
          setCreating(false);
          if (saved) {
            qc.invalidateQueries({ queryKey: ['photoProjects', 'list'] });
            navigate(`/photo-projects/${saved.id}`);
          }
        }}
      />
    </Box>
  );
}

// ── One photo ──────────────────────────────────────────────────────────────

function PhotoTile({ photo, onOpen }: { photo: ProjectPhotoDTO; onOpen: () => void }) {
  const edited = useBlobUrl(photo.has_edit ? photo.id : null, 'edited-thumb', `${photo.edit_kind}-${photo.edit_status}`);
  const original = useBlobUrl(photo.id, 'thumb');
  const src = edited ?? original;
  return (
    <Box onClick={onOpen} sx={{ position: 'relative', cursor: 'pointer', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', bgcolor: '#eee', maxWidth: '100%' }}>
      {src ? <Box component="img" src={src} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
      {photo.edit_status === 'working' ? (
        <Chip size="small" label="Grok working" sx={{ position: 'absolute', left: 4, top: 4, bgcolor: '#fff' }} />
      ) : null}
      {photo.edit_status === 'failed' ? <Chip size="small" color="error" label="Edit failed" sx={{ position: 'absolute', left: 4, top: 4 }} /> : null}
      <Typography noWrap sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, px: 0.75, py: 0.25, fontSize: 11.5, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff' }}>
        {photo.item_sku || photo.scanned_code || 'No tag'}{photo.note ? ` · ${photo.note}` : ''}
      </Typography>
    </Box>
  );
}

function PhotoDialog({ photo, onClose }: { photo: ProjectPhotoDTO | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [view, setView] = useState<'original' | 'edited'>('edited');
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setNote(photo?.note ?? '');
    setView(photo?.has_edit ? 'edited' : 'original');
    setConfirmDelete(false);
  }, [photo?.id, photo?.has_edit]); // eslint-disable-line react-hooks/exhaustive-deps
  const original = useBlobUrl(photo?.id ?? null, 'file');
  const edited = useBlobUrl(photo?.has_edit ? photo.id : null, 'edited', `${photo?.edit_kind}-${photo?.edit_status}`);
  const refresh = () => qc.invalidateQueries({ queryKey: ['photoProjects'] });
  const runEdit = useMutation({
    mutationFn: (kind: EditKind) => editPhoto(photo!.id, kind),
    onSuccess: () => { enqueueSnackbar('Grok is working on it (about 20 seconds).', { variant: 'info' }); refresh(); },
    onError: (e) => enqueueSnackbar(errText(e, 'Could not start the edit.'), { variant: 'error' }),
  });
  const saveNote = useMutation({ mutationFn: () => setPhotoNote(photo!.id, note), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => deletePhoto(photo!.id),
    onSuccess: () => { refresh(); onClose(); },
    onError: (e) => enqueueSnackbar(errText(e, 'Could not delete the photo.'), { variant: 'error' }),
  });
  if (!photo) return null;
  const shown = view === 'edited' && edited ? edited : original;
  const download = () => {
    if (!shown) return;
    const a = document.createElement('a');
    a.href = shown;
    a.download = `${photo.item_sku || photo.scanned_code || 'photo'}-${photo.id}${view === 'edited' && edited ? '-edited' : ''}.jpg`;
    a.click();
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>
        {photo.item_title ? `${photo.item_sku} · ${photo.item_title}` : photo.scanned_code || 'No tag'}
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{photo.taken_by_name} · {new Date(photo.created_at).toLocaleString()}</Typography>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {photo.has_edit ? (
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
            <ToggleButton value="original">Original</ToggleButton>
            <ToggleButton value="edited">Edited</ToggleButton>
          </ToggleButtonGroup>
        ) : null}
        <Box sx={{ bgcolor: '#f3f3f3', borderRadius: '8px', minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {shown ? <Box component="img" src={shown} alt="" sx={{ maxWidth: '100%', maxHeight: '60vh', display: 'block' }} /> : <CircularProgress />}
        </Box>
        {photo.edit_status === 'working' ? <Alert severity="info" icon={<CircularProgress size={18} />}>Grok is working on it…</Alert> : null}
        {photo.edit_status === 'failed' ? <Alert severity="error">{photo.edit_error || 'The edit failed.'} Try again.</Alert> : null}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {EDITS.map((e) => (
            <Button key={e.kind} variant="outlined" disabled={photo.edit_status === 'working' || runEdit.isPending} onClick={() => runEdit.mutate(e.kind)}>
              {e.label}
            </Button>
          ))}
        </Box>
        <TextField
          label="Note"
          size="small"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== photo.note && saveNote.mutate()}
          multiline
          maxRows={4}
        />
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        {confirmDelete ? (
          <>
            <Typography sx={{ mr: 'auto', fontSize: 14 }}>Delete this photo for good?</Typography>
            <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
            <Button color="error" variant="contained" onClick={() => remove.mutate()} disabled={remove.isPending}>Delete</Button>
          </>
        ) : (
          <>
            <Button color="error" startIcon={<DeleteOutlineRounded />} onClick={() => setConfirmDelete(true)} sx={{ mr: 'auto' }}>Delete</Button>
            <Button onClick={download} disabled={!shown}>Download</Button>
            <Button variant="contained" onClick={onClose}>Done</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ── One project ────────────────────────────────────────────────────────────

function ProjectView({ id }: { id: number }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const project = useQuery({ queryKey: ['photoProjects', 'project', id], queryFn: () => getProject(id) });
  const photos = useQuery({
    queryKey: ['photoProjects', 'photos', id],
    queryFn: () => listPhotos(id),
    refetchInterval: (q) => ((q.state.data ?? []).some((p) => p.edit_status === 'working') ? 4000 : false),
  });
  const [capturing, setCapturing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const openPhoto = (photos.data ?? []).find((p) => p.id === openId) ?? null;
  const remove = useMutation({
    mutationFn: () => deleteProject(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['photoProjects'] }); navigate('/photo-projects'); },
    onError: (e) => enqueueSnackbar(errText(e, 'Could not delete the project.'), { variant: 'error' }),
  });

  if (project.isError) return <Alert severity="warning" sx={{ m: 2 }}>This project is not there, or it is not shared with you.</Alert>;
  if (!project.data) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  const p = project.data;
  const count = photos.data?.length ?? p.photo_count;
  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
        <IconButton aria-label="All projects" onClick={() => navigate('/photo-projects')}><ArrowBackRounded /></IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>{p.name}</Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>#{p.id} · {count} photo{count === 1 ? '' : 's'} · {p.created_by_name}</Typography>
          {p.description ? <Typography sx={{ fontSize: 14, mt: 0.5 }}>{p.description}</Typography> : null}
        </Box>
        {p.can_manage ? (
          <>
            <IconButton aria-label="Edit project" onClick={() => setEditing(true)}><EditOutlined /></IconButton>
            <IconButton aria-label="Delete project" onClick={() => setConfirmDelete(true)}><DeleteOutlineRounded /></IconButton>
          </>
        ) : null}
      </Box>
      <Button fullWidth size="large" variant="contained" startIcon={<QrCodeScannerRounded />} onClick={() => setCapturing(true)} sx={{ mb: 2, py: 1.5, fontSize: 17 }}>
        Scan + photo
      </Button>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(5, 1fr)', md: 'repeat(6, 1fr)' }, gap: 1 }}>
        {(photos.data ?? []).map((ph) => <PhotoTile key={ph.id} photo={ph} onOpen={() => setOpenId(ph.id)} />)}
      </Box>
      {photos.data && !photos.data.length ? <Typography sx={{ color: 'text.secondary', mt: 1 }}>No photos yet.</Typography> : null}
      <PhotoDialog photo={openPhoto} onClose={() => setOpenId(null)} />
      <ProjectDialog
        open={editing}
        project={p}
        onClose={(saved) => { setEditing(false); if (saved) qc.invalidateQueries({ queryKey: ['photoProjects'] }); }}
      />
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Delete {p.name}?</DialogTitle>
        <DialogContent>It goes away now and is removed for good in 30 days, with its {count} photo{count === 1 ? '' : 's'}.</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
          <Button color="error" variant="contained" disabled={remove.isPending} onClick={() => remove.mutate()}>Delete</Button>
        </DialogActions>
      </Dialog>
      {capturing ? (
        <PhotoCapture
          projectId={p.id}
          projectName={p.name}
          count={count}
          onClose={() => setCapturing(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['photoProjects'] })}
        />
      ) : null}
    </Box>
  );
}

export default function PhotoProjectsPage() {
  const { id } = useParams();
  const n = id ? Number(id) : NaN;
  return Number.isFinite(n) ? <ProjectView id={n} /> : <ProjectList />;
}
