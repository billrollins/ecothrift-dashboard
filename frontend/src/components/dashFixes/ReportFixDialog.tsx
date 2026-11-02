import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useReportDashFix } from '../../hooks/useDashFixes';
import { t } from '../../i18n/routines';

export const MAX_PHOTOS = 3;

export interface ReportFixDialogProps {
  open: boolean;
  onClose: () => void;
  /** The Dash page the person was on (never /dash-fixes itself). Sent with the report. */
  pagePath: string;
  onSent?: () => void;
}

/** The "Report a fix" form: say what is wrong or wanted, add up to three screenshots. */
export function ReportFixDialog({ open, onClose, pagePath, onSent }: ReportFixDialogProps) {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const report = useReportDashFix();
  const [details, setDetails] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDetails('');
    setIsPrivate(false);
    setPhotos([]);
    setError('');
  }, [open]);

  const submit = () => {
    if (!details.trim()) {
      setError(t('fxTitleNeeded', lang));
      return;
    }
    setError('');
    report.mutate(
      { details: details.trim(), page_path: pagePath, private: isPrivate, photos },
      {
        onSuccess: () => {
          onSent?.();
          onClose();
        },
        onError: () => setError(t('fxSendFailed', lang)),
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="report-fix-dialog">
      <DialogTitle sx={{ fontWeight: 800 }}>{t('reportFix', lang)}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <Typography data-testid="report-fix-page" sx={{ fontSize: 13, color: 'text.secondary' }}>
          {t('fxPageLabel', lang)}: {pagePath || t('fxNoPage', lang)}
        </Typography>
        <TextField
          autoFocus
          required
          label={t('fxExplain', lang)}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          multiline
          minRows={4}
          slotProps={{ htmlInput: { maxLength: 4000, 'data-testid': 'report-fix-details' } }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            data-testid="report-fix-photo"
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []);
              event.target.value = '';
              setPhotos((current) => [...current, ...picked].slice(0, MAX_PHOTOS));
            }}
          />
          <Button variant="outlined" disabled={photos.length >= MAX_PHOTOS} onClick={() => fileRef.current?.click()}>
            {t('fxAddPhoto', lang)}
          </Button>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{t('fxPhotosHint', lang)}</Typography>
        </Box>
        {photos.map((file, index) => (
          <Box key={`${file.name}-${index}`} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 13, wordBreak: 'break-all', flex: 1 }}>{file.name}</Typography>
            <Button size="small" onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}>
              {t('fxRemovePhoto', lang)}
            </Button>
          </Box>
        ))}
        {user?.is_superuser ? (
          <FormControlLabel
            control={
              <Checkbox
                checked={isPrivate}
                onChange={(event) => setIsPrivate(event.target.checked)}
                slotProps={{ input: { 'data-testid': 'report-fix-private' } as React.InputHTMLAttributes<HTMLInputElement> }}
              />
            }
            label={t('fxMakePrivate', lang)}
          />
        ) : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t('fxCancel', lang)}</Button>
        <Button variant="contained" onClick={submit} disabled={report.isPending} data-testid="report-fix-send">
          {report.isPending ? t('fxSending', lang) : t('fxSend', lang)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
