import Edit from '@mui/icons-material/Edit';
import { Box, Button, Skeleton, Typography, useMediaQuery, useTheme } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { ColumnCard } from '../../components/duty/ColumnCard';
import { dutyHeroSx } from '../../components/duty/cards';
import { StatusTag } from '../../components/duty/StatusTag';
import { dutyColors } from '../../components/duty/tokens';
import { daysLeftInPeriod, PayReveal } from '../../components/hr/PayReveal';
import { RecentShiftsList } from '../../components/hr/RecentShiftsList';
import { eyebrowSx } from '../../components/hr/ShiftPicker';
import { TimeChangeDialog } from '../../components/hr/TimeChangeDialog';
import { WeekHoursBar } from '../../components/hr/WeekHoursBar';
import { FloorPage } from '../../components/layout/FloorPage';
import { useAuth } from '../../hooks/useAuth';
import { useMyPay, useWeeklyHoursStatus } from '../../hooks/useTimeClock';
import { useTimeEntries } from '../../hooks/useTimeEntries';
import { t } from '../../i18n/routines';
import type { MyPayPeriod, TimeEntry } from '../../types/hr.types';
import { formatHours } from './timeClockFormat';

export default function PayPage() {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));
  return isPhone ? <PayPhone /> : <PayDesk />;
}

function usePayModel(pageSize: number) {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const weekly = useWeeklyHoursStatus();
  const pay = useMyPay();
  const entries = useTimeEntries(
    user?.id ? { employee: user.id, page_size: pageSize, ordering: '-date,-clock_in' } : undefined,
    { enabled: Boolean(user?.id) },
  );
  const [showPay, setShowPay] = useState(false);
  const [changeEntry, setChangeEntry] = useState<TimeEntry | null>(null);
  const periods = pay.data ?? [];
  const current = periods.find((row) => row.is_current);
  const past = periods.filter((row) => !row.is_current).slice(0, 5);
  return {
    lang,
    weekly,
    pay,
    entries,
    showPay,
    togglePay: () => setShowPay((value) => !value),
    changeEntry,
    setChangeEntry,
    current,
    past,
  };
}

function CurrentPeriodCard({
  current,
  showPay,
  onToggle,
  lang,
}: {
  current?: MyPayPeriod;
  showPay: boolean;
  onToggle: () => void;
  lang: string;
}) {
  return (
    <Box
      sx={{
        minHeight: 132,
        bgcolor: dutyColors.card,
        border: `1px solid ${dutyColors.ink15}`,
        borderRadius: '12px',
        px: 2,
        pt: 2,
        pb: 2,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography sx={{ ...eyebrowSx, mb: 0.75 }}>{t('currentPeriod', lang)}</Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 700, color: dutyColors.ink }}>
        {current?.label || '-'}
      </Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: dutyColors.ink }}>
        {formatHours(current?.total_hours)} h
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1, mt: 'auto' }}>
        <Typography sx={{ fontSize: 13, color: dutyColors.ink40 }}>
          {current
            ? `${current.shift_count} ${t('shifts', lang)} · ${Math.max(daysLeftInPeriod(current.date_to), 0)} ${t('daysLeft', lang)}`
            : '-'}
        </Typography>
        <PayReveal show={showPay} amount={current?.total_pay} onToggle={onToggle} lang={lang} />
      </Box>
    </Box>
  );
}

