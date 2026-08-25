import { useMemo } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { useReservations } from '../../../hooks/useWebStore';
import type { Reservation } from '../../../api/webstore.api';
import { isTodaysPickupRow } from '../pickupFilter';
import {
  expiresAtColumn,
  GRID_FILL_SX,
  PAGE_FILL_SX,
  GRID_PAGE_PROPS,
  GRID_SX,
  noRowsSlot,
  pickupCodeColumn,
  statusColumn,
  unreadColumn,
  unreadRowClass,
} from '../presentation';
import { useOnlineSalesMobile } from '../useOnlineSalesMobile';
import HoldMobileList from './HoldMobileList';

type Props = {
  onSelect: (id: number) => void;
};

export default function ReadyTodayPanel({ onSelect }: Props) {
  const isMobile = useOnlineSalesMobile();
  // Server-scoped to the two statuses this tab can show. Ordering by expires_at
  // ascending would otherwise put long-dead holds first and push real pickups
  // off page one.
  const { data, isLoading, isError } = useReservations({
    status__in: 'confirmed,ready_for_pickup',
    ordering: 'expires_at',
    page_size: 100,
  });

  const rows = useMemo(
    () => (data?.results || []).filter((r) => isTodaysPickupRow(r)),
    [data],
  );

  const columns: GridColDef<Reservation>[] = [
    unreadColumn,
    pickupCodeColumn,
    { field: 'customer_name', headerName: 'Customer', width: 150 },
    { field: 'phone', headerName: 'Phone', width: 140 },
    { field: 'listing_title', headerName: 'Item', flex: 1.4, minWidth: 180 },
    {
      field: 'item_sku',
      headerName: 'SKU',
      width: 110,
      valueGetter: (_v, row) => row.item_sku || '-',
    },
    statusColumn,
    expiresAtColumn,
  ];

  if (isLoading && !data) return <LoadingScreen />;
  if (isError) return <Alert severity="error">Could not load pickup holds.</Alert>;

  return (
    <Box sx={PAGE_FILL_SX}>
      {!isMobile && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Confirmed and Ready holds due today. Open a row to stage, extend, complete,
          or mark a no-show.
        </Typography>
      )}
      {isMobile ? (
        <HoldMobileList
          rows={rows}
          onSelect={onSelect}
          emptyTitle="Nothing due for pickup today"
          emptyHint="Holds appear here on the day they are due."
          emphasis="expires"
        />
      ) : (
        <Box sx={GRID_FILL_SX}>
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={(r) => r.id}
            disableRowSelectionOnClick
            onRowClick={(params) => onSelect(params.row.id)}
            getRowClassName={({ row }) => unreadRowClass(row)}
            slots={noRowsSlot(
              'Nothing due for pickup today',
              'Holds appear here on the day they are due.',
            )}
            sx={GRID_SX}
            {...GRID_PAGE_PROPS}
          />
        </Box>
      )}
    </Box>
  );
}
