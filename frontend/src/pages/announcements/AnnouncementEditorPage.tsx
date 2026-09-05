import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { RichTextEditor } from '../../components/common/RichTextEditor';
import {
  useAnnouncement,
  useUpdateAnnouncement,
  useUploadAnnouncementImage,
  useDeleteAnnouncementImage,
  useUpdateAnnouncementImageAlt,
} from '../../hooks/useAnnouncements';
import { useHoursOverrides } from '../../hooks/useHoursOverrides';
import type {
  AnnouncementKind,
  AnnouncementPlacement,
  AnnouncementStyle,
  AnnouncementWrite,
} from '../../api/webstore.api';
import { AnnouncementPreview } from './AnnouncementPreview';

const KINDS: AnnouncementKind[] = ['promotion', 'notice', 'holiday', 'event'];
const STYLES: AnnouncementStyle[] = ['sale', 'info', 'warning', 'holiday', 'seasonal'];
const PLACEMENTS: AnnouncementPlacement[] = ['banner', 'home_hero', 'home_card', 'visit', 'shop'];

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function combine(dateIso: string | null, time: string): string | null {
  if (!dateIso) return null;
  const hhmm = time || '00:00';
  return `${dateIso}T${hhmm}:00`;
}

function timePart(value: string | null): string {
  if (!value || value.length < 16) return '00:00';
  return value.slice(11, 16);
}

