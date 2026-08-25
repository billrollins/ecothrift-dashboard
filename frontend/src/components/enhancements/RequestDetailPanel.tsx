import {
  Box,
  Button,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState, type ReactNode } from 'react';
import {
  DETAIL_MIN_HEIGHT,
  NOTE_COMPOSER_HEIGHT,
  priorityTone,
  statusTone,
} from './requestsBoardLayout';
import { AreaBadge } from './AreaBadge';
import { AreaSelect } from './AreaSelect';
import {
  ENHANCEMENT_PRIORITIES,
  ENHANCEMENT_STATUSES,
  formatRequestWhen,
  priorityWord,
  statusWord,
  targetDateLabel,
} from '../../pages/admin/enhancementRequestsTable';
import type {
  EnhancementArea,
  EnhancementPriority,
  EnhancementRequestDTO,
  EnhancementRequestTriagePayload,
  EnhancementRequestWritePayload,
  EnhancementStatus,
} from '../../types/enhancementRequests.types';

const PANE = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  bgcolor: 'background.paper',
  minHeight: DETAIL_MIN_HEIGHT,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
} as const;

const META_LABEL = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 0.5,
  color: 'text.secondary',
  lineHeight: 1,
  flexShrink: 0,
} as const;

/** Placeholder that fills the same box as a real request, so nothing moves. */
export function RequestDetailEmpty({ hint }: { hint: string }) {
  return (
    <Box sx={{ ...PANE, alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Typography sx={{ color: 'text.disabled', fontSize: 13, textAlign: 'center' }}>
        {hint}
      </Typography>
    </Box>
  );
}

function MetaCell({
  label,
  children,
  shrink = false,
}: {
  label: string;
  children: ReactNode;
  shrink?: boolean;
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.5}
      sx={{ minWidth: 0, flex: shrink ? '1 1 0' : '0 0 auto' }}
    >
      <Typography sx={META_LABEL}>{label}</Typography>
      {children}
    </Stack>
  );
}

export function RequestDetailPanel({
  request,
  triage = false,
  busy = false,
  onSave,
  onNote,
  onTriage,
}: {
  request: EnhancementRequestDTO;
  triage?: boolean;
  busy?: boolean;
  onSave?: (payload: EnhancementRequestWritePayload) => void;
  onNote?: (body: string) => void;
  onTriage?: (payload: EnhancementRequestTriagePayload) => void;
}) {
  const [body, setBody] = useState(request.body);
  const [area, setArea] = useState<EnhancementArea>(request.area);
  const [note, setNote] = useState('');

  const dirty = body.trim() !== request.body || area !== request.area;
  const canSave = request.can_edit && dirty && body.trim() !== '' && !busy;
  const canSendNote = request.can_note && note.trim() !== '' && !busy;

  function sendNote() {
    onNote?.(note.trim());
    setNote('');
  }

  return (
    <Box sx={PANE}>
      <Box
        sx={{
          mx: 1.25,
          mt: 1.25,
          px: 1.25,
          py: 0.75,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'grey.50',
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{ minWidth: 0, flexWrap: 'nowrap' }}
        >
          <MetaCell label="AREA">
            {request.can_edit ? (
              <AreaSelect
                value={area}
                onChange={setArea}
                disabled={busy}
                label=""
                height={32}
                minWidth={118}
              />
            ) : (
              <AreaBadge area={request.area} size="compact" />
            )}
          </MetaCell>
          <MetaCell label="FROM" shrink>
            <Typography noWrap sx={{ fontSize: 12, fontWeight: 700, minWidth: 0 }}>
              {request.submitted_by_name?.trim() || 'Unknown'}
              <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary', ml: 0.5 }}>
                {formatRequestWhen(request.created_at)}
              </Box>
            </Typography>
          </MetaCell>
          <MetaCell label="STATUS">
            {triage ? (
              <TextField
                select
                size="small"
                value={request.status}
                disabled={busy}
                inputProps={{ 'aria-label': 'Status' }}
                onChange={(event) => onTriage?.({ status: event.target.value as EnhancementStatus })}
                sx={{ minWidth: 100 }}
              >
                {ENHANCEMENT_STATUSES.map((value) => (
                  <MenuItem key={value} value={value}>
                    {statusWord(value)}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <Typography noWrap sx={{ fontSize: 12, fontWeight: 800, color: statusTone(request.status) }}>
                {statusWord(request.status)}
              </Typography>
            )}
          </MetaCell>
          <MetaCell label="PRIORITY">
            {triage ? (
              <TextField
                select
                size="small"
                value={request.priority}
                disabled={busy}
                inputProps={{ 'aria-label': 'Priority' }}
                onChange={(event) =>
                  onTriage?.({ priority: event.target.value as EnhancementPriority })
                }
                sx={{ minWidth: 96 }}
              >
                {ENHANCEMENT_PRIORITIES.map((value) => (
                  <MenuItem key={value} value={value}>
                    {value === 'unset' ? 'Unset' : priorityWord(value)}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <Typography noWrap sx={{ fontSize: 12, fontWeight: 800, color: priorityTone(request.priority) }}>
                {priorityWord(request.priority)}
              </Typography>
            )}
          </MetaCell>
          <MetaCell label="TARGET">
            {triage ? (
              <TextField
                size="small"
                type="date"
                value={request.target_date ?? ''}
                disabled={busy}
                inputProps={{ 'aria-label': 'Target date' }}
                onChange={(event) => onTriage?.({ target_date: event.target.value || null })}
                sx={{ minWidth: 140 }}
              />
            ) : (
              <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
                {targetDateLabel(request)}
              </Typography>
            )}
          </MetaCell>
        </Stack>
      </Box>

      <Box sx={{ px: 1.25, pt: 1.25 }}>
        {request.can_edit ? (
          <Box sx={{ position: 'relative' }}>
            <TextField
              fullWidth
              size="small"
              value={body}
              disabled={busy}
              onChange={(event) => setBody(event.target.value)}
              multiline
              rows={3}
              slotProps={{ htmlInput: { 'aria-label': 'Request' } }}
              sx={{
                '& .MuiInputBase-root': { fontSize: 12, pr: 9, alignItems: 'flex-start' },
                '& .MuiInputBase-input': { fontSize: 12 },
              }}
            />
            <Button
              variant="contained"
              disabled={!canSave}
              onClick={() => onSave?.({ area, body: body.trim() })}
              sx={{
                position: 'absolute',
                right: 8,
                bottom: 8,
                minWidth: 56,
                height: 24,
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              Save
            </Button>
          </Box>
        ) : (
          <Box
            sx={{
              minHeight: 72,
              px: 1.25,
              py: 1,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            <Typography sx={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{request.body}</Typography>
          </Box>
        )}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', px: 1.25, pt: 1.25 }}>
        <Typography
          sx={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: 0.5,
            color: 'text.secondary',
            mb: 0.5,
          }}
        >
          NOTES
        </Typography>
        <Box sx={{ flex: 1, minHeight: 44, overflow: 'auto' }}>
          {request.notes.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>No notes yet.</Typography>
          ) : (
            <Stack spacing={0.75}>
              {request.notes.map((entry) => (
                <Box key={entry.id}>
                  <Typography sx={{ fontSize: 10, fontWeight: 800, color: 'text.secondary' }}>
                    {entry.author_name || 'Unknown'} · {formatRequestWhen(entry.created_at)}
                  </Typography>
                  <Typography sx={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{entry.body}</Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Box>

      <Divider />
      <Stack
        direction="row"
        spacing={0.75}
        alignItems="center"
        sx={{ px: 1.25, py: 1, minHeight: NOTE_COMPOSER_HEIGHT + 16 }}
      >
        <TextField
          fullWidth
          size="small"
          label={request.can_note ? 'Add a note' : 'Notes are the owner’s to add'}
          value={note}
          disabled={!request.can_note || busy}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && canSendNote) {
              event.preventDefault();
              sendNote();
            }
          }}
        />
        <Button
          variant="contained"
          disabled={!canSendNote}
          onClick={sendNote}
          sx={{ minHeight: 30, minWidth: 76, fontWeight: 800 }}
        >
          Add
        </Button>
      </Stack>
    </Box>
  );
}
