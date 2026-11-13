import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
  useAddSignNote,
  useAddSignVersion,
  useApproveSign,
  useClearRanks,
  useDeleteSignNote,
  useDeleteSignVersion,
  useRankVersion,
  useVoteNeeded,
} from '../../hooks/useSignage';
import { IconAdd as AddIcon, IconClose as CloseIcon, IconDelete as DeleteIcon, IconEdit as EditIcon } from '../../icons/ecoIcons';
import type { Sign, SignVersion } from '../../types/signage.types';
import { AddVersionDialog, SignThumb, VersionViewer } from './SignParts';

/** Best first once you have voted (average rank; unranked last), else in the order they were added. */
export function orderedVersions(sign: Sign): SignVersion[] {
  const list = [...sign.versions];
  if (!sign.votes?.has_voted) return list.sort((a, b) => a.position - b.position || a.id - b.id);
  return list.sort((a, b) => {
    const x = a.avg_rank ?? Infinity;
    const y = b.avg_rank ?? Infinity;
    return x - y || (b.firsts ?? 0) - (a.firsts ?? 0) || a.position - b.position;
  });
}

export function errorText(err: unknown, fallback: string) {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  const first = data ? Object.values(data)[0] : null;
  return Array.isArray(first) ? String(first[0]) : typeof first === 'string' ? first : fallback;
}

/**
 * One draft sign (#122): vote whether it is needed, then rank its versions (pick the best, then the next best).
 * Your rank shows in each version's corner. Everyone's results show once you have voted.
 */
