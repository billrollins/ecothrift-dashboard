/**
 * Photo projects (owner 2026-11-24). Phone first: open a project, Scan + photo, repeat. Open a photo for the photo
 * editor (Dash #209: versions, Edit, AI). The grid shows each photo's Main version. The owner sees every project; the
 * creator picks who else sees it.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Card, CardActionArea, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, TextField, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  createProject, deleteProject, getProject, listPeople, listPhotos, listProjects, updateProject,
  type PhotoProjectDTO, type ProjectPhotoDTO,
} from '../../api/photoProjects.api';
import { CHECKER } from '../../components/photoEditor/PicturePreview';
import { PhotoEditor } from './editor/PhotoEditor';
import { useObjectUrl, usePictureBlob } from './editor/pictures';
import { PhotoCapture } from './PhotoCapture';

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
  const main = photo.versions.find((v) => v.id === photo.main) ?? null;
  const src = useObjectUrl(usePictureBlob(photo.id, photo.main, 'thumb').data);
  const working = photo.versions.some((v) => v.status === 'working');
  return (
    <Box
      onClick={onOpen}
      sx={{ position: 'relative', cursor: 'pointer', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', bgcolor: '#eee', background: main?.see_through ? CHECKER : undefined, maxWidth: '100%' }}
    >
      {src ? <Box component="img" src={src} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
      {working ? (
        <Chip size="small" icon={<CircularProgress size={12} />} label="AI working" sx={{ position: 'absolute', left: 4, top: 4, bgcolor: '#fff' }} />
      ) : null}
      <Typography noWrap sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, px: 0.75, py: 0.25, fontSize: 11.5, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff' }}>
        {photo.item_sku || photo.scanned_code || 'No tag'}{photo.note ? ` · ${photo.note}` : ''}
      </Typography>
    </Box>
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
    refetchInterval: (q) => ((q.state.data ?? []).some((p) => p.versions.some((v) => v.status === 'working')) ? 4000 : false),
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
      {openPhoto ? <PhotoEditor key={openPhoto.id} photo={openPhoto} projectName={p.name} onClose={() => setOpenId(null)} /> : null}
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
