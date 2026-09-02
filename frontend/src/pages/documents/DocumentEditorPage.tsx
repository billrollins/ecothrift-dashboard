import '../../pdf/setup';
import {
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchDocumentPdfBlob, type DocumentField, type DocumentFieldKind } from '../../api/documents.api';
import { getDepartments } from '../../api/hr.api';
import { dutyColors } from '../../components/duty/tokens';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useRoutineAssignees } from '../../hooks/useRoutines';
import {
  useAssignDocument,
  useReplaceDocumentFields,
  useSaveDocument,
  useStaffDocument,
  useUploadDocumentPdf,
} from '../../hooks/useDocuments';

const KINDS: DocumentFieldKind[] = ['signature', 'initials', 'date', 'text', 'checkbox'];

export default function DocumentEditorPage() {
  const { id } = useParams();
  const editingId = id && id !== 'new' ? Number(id) : null;
  const navigate = useNavigate();
  const existing = useStaffDocument(editingId);
  const save = useSaveDocument();
  const upload = useUploadDocumentPdf();
  const saveFields = useReplaceDocumentFields();
  const assign = useAssignDocument();
  const assignees = useRoutineAssignees();
  const departments = useQuery({
    queryKey: ['hr', 'departments'],
    queryFn: async () => (await getDepartments()).data,
  });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'sign' | 'acknowledge' | 'read'>('sign');
  const [docId, setDocId] = useState<number | null>(editingId);
  const [fields, setFields] = useState<DocumentField[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [kind, setKind] = useState<DocumentFieldKind>('signature');
  const [audience, setAudience] = useState<'everyone' | 'person' | 'role' | 'department'>('everyone');
  const [personId, setPersonId] = useState<number | ''>('');
  const [role, setRole] = useState('Staff');
  const [dept, setDept] = useState<number | ''>('');
  const [file, setFile] = useState<Blob | null>(null);
  const [pageWidth, setPageWidth] = useState(360);
  const [error, setError] = useState('');
  const drag = useRef<{ page: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!existing.data) return;
    setTitle(existing.data.title);
    setDescription(existing.data.description);
    setMode(existing.data.mode);
    setDocId(existing.data.id);
    setFields(existing.data.fields || []);
    if (existing.data.has_file) {
      void fetchDocumentPdfBlob(existing.data.id).then(setFile).catch(() => setError('Could not load the PDF.'));
    }
  }, [existing.data]);

  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  async function ensureDoc() {
    if (docId) return docId;
    const created = await save.mutateAsync({ data: { title: title || 'Untitled', description, mode } });
    setDocId(created.id);
    navigate(`/documents/${created.id}/edit`, { replace: true });
    return created.id;
  }

  if (editingId && existing.isLoading && !existing.data) {
    return <LoadingScreen message="Loading document..." />;
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
      <Typography variant="h5" fontWeight={700}>{editingId ? 'Edit document' : 'Upload document'}</Typography>
      <Stack spacing={2} sx={{ mt: 2, maxWidth: 720 }}>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
        <TextField select label="Mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <MenuItem value="sign">Sign</MenuItem>
          <MenuItem value="acknowledge">Acknowledge</MenuItem>
          <MenuItem value="read">Read</MenuItem>
        </TextField>
        <Button component="label" variant="outlined">
          Upload PDF
          <input
            hidden
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (!picked) return;
              void ensureDoc().then((id) => upload.mutateAsync({ id, file: picked })).then((doc) => {
                setFile(picked);
                setDocId(doc.id);
              }).catch(() => setError('Upload a PDF. Export from Word as PDF and try again.'));
            }}
          />
        </Button>
        <TextField select label="Field kind" value={kind} onChange={(e) => setKind(e.target.value as DocumentFieldKind)}>
          {KINDS.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>
      </Stack>

      <Box sx={{ mt: 2, maxWidth: 720 }} ref={(node: HTMLDivElement | null) => {
        if (node) setPageWidth(Math.min(720, node.clientWidth));
      }}>
        {fileUrl ? (
          <Document file={fileUrl}>
            {Array.from({ length: existing.data?.page_count || 1 }, (_, page) => (
              <Box
                key={page}
                sx={{ position: 'relative', mb: 1, width: pageWidth, userSelect: 'none' }}
                onMouseDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  drag.current = {
                    page,
                    x: ((e.clientX - rect.left) / rect.width) * 100,
                    y: ((e.clientY - rect.top) / rect.height) * 100,
                  };
                }}
                onMouseUp={(e) => {
                  if (!drag.current || drag.current.page !== page) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * 100;
                  const y = ((e.clientY - rect.top) / rect.height) * 100;
                  const x_pct = Math.max(0, Math.min(drag.current.x, x));
                  const y_pct = Math.max(0, Math.min(drag.current.y, y));
                  const w_pct = Math.max(4, Math.abs(x - drag.current.x));
                  const h_pct = Math.max(3, Math.abs(y - drag.current.y));
                  drag.current = null;
                  setFields((cur) => [
                    ...cur,
                    { page, x_pct, y_pct, w_pct, h_pct, kind, label: kind, required: true, order: cur.length },
                  ]);
                }}
              >
                <Page pageNumber={page + 1} width={pageWidth} renderTextLayer={false} />
                {fields.filter((field) => field.page === page).map((field, index) => (
                  <Box
                    key={`${field.page}-${index}-${field.x_pct}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(fields.indexOf(field));
                    }}
                    sx={{
                      position: 'absolute',
                      left: `${field.x_pct}%`,
                      top: `${field.y_pct}%`,
                      width: `${field.w_pct}%`,
                      height: `${field.h_pct}%`,
                      border: `1.5px solid ${selected === fields.indexOf(field) ? dutyColors.violet : dutyColors.blue}`,
                      bgcolor: 'rgba(47,95,168,0.10)',
                      fontSize: 11,
                      px: 0.5,
                    }}
                  >
                    {field.label || field.kind}
                  </Box>
                ))}
              </Box>
            ))}
          </Document>
        ) : (
          <Typography color="text.secondary" sx={{ minHeight: 24 }}>Upload a PDF, then drag to place fields.</Typography>
        )}
      </Box>

      {selected != null && fields[selected] ? (
        <Stack direction="row" spacing={1} sx={{ mt: 2, maxWidth: 720 }}>
          <TextField
            label="Label"
            value={fields[selected].label}
            onChange={(e) => setFields((cur) => cur.map((field, i) => (i === selected ? { ...field, label: e.target.value } : field)))}
          />
          <FormControlLabel
            control={(
              <Switch
                checked={fields[selected].required}
                onChange={(e) => setFields((cur) => cur.map((field, i) => (i === selected ? { ...field, required: e.target.checked } : field)))}
              />
            )}
            label="Required"
          />
          <Button color="error" onClick={() => setFields((cur) => cur.filter((_, i) => i !== selected))}>Delete field</Button>
        </Stack>
      ) : null}

      <Stack spacing={2} sx={{ mt: 3, maxWidth: 720 }}>
        <Button
          variant="outlined"
          disabled={!docId}
          onClick={() => {
            if (!docId) return;
            void saveFields.mutateAsync({ id: docId, fields }).catch(() => setError('Could not save fields.'));
            void save.mutateAsync({ id: docId, data: { title, description, mode } });
          }}
        >
          Save fields
        </Button>
        <Typography fontWeight={700}>Assign</Typography>
        <TextField select label="Audience" value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
          <MenuItem value="everyone">Everyone</MenuItem>
          <MenuItem value="person">Person</MenuItem>
          <MenuItem value="role">Role</MenuItem>
          <MenuItem value="department">Department</MenuItem>
        </TextField>
        {audience === 'person' ? (
          <TextField select label="Person" value={personId} onChange={(e) => setPersonId(Number(e.target.value))}>
            {(assignees.data ?? []).map((row) => (
              <MenuItem key={row.id} value={row.id}>{row.full_name}</MenuItem>
            ))}
          </TextField>
        ) : null}
        {audience === 'role' ? (
          <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
            {['Staff', 'Employee', 'Manager', 'Admin'].map((value) => (
              <MenuItem key={value} value={value}>{value}</MenuItem>
            ))}
          </TextField>
        ) : null}
        {audience === 'department' ? (
          <TextField select label="Department" value={dept} onChange={(e) => setDept(Number(e.target.value))}>
            {(departments.data ?? []).map((row) => (
              <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>
            ))}
          </TextField>
        ) : null}
        <Button
          variant="contained"
          disabled={!docId}
          onClick={() => {
            if (!docId) return;
            void assign.mutateAsync([
              docId,
              {
                audience,
                assigned_user: audience === 'person' ? Number(personId) || null : null,
                assigned_role: audience === 'role' ? role : '',
                assigned_department: audience === 'department' ? Number(dept) || null : null,
              },
            ]).then(() => navigate('/documents')).catch(() => setError('Could not assign.'));
          }}
        >
          Assign
        </Button>
        {error ? <Typography color="error">{error}</Typography> : null}
      </Stack>
    </Box>
  );
}