export default function AnnouncementEditorPage() {
  const { id } = useParams();
  const numericId = Number(id);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading } = useAnnouncement(numericId);
  const { data: overrides = [] } = useHoursOverrides();
  const update = useUpdateAnnouncement();
  const upload = useUploadAnnouncementImage();
  const removeImage = useDeleteAnnouncementImage();
  const updateAlt = useUpdateAnnouncementImageAlt();

  const [draft, setDraft] = useState<AnnouncementWrite>({});
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');

  useEffect(() => {
    if (!data) return;
    setDraft({
      title: data.title,
      kind: data.kind,
      style: data.style,
      body_html: data.body_html,
      body_json: data.body_json,
      cta_label: data.cta_label,
      cta_url: data.cta_url,
      placements: data.placements,
      priority: data.priority,
      dismissible: data.dismissible,
      is_active: data.is_active,
      is_template: data.is_template,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      linked_hours_override: data.linked_hours_override,
    });
    setStartTime(timePart(data.starts_at));
    setEndTime(timePart(data.ends_at));
  }, [data]);

  const uploadImage = useCallback(
    async (file: File) => {
      const img = await upload.mutateAsync({ id: numericId, file });
      return { url: img.url, alt: img.alt || '' };
    },
    [numericId, upload],
  );

  async function handleSave() {
    try {
      await update.mutateAsync({ id: numericId, data: draft });
      enqueueSnackbar('Saved', { variant: 'success' });
    } catch {
      enqueueSnackbar('Save failed', { variant: 'error' });
    }
  }

  if (isLoading || !data) return <LoadingScreen message="Loading announcement…" />;

  const preview = { ...data, ...draft, images: data.images };

  return (
    <Box>
      <PageHeader
        title={draft.title || 'Announcement'}
        subtitle="Edit copy, photos, placements, and schedule. Toggle live when it is ready."
        action={
          <Stack direction="row" spacing={1}>
            <Button onClick={() => navigate('/announcements')}>Back</Button>
            <Button variant="contained" onClick={handleSave} disabled={update.isPending}>
              Save
            </Button>
          </Stack>
        }
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        <Stack spacing={2}>
          <TextField
            label="Title"
            value={draft.title || ''}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            fullWidth
          />
          <Stack direction="row" spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Kind</InputLabel>
              <Select
                label="Kind"
                value={draft.kind || 'promotion'}
                onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as AnnouncementKind }))}
              >
                {KINDS.map((k) => (
                  <MenuItem key={k} value={k}>{k}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Style</InputLabel>
              <Select
                label="Style"
                value={draft.style || 'info'}
                onChange={(e) => setDraft((d) => ({ ...d, style: e.target.value as AnnouncementStyle }))}
              >
                {STYLES.map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          <RichTextEditor
            variant="blog"
            value={draft.body_json && 'content' in (draft.body_json as object) ? draft.body_json : draft.body_html || ''}
            onChange={(value) =>
              setDraft((d) => ({ ...d, body_html: value.html, body_json: value.json as Record<string, unknown> }))
            }
            uploadImage={uploadImage}
            placeholder="Announcement body. Tokens: {{holiday_hours}} {{regular_hours}} {{sale_end}} {{store_name}}"
          />
          <Typography variant="subtitle2">Gallery</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {(data.images || []).map((img) => (
              <Box key={img.id} sx={{ width: 120 }}>
                <img src={img.url} alt={img.alt} style={{ width: '100%', borderRadius: 6 }} />
                <TextField
                  size="small"
                  label="Alt"
                  value={img.alt}
                  onBlur={(e) =>
                    updateAlt.mutate({ announcementId: numericId, imageId: img.id, alt: e.target.value })
                  }
                  fullWidth
                  sx={{ mt: 0.5 }}
                />
                <Button size="small" onClick={() => removeImage.mutate({ announcementId: numericId, imageId: img.id })}>
                  Remove
                </Button>
              </Box>
            ))}
          </Stack>
          <Button component="label" variant="outlined">
            Add photo
            <input
              hidden
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate({ id: numericId, file });
                e.target.value = '';
              }}
            />
          </Button>
          <Stack direction="row" spacing={2}>
            <TextField
              label="CTA label"
              value={draft.cta_label || ''}
              onChange={(e) => setDraft((d) => ({ ...d, cta_label: e.target.value }))}
              fullWidth
            />
            <TextField
              label="CTA URL"
              value={draft.cta_url || ''}
              onChange={(e) => setDraft((d) => ({ ...d, cta_url: e.target.value }))}
              fullWidth
            />
          </Stack>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Placements</Typography>
            {PLACEMENTS.map((p) => (
              <FormControlLabel
                key={p}
                control={
                  <Checkbox
                    checked={(draft.placements || []).includes(p)}
                    onChange={(_, checked) =>
                      setDraft((d) => {
                        const current = new Set(d.placements || []);
                        if (checked) current.add(p);
                        else current.delete(p);
                        return { ...d, placements: [...current] };
                      })
                    }
                  />
                }
                label={p.replace('_', ' ')}
              />
            ))}
          </Box>
          <Stack direction="row" spacing={2} alignItems="center">
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(draft.is_active)}
                  onChange={(_, checked) => setDraft((d) => ({ ...d, is_active: checked }))}
                />
              }
              label="Active"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(draft.dismissible)}
                  onChange={(_, checked) => setDraft((d) => ({ ...d, dismissible: checked }))}
                />
              }
              label="Dismissible"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(draft.is_template)}
                  onChange={(_, checked) => setDraft((d) => ({ ...d, is_template: checked }))}
                />
              }
              label="Template"
            />
            <TextField
              label="Priority"
              type="number"
              value={draft.priority ?? 0}
              onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) }))}
              sx={{ width: 120 }}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <DatePicker
              label="Starts"
              value={toDate(draft.starts_at || null)}
              onChange={(value) =>
                setDraft((d) => ({ ...d, starts_at: combine(isoDate(value), startTime) }))
              }
            />
            <TextField
              type="time"
              label="Start time"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                setDraft((d) => ({ ...d, starts_at: combine(isoDate(toDate(d.starts_at || null)), e.target.value) }));
              }}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <DatePicker
              label="Ends"
              value={toDate(draft.ends_at || null)}
              onChange={(value) =>
                setDraft((d) => ({ ...d, ends_at: combine(isoDate(value), endTime) }))
              }
            />
            <TextField
              type="time"
              label="End time"
              value={endTime}
              onChange={(e) => {
                setEndTime(e.target.value);
                setDraft((d) => ({ ...d, ends_at: combine(isoDate(toDate(d.ends_at || null)), e.target.value) }));
              }}
            />
          </Stack>
          <FormControl fullWidth>
            <InputLabel>Linked holiday hours</InputLabel>
            <Select
              label="Linked holiday hours"
              value={draft.linked_hours_override ?? 0}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  linked_hours_override: Number(e.target.value) || null,
                }))
              }
            >
              <MenuItem value={0}>None</MenuItem>
              {overrides.map((ov) => (
                <MenuItem key={ov.id} value={ov.id}>
                  {ov.label} ({ov.date_start})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Preview</Typography>
          <AnnouncementPreview announcement={preview} />
        </Box>
      </Box>
    </Box>
  );
}