function CurrentPeriodHero({
  current,
  showPay,
  onToggle,
  lang,
}: {
  current?: MyPayPeriod;
  showPay: boolean;
  onToggle: () => void;
  lang: string;
}) {
  return (
    <Box
      sx={{
        ...dutyHeroSx,
        minHeight: 132,
        px: 2,
        pt: 2,
        pb: 2,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
        <Typography sx={{ ...eyebrowSx }}>{t('currentPeriod', lang)}</Typography>
        <Button
          size="small"
          variant="outlined"
          onClick={onToggle}
          aria-label={t(showPay ? 'hidePay' : 'showPay', lang)}
          sx={{ height: 28, fontSize: 12, fontWeight: 700, borderColor: dutyColors.brand, color: dutyColors.brandDark }}
        >
          {t(showPay ? 'hidePay' : 'showPay', lang)}
        </Button>
      </Box>
      <Typography sx={{ fontSize: 14, fontWeight: 700, color: dutyColors.ink }}>
        {current?.label || '-'}
      </Typography>
      <Typography sx={{ fontSize: 36, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: dutyColors.ink, lineHeight: 1.1 }}>
        {formatHours(current?.total_hours)} h
      </Typography>
      <Typography sx={{ fontSize: 13, color: dutyColors.ink40, mt: 0.75, minHeight: 20 }}>
        {current
          ? `${current.shift_count} ${t('shifts', lang)} · ${Math.max(daysLeftInPeriod(current.date_to), 0)} ${t('daysLeft', lang)}`
          : '-'}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1, mt: 'auto' }}>
        <Typography sx={{ fontSize: 12.5, color: dutyColors.ink60 }}>
          {current
            ? `${formatHours(current.approved_hours)} ${t('approvedLower', lang)} · ${formatHours(current.pending_hours)} ${t('pendingLower', lang)}`
            : ' '}
        </Typography>
        <PayReveal show={showPay} amount={current?.total_pay} onToggle={onToggle} lang={lang} />
      </Box>
    </Box>
  );
}

