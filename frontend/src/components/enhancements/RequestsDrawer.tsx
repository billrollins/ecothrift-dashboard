import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useState } from 'react';
import {
  useAddEnhancementRequestNote,
  useCreateEnhancementRequest,
  useEnhancementRequests,
  useUpdateEnhancementRequest,
} from '../../hooks/useEnhancementRequests';
import {
  requestsForFilter,
  type EnhancementAreaFilter,
} from '../../pages/admin/enhancementRequestsTable';
import type { EnhancementArea } from '../../types/enhancementRequests.types';
import { AreaBadge } from './AreaBadge';
import { AreaSelect } from './AreaSelect';
import { RequestsBoard } from './RequestsBoard';
import { COMPOSER_FIELD_HEIGHT, REQUESTS_DRAWER_HEIGHT } from './requestsBoardLayout';

const SECTION_LABEL = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0.5,
  color: 'text.secondary',
} as const;

function actionError(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail.trim() ? detail : fallback;
}

const GRABBER_PILL = {
  width: 44,
  height: 5,
  borderRadius: 3,
  bgcolor: 'grey.400',
} as const;

/**
 * True while the pointer is within `threshold` px of the bottom of the window.
 * Touch and coarse pointers have nothing to hover with, so they get a standing
 * yes rather than a grabber they can never summon.
 */
