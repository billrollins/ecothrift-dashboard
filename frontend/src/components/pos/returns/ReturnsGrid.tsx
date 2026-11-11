import { Box, Chip, Tooltip, Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { fetchReturnHistory, type ReturnHistoryRow } from '../../../api/thriftplusReturns.api';
import { canAccess } from '../../../auth/access';
import { useAuth } from '../../../contexts/AuthContext';
import { formatCurrency } from '../../../utils/format';
import { useObjectModal } from '../../objects/ObjectModal';

export interface ReturnsFilters {
  dateFrom: string;
  dateTo: string;
  q: string;
  cashier: string;
  late: boolean;
}

/**
 * Transactions → Returns (#72, Bill 2026-11-04: "Transactions (checkouts and returns)"): every Thrift+ return, newest
 * first, on the day it came back. A row opens the sale it came from (its Sale window lists the returns too). Late
 * returns carry a Late chip for everyone; the mark (reason, against whom, who allowed it) is for managers and the
 * owner, as the old Late returns list was. It replaced that list and the Return window's Late returns tab.
 */
export default function ReturnsGrid({ filters }: { filters: ReturnsFilters }) {
  const { openObject } = useObjectModal();
  const { user } = useAuth();
  const managers = canAccess(user, ['thriftplus:manage', 'cashier:manage']);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
  useEffect(() => setPaginationModel((pm) => ({ ...pm, page: 0 })), [filters]);

  const params = useMemo(() => {
    const p: Record<string, string | number> = { page: paginationModel.page + 1, page_size: paginationModel.pageSize };
    if (filters.dateFrom) p.date_from = filters.dateFrom;
    if (filters.dateTo) p.date_to = filters.dateTo;
    if (filters.q) p.q = filters.q;
    if (filters.cashier) p.cashier = filters.cashier;
    if (filters.late) p.late = 1;
    return p;
  }, [filters, paginationModel]);

  const { data, isLoading } = useQuery({
    queryKey: ['thriftplus', 'return-history', params],
    queryFn: () => fetchReturnHistory(params),
    placeholderData: keepPreviousData,
  });

  const columns: GridColDef<ReturnHistoryRow>[] = [
    {
      field: 'created_at',
      headerName: 'Returned',
      width: 150,
      valueFormatter: (value) => (value ? format(new Date(value as string), 'MM/dd/yyyy HH:mm') : ''),
    },
    { field: 'receipt_number', headerName: 'Receipt #', width: 150, sortable: false },
    {
      field: 'title',
      headerName: 'Item',
      flex: 1,
      minWidth: 200,
      sortable: false,
      renderCell: ({ row }) => (
        <Typography variant="body2" noWrap title={`${row.title} · ${row.sku}`} sx={{ lineHeight: 'inherit' }}>
          {row.title}
          {row.sku ? <Box component="span" sx={{ color: 'text.secondary' }}>{` · ${row.sku}`}</Box> : null}
        </Typography>
      ),
    },
    {
      // Why it came back, as the cashier recorded it (#90). Blank on returns taken before reasons were asked.
      field: 'reason',
      headerName: 'Why',
      description: 'Why it came back, as the cashier recorded it',
      width: 190,
      sortable: false,
      valueGetter: (_v, row) => [row.reason, row.reason_note].filter(Boolean).join(': '),
    },
    { field: 'member', headerName: 'Thrift+ member', width: 160, sortable: false },
    {
      field: 'credit',
      headerName: 'Credit',
      description: 'Thrift+ credit given back: 80% of what was paid',
      width: 100,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      valueFormatter: (value) => formatCurrency(value as string),
    },
    { field: 'returned_by', headerName: 'Taken by', width: 150, sortable: false },
    {
      field: 'late',
      headerName: 'Late',
      description: 'Past the 3 days: a mark against Retail',
      width: 90,
      sortable: false,
      // Everyone sees that it was late; managers also see why, and the rest of the mark on hover.
      renderCell: ({ row }) => {
        if (!row.late) return null;
        const chip = (
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label="Late"
            data-testid="late-chip"
            // A tap on the chip shows the mark; it does not open the sale under it.
            onClick={managers && row.mark ? (e) => e.stopPropagation() : undefined}
            tabIndex={managers && row.mark ? 0 : undefined}
          />
        );
        if (!managers || !row.mark) return chip;
        const m = row.mark;
        return (
          // A tap shows it too (the store tablet has no hover).
          <Tooltip
            enterTouchDelay={0}
            leaveTouchDelay={4000}
            title={
              <Box data-testid="late-mark">
                <Typography variant="body2" fontWeight={700}>
                  {m.reason_label}{m.days_late ? ` · ${m.days_late} ${m.days_late === 1 ? 'day' : 'days'} late` : ''}
                </Typography>
                <Typography variant="body2">Mark against {m.cashier || 'unknown'}</Typography>
                <Typography variant="body2">Allowed by {m.approved_by || 'unknown'}{m.by_pin ? '' : ' (owner signed in)'}</Typography>
                {m.note ? <Typography variant="body2">{m.note}</Typography> : null}
              </Box>
            }
          >
            {chip}
          </Tooltip>
        );
      },
    },
  ];

  return (
    <Box sx={{ flex: 1, minHeight: 320, display: 'flex', flexDirection: 'column' }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, minHeight: 20 }} data-testid="returns-grid-total">
        {data && data.count
          ? `${data.count} ${filters.late ? 'late ' : ''}${data.count === 1 ? 'return' : 'returns'} · ${formatCurrency(data.credit_total)} Thrift+ credit given back`
          : ''}
      </Typography>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <DataGrid
          rows={data?.results ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          paginationMode="server"
          rowCount={data?.count ?? 0}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[10, 25, 50, 100]}
          density="compact"
          // The sale it came from: the Sale window shows the sale and its returns.
          onRowClick={({ row }) => openObject({ type: 'sale', id: row.cart })}
          localeText={{ noRowsLabel: filters.late ? 'No late returns.' : 'No returns.' }}
          sx={{ border: 'none', '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>
    </Box>
  );
}