function PastPeriodRows({
  past,
  loading,
  showPay,
  onToggle,
  lang,
}: {
  past: MyPayPeriod[];
  loading: boolean;
  showPay: boolean;
  onToggle: () => void;
  lang: string;
}) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minHeight: 184 }}>
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} variant="rounded" height={56} sx={{ borderRadius: '12px' }} />
        ))}
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minHeight: 184 }}>
      {past.map((period) => (
        <Box
          key={period.date_from}
          sx={{
            height: 56,
            px: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            border: `1px solid ${dutyColors.ink15}`,
            borderRadius: '12px',
            bgcolor: dutyColors.card,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 14, fontWeight: 700, color: dutyColors.ink }}>
              {period.label}
            </Typography>
            <Typography noWrap sx={{ fontSize: 12, color: dutyColors.ink40 }}>
              {formatHours(period.approved_hours)} {t('approvedLower', lang)} · {formatHours(period.pending_hours)} {t('pendingLower', lang)}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: dutyColors.ink }}>
              {formatHours(period.total_hours)} h
            </Typography>
            <PayReveal show={showPay} amount={period.total_pay} onToggle={onToggle} lang={lang} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function PayPhone() {
  const { lang, weekly, pay, entries, showPay, togglePay, changeEntry, setChangeEntry, current, past } = usePayModel(10);

  return (
    <Box sx={{ bgcolor: dutyColors.paper, minHeight: '100%' }}>
      <Box
        sx={{
          width: '100%',
          maxWidth: 560,
          mx: 'auto',
          px: 2,
          pt: 2,
          pb: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        <WeekHoursBar weekly={weekly.data} lang={lang} />
        <CurrentPeriodCard current={current} showPay={showPay} onToggle={togglePay} lang={lang} />
        <Box>
          <Typography sx={{ ...eyebrowSx, mb: 0.75 }}>{t('pastPeriods', lang)}</Typography>
          <PastPeriodRows
            past={past}
            loading={pay.isLoading && !pay.data}
            showPay={showPay}
            onToggle={togglePay}
            lang={lang}
          />
        </Box>
        <Box>
          <Typography sx={{ ...eyebrowSx, mb: 0.75 }}>{t('recentShifts', lang)}</Typography>
          <RecentShiftsList
            entries={entries.data?.results ?? []}
            loading={entries.isLoading}
            onPick={setChangeEntry}
            lang={lang}
          />
        </Box>
        <TimeChangeDialog entry={changeEntry} onClose={() => setChangeEntry(null)} />
      </Box>
    </Box>
  );
}

function statusTone(status: TimeEntry['status']): 'amber' | 'green' | 'red' {
  if (status === 'approved') return 'green';
  if (status === 'flagged') return 'red';
  return 'amber';
}

function PayDesk() {
  const { lang, weekly, pay, entries, showPay, togglePay, changeEntry, setChangeEntry, current, past } = usePayModel(20);
  const rows = entries.data?.results ?? [];

  const columns: GridColDef[] = [
    { field: 'date', headerName: 'Date', width: 120 },
    {
      field: 'shift_label',
      headerName: 'Shift',
      flex: 1,
      minWidth: 160,
      renderCell: ({ row }) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ ...eyebrowSx, lineHeight: 1.2 }}>
            {(row as TimeEntry).shift_department || ' '}
          </Typography>
          <Typography noWrap sx={{ fontSize: 13, fontWeight: 700, color: dutyColors.ink }}>
            {(row as TimeEntry).shift_label || '-'}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'clock_in',
      headerName: 'In',
      width: 100,
      valueFormatter: (v) => (v ? format(parseISO(String(v)), 'h:mm a') : '-'),
    },
    {
      field: 'clock_out',
      headerName: 'Out',
      width: 100,
      valueFormatter: (v) => (v ? format(parseISO(String(v)), 'h:mm a') : '-'),
    },
    {
      field: 'break_minutes',
      headerName: 'Break',
      width: 90,
      valueFormatter: (v) => `${v ?? 0}m`,
    },
    {
      field: 'total_hours',
      headerName: 'Hours',
      width: 90,
      cellClassName: 'tabular',
      valueFormatter: (v) => formatHours(v as string),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: ({ row }) => {
        const entry = row as TimeEntry;
        return (
          <StatusTag
            small
            label={t(entry.status, lang)}
            tone={statusTone(entry.status)}
          />
        );
      },
    },
    {
      field: 'actions',
      headerName: '',
      width: 170,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      renderCell: ({ row }) => (
        <Button size="small" startIcon={<Edit />} onClick={() => setChangeEntry(row as TimeEntry)}>
          {row.clock_out ? 'Request change' : 'Correct time'}
        </Button>
      ),
    },
  ];

  return (
    <FloorPage title={t('pay', lang)} subtitle={t('paySubtitle', lang)}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { md: 'minmax(300px, 360px) 1fr 1fr' },
          gap: 2,
          mb: 2,
          alignItems: 'stretch',
        }}
      >
        <WeekHoursBar weekly={weekly.data} lang={lang} />
        <CurrentPeriodHero current={current} showPay={showPay} onToggle={togglePay} lang={lang} />
        <ColumnCard
          title={t('pastPeriods', lang)}
          count={past.length}
          loading={pay.isLoading && !pay.data}
          empty="-"
          minHeight={184}
        >
          <PastPeriodRows
            past={past}
            loading={false}
            showPay={showPay}
            onToggle={togglePay}
            lang={lang}
          />
        </ColumnCard>
      </Box>

      <ColumnCard
        title={t('recentShifts', lang)}
        count={rows.length}
        loading={entries.isLoading}
        empty={t('noShiftsYet', lang)}
        minHeight={280}
      >
        <DataGrid
          autoHeight
          rows={rows}
          columns={columns}
          loading={entries.isLoading}
          disableRowSelectionOnClick
          disableColumnMenu
          pageSizeOptions={[10, 20]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          sx={{
            border: 0,
            bgcolor: 'transparent',
            '& .MuiDataGrid-columnHeaderTitle': {
              ...eyebrowSx,
              color: dutyColors.ink40,
            },
            '& .MuiDataGrid-cell': {
              borderColor: dutyColors.ink08,
            },
            '& .MuiDataGrid-columnSeparator': { display: 'none' },
            '& .MuiDataGrid-row:hover': { bgcolor: dutyColors.brandTint },
            '& .tabular': { fontVariantNumeric: 'tabular-nums' },
          }}
        />
      </ColumnCard>
      <TimeChangeDialog entry={changeEntry} onClose={() => setChangeEntry(null)} />
    </FloorPage>
  );
}