export default function DraftDialog({
  sign,
  canManage,
  meId,
  onClose,
  onEdit,
  onRemove,
}: {
  sign: Sign | null;
  canManage: boolean;
  meId: number | null;
  onClose: () => void;
  onEdit: (sign: Sign) => void;
  onRemove: (sign: Sign) => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const { enqueueSnackbar } = useSnackbar();
  const fail = (fallback: string) => (err: unknown) => enqueueSnackbar(errorText(err, fallback), { variant: 'error' });

  const vote = useVoteNeeded();
  const rank = useRankVersion();
  const clear = useClearRanks();
  const addNote = useAddSignNote();
  const deleteNote = useDeleteSignNote();
  const addVersion = useAddSignVersion();
  const deleteVersion = useDeleteSignVersion();
  const approve = useApproveSign();

  const [noteText, setNoteText] = useState('');
  const [viewing, setViewing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [approving, setApproving] = useState<number | ''>('');
  const [approveOpen, setApproveOpen] = useState(false);

  const versions = useMemo(() => (sign ? orderedVersions(sign) : []), [sign]);
  if (!sign) return null;

  const votes = sign.votes;
  const results = votes?.results ?? null;
  const ranked = sign.versions.filter((v) => v.my_rank != null).length;
  const nextRank = ranked + 1;
  const allRanked = ranked === sign.versions.length;
  const busy = rank.isPending || clear.isPending;

  const pick = (v: SignVersion) => rank.mutate({ id: sign.id, version: v.id }, { onError: fail('Could not save your pick.') });

  return (
    <Dialog open onClose={onClose} fullScreen={phone} fullWidth maxWidth="lg">
      <DialogTitle sx={{ pr: 6, pb: 1 }}>
        <Typography variant="h6" component="span" sx={{ fontWeight: 600 }}>{sign.name}</Typography>
        <Typography variant="body2" color="text.secondary">
          {[sign.kind === 'theme' ? 'Theme' : null, sign.location || 'No place given yet', `${sign.quantity} needed`].filter(Boolean).join(' · ')}
        </Typography>
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {sign.note && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{sign.note}</Typography>}

          {/* 1. Is it needed? */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <Typography variant="subtitle2" sx={{ minWidth: 190 }}>1. {sign.kind === 'theme' ? 'Should the signs use this theme?' : 'Does the store need this sign?'}</Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={votes?.my_needed == null ? null : votes.my_needed ? 'yes' : 'no'}
              onChange={(_, v: 'yes' | 'no' | null) => {
                if (v) vote.mutate({ id: sign.id, needed: v === 'yes' }, { onError: fail('Could not save your vote.') });
              }}
            >
              <ToggleButton value="yes" sx={{ px: 3 }}>Yes</ToggleButton>
              <ToggleButton value="no" sx={{ px: 3 }}>No</ToggleButton>
            </ToggleButtonGroup>
            {results && results.needed_pct != null && (
              <Typography variant="body2" color="text.secondary">
                {results.needed_pct}% say yes ({results.needed_yes} yes, {results.needed_no} no)
              </Typography>
            )}
          </Stack>

          {/* 2. Rank the versions */}
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">
                2. {sign.versions.length === 0 ? 'No versions yet' : allRanked ? 'Your ranking' : ranked === 0 ? 'Tap the best version' : 'Now the next best'}
              </Typography>
              {ranked > 0 && (
                <Button size="small" disabled={busy} onClick={() => clear.mutate(sign.id, { onError: fail('Could not start over.') })}>
                  Start over
                </Button>
              )}
              <Box sx={{ flex: 1 }} />
              {results && (
                <Typography variant="caption" color="text.secondary">
                  Best first, by everyone&apos;s average rank · {results.voters} {results.voters === 1 ? 'person' : 'people'} voted
                </Typography>
              )}
            </Stack>
            {!votes?.has_voted && sign.versions.length > 0 && (
              <Alert severity="info" sx={{ mb: 1 }} icon={false}>
                Say yes or no and pick the best to see how everyone voted.
              </Alert>
            )}
            <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1 }}>
              {versions.map((v, i) => {
                const isTop = results?.top_version_id === v.id;
                return (
                  <Box
                    key={v.id}
                    sx={{
                      position: 'relative',
                      flex: '0 0 auto',
                      width: { xs: 150, sm: 190 },
                      border: 2,
                      borderColor: isTop ? 'success.main' : 'divider',
                      borderRadius: 1.5,
                      p: 1,
                      bgcolor: 'background.paper',
                    }}
                  >
                    <SignThumb
                      signId={sign.id}
                      versionId={v.has_preview ? v.id : null}
                      size="100%"
                      height={phone ? 180 : 230}
                      alt={`${sign.name}: ${v.label}`}
                      onOpen={() => setViewing(i)}
                    />
                    {v.my_rank != null && (
                      <Box
                        aria-label={`Your rank ${v.my_rank}`}
                        sx={{
                          position: 'absolute',
                          top: 2,
                          right: 2,
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          bgcolor: v.my_rank === 1 ? 'success.main' : 'primary.main',
                          color: '#fff',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: 2,
                        }}
                      >
                        {v.my_rank}
                      </Box>
                    )}
                    <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.75, lineHeight: 1.25 }}>{v.label}</Typography>
                    {results && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {v.avg_rank != null ? `Avg rank ${v.avg_rank}` : 'Not ranked yet'}
                        {v.firsts ? ` · best for ${v.firsts}` : ''}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                      {v.my_rank == null && (
                        <Button size="small" variant={ranked === 0 ? 'contained' : 'outlined'} disabled={busy} onClick={() => pick(v)} sx={{ flex: 1 }}>
                          {ranked === 0 ? 'Best' : `#${nextRank}`}
                        </Button>
                      )}
                      {canManage && (
                        <Tooltip title="Remove this version">
                          <IconButton
                            size="small"
                            aria-label={`Remove version ${v.label}`}
                            onClick={() => {
                              if (window.confirm(`Remove version "${v.label}"? Its votes go with it.`)) {
                                deleteVersion.mutate({ id: sign.id, versionId: v.id }, { onError: fail('Could not remove the version.') });
                              }
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </Box>
                );
              })}
              {canManage && (
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => setAdding(true)}
                  sx={{ flex: '0 0 auto', width: { xs: 150, sm: 190 }, minHeight: 120, borderStyle: 'dashed' }}
                >
                  Add a version
                </Button>
              )}
            </Box>
          </Box>

          {/* Notes */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Notes</Typography>
            <Stack spacing={0.75}>
              {sign.notes.map((n) => (
                <Stack key={n.id} direction="row" spacing={1} alignItems="flex-start">
                  <Typography variant="body2" sx={{ flex: 1, whiteSpace: 'pre-wrap' }}>
                    <b>{n.author_name}:</b> {n.text}
                  </Typography>
                  {(canManage || n.author === meId) && (
                    <IconButton
                      size="small"
                      aria-label="Remove this note"
                      onClick={() => deleteNote.mutate({ id: sign.id, noteId: n.id }, { onError: fail('Could not remove the note.') })}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
              ))}
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  maxRows={4}
                  placeholder="I think it needs to be more..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  inputProps={{ 'aria-label': 'Add a note', maxLength: 2000 }}
                />
                <Button
                  variant="outlined"
                  disabled={!noteText.trim() || addNote.isPending}
                  onClick={() =>
                    addNote.mutate(
                      { id: sign.id, text: noteText.trim() },
                      { onSuccess: () => setNoteText(''), onError: fail('Could not save the note.') },
                    )
                  }
                >
                  Add
                </Button>
              </Stack>
            </Stack>
          </Box>

          {/* A manager's tools */}
          {canManage && (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
              {/* #128: 3 people's votes (yours included) first; a theme is the owner's. Fixed width: no shift as the text changes. */}
              <Button
                variant="contained"
                color="success"
                disabled={sign.versions.length === 0 || !!votes?.approve_block}
                onClick={() => {
                  setApproving(results?.top_version_id ?? versions[0]?.id ?? '');
                  setApproveOpen(true);
                }}
                sx={{ width: 230 }}
              >
                {votes?.approve_block ?? 'Approve into production'}
              </Button>
              <Button startIcon={<EditIcon />} onClick={() => onEdit(sign)}>Edit</Button>
              <Button color="error" startIcon={<DeleteIcon />} onClick={() => onRemove(sign)}>Remove draft</Button>
            </Stack>
          )}
          {canManage && approveOpen && !votes?.approve_block && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <TextField
                select
                size="small"
                label="Winning version"
                value={approving}
                onChange={(e) => setApproving(Number(e.target.value))}
                sx={{ minWidth: 260 }}
              >
                {versions.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.label}
                    {results?.top_version_id === v.id ? ' (top)' : ''}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                color="success"
                disabled={approving === '' || approve.isPending}
                onClick={() =>
                  approving !== '' &&
                  approve.mutate(
                    { id: sign.id, version: approving },
                    {
                      onSuccess: () => {
                        enqueueSnackbar(`${sign.name} is in production.`, { variant: 'success' });
                        setApproveOpen(false);
                        onClose();
                      },
                      onError: fail('Could not approve it.'),
                    },
                  )
                }
              >
                Approve
              </Button>
              <Button onClick={() => setApproveOpen(false)}>Cancel</Button>
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <VersionViewer sign={sign} versions={versions} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
      <AddVersionDialog
        open={adding}
        onClose={() => setAdding(false)}
        saving={addVersion.isPending}
        onSave={(v) =>
          addVersion.mutate(
            { id: sign.id, ...v },
            { onSuccess: () => enqueueSnackbar('Version added.', { variant: 'success' }), onError: fail('Could not add the version.') },
          )
        }
      />
    </Dialog>
  );
}
