import { Alert, Box, Button, Divider, Drawer, FormControlLabel, IconButton, Stack, Switch, TextField, Typography } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getDashFixPhoto } from '../../api/dashFixes.api';
import { useAddDashFixNote, useDashFixOwnerAction } from '../../hooks/useDashFixes';
import { t } from '../../i18n/routines';
import type { DashFixDTO } from '../../types/dashFixes.types';
import { formatShortDate, kindLabel, versionLabel } from './dashFixesModel';
import { StatusChip } from './DashFixRow';

function Screenshot({ fixId, photoId, alt }: { fixId: number; photoId: number; alt: string }) {
  const { data } = useQuery({
    queryKey: ['dashFixes', 'photo', fixId, photoId],
    queryFn: async () => (await getDashFixPhoto(fixId, photoId)).data,
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data) {
      setUrl(null);
      return undefined;
    }
    const next = URL.createObjectURL(data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [data]);
  if (!url) return null;
  return (
    <Box
      component="img"
      src={url}
      alt={alt}
      data-testid="fix-photo"
      sx={{ maxWidth: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider', my: 1 }}
    />
  );
}

export interface DashFixDrawerProps {
  fix: DashFixDTO | null;
  lang: string;
  isOwner: boolean;
  /** The running app version, e.g. "2.240.0": prefills the Done field. */
  appVersion: string;
  onClose: () => void;
}

export function DashFixDrawer({ fix, lang, isOwner, appVersion, onClose }: DashFixDrawerProps) {
  const addNote = useAddDashFixNote();
  const act = useDashFixOwnerAction();
  const [note, setNote] = useState('');
  const [declining, setDeclining] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reason, setReason] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');

  useEffect(() => {
    setNote('');
    setDeclining(false);
    setDeleting(false);
    setReason('');
    setFinishing(false);
    setVersion(versionLabel(appVersion));
    setError('');
    setAnswer('');
  }, [fix?.id, appVersion]);

  const run = (action: Parameters<typeof act.mutate>[0], after?: () => void) => {
    setError('');
    act.mutate(action, {
      onSuccess: () => after?.(),
      onError: () => setError(t('fxActionFailed', lang)),
    });
  };

  const postNote = () => {
    if (!fix || !note.trim()) return;
    addNote.mutate(
      { id: fix.id, body: note.trim() },
      { onSuccess: () => setNote(''), onError: () => setError(t('fxActionFailed', lang)) },
    );
  };

  const inLine = fix?.status === 'accepted' || fix?.status === 'working' || fix?.status === 'almost';

  return (
    <Drawer
      anchor="right"
      open={Boolean(fix)}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 440 }, maxWidth: '100%' } } }}
    >
      {fix ? (
        <Box data-testid="fix-drawer" sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 2, pb: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography component="h2" sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                {fix.title}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5, overflowWrap: 'anywhere' }}>
                {[
                  kindLabel(fix.kind, lang),
                  fix.page_path || null,
                  fix.submitted_by_name ? t('fxReportedBy', lang).replace('{name}', fix.submitted_by_name) : null,
                  fix.size || null,
                  formatShortDate(fix.created_at),
                ].filter(Boolean).join(' · ')}
              </Typography>
              <Box sx={{ mt: 1 }}><StatusChip row={fix} lang={lang} /></Box>
              {fix.session ? (
                <Typography data-testid="fix-drawer-session" sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5, overflowWrap: 'anywhere' }}>
                  {t('fxSession', lang)}: {fix.session}
                </Typography>
              ) : null}
            </Box>
            <IconButton onClick={onClose} aria-label={t('fxClose', lang)} sx={{ width: 44, height: 44 }}>
              <CloseRounded />
            </IconButton>
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pb: 2 }}>
            <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 14.5, my: 1 }}>
              {fix.details || t('fxNoDetails', lang)}
            </Typography>
            {fix.photos.map((photoId, index) => (
              <Screenshot key={photoId} fixId={fix.id} photoId={photoId} alt={`${t('fxPhotoAlt', lang)} ${index + 1}`} />
            ))}
            {isOwner && fix.question_for_owner ? (
              <Box data-testid="fix-question" sx={{ my: 1.5, p: 1.5, borderRadius: 1.5, bgcolor: '#FEF3C7' }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {t('fxQuestion', lang)}
                </Typography>
                <Typography sx={{ fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{fix.question_for_owner}</Typography>
                {fix.owner_answer ? (
                  <Typography data-testid="fix-answer-text" sx={{ fontSize: 14, mt: 1, fontWeight: 700, whiteSpace: 'pre-wrap' }}>
                    {t('fxYourAnswer', lang)}: {fix.owner_answer}
                  </Typography>
                ) : (
                  <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'flex-end' }}>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      maxRows={4}
                      label={t('fxYourAnswer', lang)}
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      slotProps={{ htmlInput: { 'data-testid': 'fix-answer-input' } }}
                    />
                    <Button
                      variant="contained"
                      disabled={!answer.trim() || act.isPending}
                      onClick={() => run({ kind: 'answer', id: fix.id, answer: answer.trim() })}
                      data-testid="fix-answer-send"
                    >
                      {t('fxSendAnswer', lang)}
                    </Button>
                  </Stack>
                )}
              </Box>
            ) : null}
            {isOwner && fix.coder_notes ? (
              <Box sx={{ my: 1.5 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {t('fxCoderNotes', lang)}
                </Typography>
                <Typography data-testid="fix-coder-notes" sx={{ fontSize: 13.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {fix.coder_notes}
                </Typography>
              </Box>
            ) : null}

            {isOwner ? (
              <Box data-testid="fix-owner-controls" sx={{ my: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1 }}>
                  {t('fxOwnerControls', lang)}
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                  {fix.status === 'new' || fix.status === 'declined' || fix.status === 'done' || fix.status === 'hold' ? (
                    <Button variant="contained" onClick={() => run({ kind: 'accept', id: fix.id })} data-testid="fix-accept">
                      {t('fxAccept', lang)}
                    </Button>
                  ) : null}
                  {fix.status === 'accepted' ? (
                    <Button variant="contained" onClick={() => run({ kind: 'working', id: fix.id })} data-testid="fix-working">
                      {t('fxStartWorking', lang)}
                    </Button>
                  ) : null}
                  {inLine ? (
                    <Button variant="outlined" onClick={() => setFinishing(true)} data-testid="fix-done">
                      {t('fxMarkDone', lang)}
                    </Button>
                  ) : null}
                  {fix.status !== 'declined' ? (
                    <Button color="error" variant="outlined" onClick={() => setDeclining(true)} data-testid="fix-decline">
                      {t('fxDecline', lang)}
                    </Button>
                  ) : null}
                  <Button color="error" onClick={() => setDeleting(true)} data-testid="fix-delete">
                    {t('fxDelete', lang)}
                  </Button>
                </Stack>
                {deleting ? (
                  <Stack spacing={1} sx={{ mt: 1.5 }} data-testid="fix-delete-sure">
                    <Typography sx={{ fontSize: 14 }}>{t('fxDeleteSure', lang)}</Typography>
                    <Stack direction="row" spacing={1}>
                      <Button
                        color="error"
                        variant="contained"
                        disabled={act.isPending}
                        onClick={() => run({ kind: 'delete', id: fix.id }, onClose)}
                        data-testid="fix-delete-confirm"
                      >
                        {t('fxDelete', lang)}
                      </Button>
                      <Button onClick={() => setDeleting(false)}>{t('fxCancel', lang)}</Button>
                    </Stack>
                  </Stack>
                ) : null}
                {declining ? (
                  <Stack spacing={1} sx={{ mt: 1.5 }}>
                    <TextField
                      size="small"
                      label={t('fxDeclineWhy', lang)}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      slotProps={{ htmlInput: { 'data-testid': 'fix-decline-reason' } }}
                    />
                    <Stack direction="row" spacing={1}>
                      <Button
                        color="error"
                        variant="contained"
                        disabled={!reason.trim() || act.isPending}
                        onClick={() => run({ kind: 'decline', id: fix.id, reason: reason.trim() }, () => setDeclining(false))}
                        data-testid="fix-decline-confirm"
                      >
                        {t('fxDecline', lang)}
                      </Button>
                      <Button onClick={() => setDeclining(false)}>{t('fxCancel', lang)}</Button>
                    </Stack>
                  </Stack>
                ) : null}
                {finishing ? (
                  <Stack spacing={1} sx={{ mt: 1.5 }}>
                    <TextField
                      size="small"
                      label={t('fxVersion', lang)}
                      value={version}
                      onChange={(event) => setVersion(event.target.value)}
                      slotProps={{ htmlInput: { 'data-testid': 'fix-done-version' } }}
                    />
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant="contained"
                        disabled={act.isPending}
                        onClick={() => run({ kind: 'done', id: fix.id, version: version.trim() }, () => setFinishing(false))}
                        data-testid="fix-done-confirm"
                      >
                        {t('fxMarkDone', lang)}
                      </Button>
                      <Button onClick={() => setFinishing(false)}>{t('fxCancel', lang)}</Button>
                    </Stack>
                  </Stack>
                ) : null}
                <FormControlLabel
                  sx={{ mt: 1, display: 'flex' }}
                  control={
                    <Switch
                      checked={fix.private}
                      onChange={(event) => run({ kind: 'private', id: fix.id, value: event.target.checked })}
                      slotProps={{ input: { 'data-testid': 'fix-private' } as React.InputHTMLAttributes<HTMLInputElement> }}
                    />
                  }
                  label={t('fxMakePrivate', lang)}
                />
              </Box>
            ) : null}

            {error ? <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert> : null}

            <Divider sx={{ my: 1.5 }} />
            <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1 }}>
              {t('fxNotes', lang)}
            </Typography>
            {fix.notes.length === 0 ? (
              <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>{t('fxNoNotes', lang)}</Typography>
            ) : (
              <Stack spacing={1.25} data-testid="fix-notes">
                {fix.notes.map((entry) => (
                  <Box key={entry.id}>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                      {entry.author_name ?? (entry.session ? `${t('fxSession', lang)} ${entry.session}` : '')} · {formatShortDate(entry.created_at)}
                    </Typography>
                    <Typography sx={{ fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.body}</Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
          <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1, alignItems: 'flex-end' }}>
            <TextField
              size="small"
              fullWidth
              multiline
              maxRows={4}
              label={t('fxAddNote', lang)}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              slotProps={{ htmlInput: { 'data-testid': 'fix-note-input' } }}
            />
            <Button variant="contained" onClick={postNote} disabled={!note.trim() || addNote.isPending} data-testid="fix-note-post" sx={{ minHeight: 40 }}>
              {t('fxPostNote', lang)}
            </Button>
          </Box>
        </Box>
      ) : null}
    </Drawer>
  );
}
