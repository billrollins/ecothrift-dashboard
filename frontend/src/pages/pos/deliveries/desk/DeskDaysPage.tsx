import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import {
  Box,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useAuth } from '../../../../hooks/useAuth';
import { useDeliveryDays } from '../../../../hooks/useDelivery';
import {
  ecoField,
  ecoFieldBucketTone,
  ecoFieldPrimaryButtonSx,
  ecoFieldStatusChipSx,
} from '../../../../theme/deliveryTheme';
import {
  deskDaysStateToApiParams,
  deskDaysStateToParams,
  parseDeskDaysUrlState,
} from './daysUrlState';
import { DeskDayDialog } from './DeskDayDialog';

function formatWindow(start: string | null, end: string | null) {
  if (!start || !end) return '—';
  return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
}

export default function DeskDaysPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const state = useMemo(() => parseDeskDaysUrlState(searchParams), [searchParams]);
  const { data, isLoading, isError } = useDeliveryDays(deskDaysStateToApiParams(state));
  const rows = data?.results ?? [];
  const { hasRole } = useAuth();
  const canManage = hasRole('Manager') || hasRole('Admin');
  const [newDayOpen, setNewDayOpen] = useState(false);

  const patchState = (patch: Partial<typeof state>) => {
    setSearchParams(deskDaysStateToParams({ ...state, ...patch, page: patch.page ?? 1 }), {
      replace: true,
    });
  };
  const bucket = ecoFieldBucketTone(state.bucket === 'past' ? 'past' : 'days');

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }} alignItems="center">
        <ToggleButtonGroup
          exclusive
          size="small"
          value={state.bucket}
          onChange={(_, value) => value && patchState({ bucket: value, page: 1 })}
        >
          <ToggleButton value="past">Past</ToggleButton>
          <ToggleButton value="today">Today</ToggleButton>
          <ToggleButton value="future">Future</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          size="small"
          label="Search days / driver / customer"
          value={state.search}
          onChange={(e) => patchState({ search: e.target.value, page: 1 })}
          sx={{ minWidth: 280 }}
        />
        <Box sx={{ flex: 1 }} />
        {canManage && (
          <Button
            variant="contained"
            size="small"
            startIcon={<AddRounded />}
            onClick={() => setNewDayOpen(true)}
            sx={ecoFieldPrimaryButtonSx('desktop')}
          >
            New delivery day
          </Button>
        )}
      </Stack>

      {isLoading && <Typography color="text.secondary">Loading days…</Typography>}
      {isError && <Typography color="error">Failed to load days.</Typography>}

      <Table
        size="small"
        sx={{
          border: `1.5px solid ${ecoField.line}`,
          borderRadius: `${ecoField.radius}px`,
          overflow: 'hidden',
          '& th': {
            bgcolor: bucket.accentSoft,
            color: ecoField.ink,
            fontWeight: 800,
            borderBottom: `1px solid ${ecoField.line}`,
          },
          '& td': { borderBottom: `1px solid ${ecoField.line}` },
          '& tbody tr:hover': { bgcolor: bucket.rowHover },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell>Window</TableCell>
            <TableCell>Driver</TableCell>
            <TableCell>State</TableCell>
            <TableCell align="right">Deliveries</TableCell>
            <TableCell align="right">Items</TableCell>
            <TableCell>Flags</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((day) => (
            <TableRow
              key={day.id}
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => navigate(`/pos/deliveries/desk/days/${day.id}`)}
            >
              <TableCell>
                <Typography
                  component={RouterLink}
                  to={`/pos/deliveries/desk/days/${day.id}`}
                  onClick={(e) => e.stopPropagation()}
                  sx={{ fontWeight: 700, textDecoration: 'none', color: ecoField.ink }}
                >
                  {day.date}
                </Typography>
              </TableCell>
              <TableCell>{formatWindow(day.time_start, day.time_end)}</TableCell>
              <TableCell>{day.primary_driver_name || day.assigned_to || '—'}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={day.display_state}
                  sx={{
                    ...ecoFieldStatusChipSx(day.display_state === 'active' ? 'ok' : 'muted'),
                    fontWeight: 750,
                  }}
                />
              </TableCell>
              <TableCell align="right">{day.delivery_count}</TableCell>
              <TableCell align="right">{day.items_booked}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5}>
                  {day.run && (
                    <Chip
                      size="small"
                      label={day.run.status}
                      sx={{
                        ...ecoFieldStatusChipSx(
                          day.run.status === 'completed' ? 'ok' : 'muted',
                        ),
                        fontWeight: 750,
                      }}
                    />
                  )}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>
                <Typography color="text.secondary">No days match these filters.</Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <DeskDayDialog
        open={newDayOpen}
        onClose={() => setNewDayOpen(false)}
        onSaved={(dayId) => {
          if (dayId) navigate(`/pos/deliveries/desk/days/${dayId}`);
        }}
      />
    </Box>
  );
}
