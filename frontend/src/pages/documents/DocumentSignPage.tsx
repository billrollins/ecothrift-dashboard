import '../../pdf/setup';
import { Alert, Box, Button, Checkbox, Dialog, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { Document, Page } from 'react-pdf';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchDocumentPdfBlob } from '../../api/documents.api';
import type { DocumentField } from '../../api/documents.api';
import { SignaturePad } from '../../components/pos/delivery/SignaturePad';
import { dutyColors } from '../../components/duty/tokens';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  useCompleteDocumentRecipient,
  useDocumentRecipient,
  useViewDocumentRecipient,
} from '../../hooks/useDocuments';
import { getAccessToken } from '../../api/client';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function DocumentSignPage() {
  const { id } = useParams();
  const recipientId = Number(id);
  const navigate = useNavigate();
  const recipient = useDocumentRecipient(Number.isFinite(recipientId) ? recipientId : null);
  const view = useViewDocumentRecipient();
  const complete = useCompleteDocumentRecipient();
  const [file, setFile] = useState<Blob | null>(null);
  const [pageWidth, setPageWidth] = useState(360);
  const [values, setValues] = useState<Record<number, { value_text?: string; value_file?: string }>>({});
  const [cursor, setCursor] = useState(0);
  const [signingField, setSigningField] = useState<DocumentField | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!recipient.data) return;
    void view.mutateAsync(recipient.data.id);
    void fetchDocumentPdfBlob(recipient.data.document).then(setFile).catch(() => setError('Could not load the PDF.'));
  }, [recipient.data]);

  const fields = recipient.data?.fields ?? [];
  const required = fields.filter((field) => field.required);
  const current = required[cursor] ?? required[0] ?? null;

  const token = getAccessToken();
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  if (recipient.isLoading && !recipient.data) return <LoadingScreen message="Opening document..." />;
  if (!recipient.data) return <Alert severity="error">Document not found.</Alert>;

  const row = recipient.data;

  async function finish() {
    const payload = fields
      .map((field) => {
        const value = values[field.id as number];
        if (!value) return null;
        return { field: field.id as number, ...value };
      })
      .filter((value): value is { field: number; value_text?: string; value_file?: string } => Boolean(value));
    try {
      await complete.mutateAsync({ id: row.id, values: payload });
      navigate('/documents');
    } catch {
      setError('Fill every required field to finish.');
    }
  }

  if (row.mode !== 'sign') {
    return (
      <Box sx={{ p: 2, bgcolor: dutyColors.paper, height: '100%' }}>
        <Typography variant="h6" fontWeight={700}>{row.title}</Typography>
        <Typography sx={{ mt: 1, color: dutyColors.ink60, minHeight: 20 }}>{row.description || ' '}</Typography>
        {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : null}
        <Button
          fullWidth
          variant="contained"
          sx={{ mt: 3, height: 48, bgcolor: dutyColors.ink }}
          onClick={() => void finish()}
        >
          {row.mode === 'acknowledge' ? 'I acknowledge' : 'Mark as read'}
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: dutyColors.paper }}>
      <Box sx={{ px: 2, py: 1.5, bgcolor: dutyColors.ink, color: '#fff' }}>
        <Typography fontWeight={700}>{row.title}</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', minHeight: 18 }}>
          {current ? `Next: ${current.label || current.kind}` : 'All required fields filled'}
        </Typography>
      </Box>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Box
        sx={{ flex: 1, overflow: 'auto', p: 1 }}
        ref={(node: HTMLDivElement | null) => {
          if (node) setPageWidth(Math.min(720, node.clientWidth - 16));
        }}
      >
        {fileUrl ? (
          <Document file={fileUrl} options={token ? { httpHeaders: { Authorization: `Bearer ${token}` } } : undefined}>
            {Array.from({ length: row.page_count || 1 }, (_, page) => (
              <Box key={page} sx={{ position: 'relative', mb: 1, width: pageWidth }}>
                <Page pageNumber={page + 1} width={pageWidth} renderTextLayer={false} />
                {fields.filter((field) => field.page === page).map((field) => (
                  <Box
                    key={`${field.page}-${field.x_pct}-${field.y_pct}`}
                    onClick={() => {
                      if (field.kind === 'signature' || field.kind === 'initials') {
                        setSigningField(field);
                      }
                    }}
                    sx={{
                      position: 'absolute',
                      left: `${field.x_pct}%`,
                      top: `${field.y_pct}%`,
                      width: `${field.w_pct}%`,
                      height: `${field.h_pct}%`,
                      border: `1.5px solid ${current && current === field ? dutyColors.violet : dutyColors.blue}`,
                      bgcolor: 'rgba(47,95,168,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      px: 0.5,
                    }}
                  >
                    {field.kind === 'text' || field.kind === 'date' ? (
                      <TextField
                        variant="standard"
                        fullWidth
                        type={field.kind === 'date' ? 'date' : 'text'}
                        value={values[field.id as number]?.value_text || ''}
                        onChange={(e) => setValues((cur) => ({
                          ...cur,
                          [field.id as number]: { value_text: e.target.value },
                        }))}
                        placeholder={field.label}
                      />
                    ) : field.kind === 'checkbox' ? (
                      <Checkbox
                        checked={(values[field.id as number]?.value_text || '') === 'true'}
                        onChange={(e) => setValues((cur) => ({
                          ...cur,
                          [field.id as number]: { value_text: e.target.checked ? 'true' : '' },
                        }))}
                      />
                    ) : (
                      <Typography sx={{ fontSize: 11, color: dutyColors.ink60 }}>
                        {values[field.id as number]?.value_file ? 'Signed' : field.label || field.kind}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            ))}
          </Document>
        ) : (
          <LoadingScreen message="Loading PDF..." />
        )}
      </Box>
      <Box sx={{ p: 1.5, display: 'flex', gap: 1 }}>
        <Button
          sx={{ flex: 1, height: 48 }}
          onClick={() => setCursor((i) => Math.min(required.length - 1, i + 1))}
        >
          Next required field
        </Button>
        <Button
          variant="contained"
          sx={{ flex: 1, height: 48, bgcolor: dutyColors.ink }}
          onClick={() => void finish()}
        >
          Finish
        </Button>
      </Box>
      <Dialog open={Boolean(signingField)} onClose={() => setSigningField(null)} fullWidth>
        <Box sx={{ p: 2 }}>
          <Typography fontWeight={700} sx={{ mb: 1 }}>Sign</Typography>
          <SignaturePad
            onCapture={async (blob) => {
              if (!signingField?.id) return;
              const dataUrl = await blobToDataUrl(blob);
              setValues((cur) => ({ ...cur, [signingField.id as number]: { value_file: dataUrl } }));
              setSigningField(null);
              setCursor((i) => Math.min(required.length - 1, i + 1));
            }}
          />
        </Box>
      </Dialog>
    </Box>
  );
}