function usePointerNearBottom(threshold: number): boolean {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)');
    if (!fine?.matches) {
      setNear(true);
      return;
    }
    let frame = 0;
    let pending = false;
    const onMove = (event: PointerEvent) => {
      if (pending) return;
      pending = true;
      const fromBottom = window.innerHeight - event.clientY;
      frame = window.requestAnimationFrame(() => {
        pending = false;
        setNear(fromBottom <= threshold);
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return near;
}

/**
 * Closed-state grabber: the same pill that sits at the top of the open sheet,
 * parked on the bottom edge of the window. It fades rather than resizes, and it
 * is fixed rather than in the flow, so nothing on the page moves either way.
 */
export function RequestsDrawerTab({
  onOpen,
  revealWithin = 150,
}: {
  onOpen: () => void;
  revealWithin?: number;
}) {
  const showing = usePointerNearBottom(revealWithin);

  return (
    <Tooltip title="Requests" placement="top">
      <Box
        component="button"
        type="button"
        onClick={onOpen}
        aria-expanded={false}
        aria-label="Open requests"
        sx={{
          position: 'fixed',
          left: '50%',
          bottom: 0,
          zIndex: 1301,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 104,
          height: 22,
          p: 0,
          border: 0,
          bgcolor: 'transparent',
          cursor: 'pointer',
          opacity: showing ? 1 : 0,
          pointerEvents: showing ? 'auto' : 'none',
          transform: showing ? 'translate(-50%, 0)' : 'translate(-50%, 6px)',
          transition: (theme) =>
            theme.transitions.create(['opacity', 'transform'], {
              duration: theme.transitions.duration.shorter,
            }),
          '&:focus-visible': { opacity: 1, pointerEvents: 'auto' },
          '&:hover .requests-grabber, &:focus-visible .requests-grabber': {
            bgcolor: 'grey.600',
          },
        }}
      >
        <Box className="requests-grabber" sx={GRABBER_PILL} />
      </Box>
    </Tooltip>
  );
}

export function RequestsDrawer({
  open,
  onClose,
  defaultArea,
}: {
  open: boolean;
  onClose: () => void;
  defaultArea: EnhancementArea;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: rows = [], isLoading } = useEnhancementRequests(open);
  const create = useCreateEnhancementRequest();
  const update = useUpdateEnhancementRequest();
  const addNote = useAddEnhancementRequestNote();
  const [area, setArea] = useState<EnhancementArea>(defaultArea);
  const [body, setBody] = useState('');
  const [filter, setFilter] = useState<EnhancementAreaFilter>('all');
  const visible = useMemo(() => requestsForFilter(rows, filter, 'all'), [rows, filter]);
  const busy = update.isPending || addNote.isPending;
  const canSubmit = body.trim() !== '' && !create.isPending;

  function fileRequest() {
    create.mutate(
      { area, body: body.trim() },
      {
        onSuccess: () => {
          setBody('');
          enqueueSnackbar('Request filed', { variant: 'success' });
        },
        onError: (err) => enqueueSnackbar(actionError(err, 'Could not file that'), { variant: 'error' }),
      },
    );
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            height: REQUESTS_DRAWER_HEIGHT,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            pt: 0.75,
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={onClose}
        aria-expanded
        aria-label="Close requests"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'center',
          width: 104,
          height: 20,
          p: 0,
          border: 0,
          bgcolor: 'transparent',
          cursor: 'pointer',
          '&:hover .requests-grabber': { bgcolor: 'grey.600' },
        }}
      >
        <Box className="requests-grabber" sx={GRABBER_PILL} />
      </Box>

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 1.5, pb: 0.75 }}
      >
        <Typography sx={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.3 }}>
          Requests
        </Typography>
        <IconButton size="small" aria-label="Close requests panel" onClick={onClose}>
          <Close sx={{ fontSize: 18 }} />
        </IconButton>
      </Stack>

      <Box sx={{ px: 1.5, py: 1, bgcolor: 'grey.50' }}>
        <Box
          sx={{
            display: 'grid',
            gap: 0.75,
            gridTemplateColumns: { xs: '1fr', sm: '148px minmax(0, 1fr) 88px' },
            gridTemplateRows: { xs: 'auto', sm: `${COMPOSER_FIELD_HEIGHT}px` },
            alignItems: 'stretch',
          }}
        >
          <AreaSelect
            value={area}
            onChange={setArea}
            label=""
            height={COMPOSER_FIELD_HEIGHT}
          />
          <TextField
            fullWidth
            size="small"
            placeholder="What do you want changed?"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) {
                event.preventDefault();
                fileRequest();
              }
            }}
            slotProps={{ htmlInput: { 'aria-label': 'What do you want changed?' } }}
            sx={{
              bgcolor: 'background.paper',
              height: COMPOSER_FIELD_HEIGHT,
              '& .MuiInputBase-root': { height: COMPOSER_FIELD_HEIGHT },
            }}
          />
          <Button
            variant="contained"
            disabled={!canSubmit}
            onClick={fileRequest}
            sx={{ height: COMPOSER_FIELD_HEIGHT, minWidth: 88, fontWeight: 800 }}
          >
            File
          </Button>
        </Box>
      </Box>

      <Divider sx={{ borderBottomWidth: 2 }} />

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ px: 1.5, pt: 1, pb: 0.75 }}
      >
        <Typography sx={SECTION_LABEL}>
          ALL REQUESTS · {visible.length}
        </Typography>
        <TextField
          select
          size="small"
          label="Show"
          value={filter}
          onChange={(event) => setFilter(event.target.value as EnhancementAreaFilter)}
          sx={{ minWidth: 168 }}
        >
          <MenuItem value="all">All areas</MenuItem>
          <MenuItem value="restoration">
            <AreaBadge area="restoration" />
          </MenuItem>
          <MenuItem value="processing">
            <AreaBadge area="processing" />
          </MenuItem>
        </TextField>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', px: 1.5, pb: 1.5 }}>
        <RequestsBoard
          rows={visible}
          loading={isLoading}
          busy={busy}
          emptyText={filter === 'all' ? 'No requests yet.' : 'Nothing in this area.'}
          onSave={(id, payload) =>
            update.mutate(
              { id, payload },
              {
                onError: (err) =>
                  enqueueSnackbar(actionError(err, 'Could not save that'), { variant: 'error' }),
              },
            )
          }
          onNote={(id, note) =>
            addNote.mutate(
              { id, body: note },
              {
                onError: (err) =>
                  enqueueSnackbar(actionError(err, 'Could not add that note'), { variant: 'error' }),
              },
            )
          }
        />
      </Box>
    </Drawer>
  );
}

export function RequestsDrawerHost({ defaultArea }: { defaultArea: EnhancementArea }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open ? null : <RequestsDrawerTab onOpen={() => setOpen(true)} />}
      <RequestsDrawer open={open} onClose={() => setOpen(false)} defaultArea={defaultArea} />
    </>
  );
}
