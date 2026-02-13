import {
  Box,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Alert,
  Chip,
} from '@mui/material';
import { PageHeader } from '../components/common/PageHeader';
import { LoadingScreen } from '../components/feedback/LoadingScreen';
import { useDashboardMetrics, useDashboardAlerts } from '../hooks/useDashboard';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface WeekComparison {
  week_start: string;
  week_end: string;
  revenue: string;
  goal: string;
}

interface DashboardMetrics {
  todays_revenue: string;
  todays_goal: string;
  weekly: { date: string; day: string; revenue: string; goal: string }[];
  four_weeks: WeekComparison[];
  items_sold_today: number;
  active_drawers: number;
  clocked_in_employees: number;
}

interface DashboardAlert {
  type: string;
  message: string;
  count: number;
}

function formatCurrency(value: string): string {
  const num = parseFloat(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

export default function DashboardPage() {
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useDashboardMetrics();
  const { data: alerts, isLoading: alertsLoading } = useDashboardAlerts();

  const m = metrics as DashboardMetrics | undefined;
  const alertList = (alerts ?? []) as DashboardAlert[];

  const chartData = m?.weekly?.map((d) => ({
    day: d.day.slice(0, 3),
    revenue: parseFloat(d.revenue) || 0,
  })) ?? [];

  const todayRevenue = parseFloat(m?.todays_revenue ?? '0') || 0;
  const todayGoal = parseFloat(m?.todays_goal ?? '0') || 0;
  const goalPercent = todayGoal > 0 ? Math.round((todayRevenue / todayGoal) * 100) : null;

  if (metricsLoading) return <LoadingScreen message="Loading dashboard..." />;
  if (metricsError) {
    return (
      <Box>
        <PageHeader title="Dashboard" />
        <Alert severity="error">Failed to load dashboard metrics.</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader title="Dashboard" subtitle="Overview of today's performance" />

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Today's Revenue
              </Typography>
              <Typography variant="h4" fontWeight={600}>
                {formatCurrency(m?.todays_revenue ?? '0')}
              </Typography>
              {todayGoal > 0 && (
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Goal: {formatCurrency(m?.todays_goal ?? '0')}
                  </Typography>
                  <Chip
                    label={`${goalPercent}%`}
                    size="small"
                    color={goalPercent && goalPercent >= 100 ? 'success' : 'default'}
                  />
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Items Sold Today
              </Typography>
              <Typography variant="h4" fontWeight={600}>
                {m?.items_sold_today ?? 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Active Drawers
              </Typography>
              <Typography variant="h4" fontWeight={600}>
                {m?.active_drawers ?? 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Clocked In
              </Typography>
              <Typography variant="h4" fontWeight={600}>
                {m?.clocked_in_employees ?? 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Weekly Revenue
              </Typography>
              <Box sx={{ width: '100%', height: 320, minWidth: 200, mt: 2, overflow: 'hidden' }}>
                <ResponsiveContainer width="99%" height={300}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v: number | undefined) => [formatCurrency(String(v ?? 0)), 'Revenue']} />
                    <Bar dataKey="revenue" fill="#2e7d32" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Alerts
              </Typography>
              {alertsLoading ? (
                <Typography variant="body2" color="text.secondary">
                  Loading...
                </Typography>
              ) : alertList.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No pending items
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2 }}>
                  {alertList.map((a, idx) => (
                    <Alert key={`${a.type}-${idx}`} severity="warning" sx={{ py: 0.5 }}>
                      {a.message}
                    </Alert>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 4-Week Comparison */}
        {(m?.four_weeks ?? []).length > 0 && (
          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  4-Week Comparison
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Week</TableCell>
                        <TableCell align="right">Revenue</TableCell>
                        <TableCell align="right">Goal</TableCell>
                        <TableCell align="right">% of Goal</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(m?.four_weeks ?? []).map((w, idx) => {
                        const rev = parseFloat(w.revenue) || 0;
                        const goal = parseFloat(w.goal) || 0;
                        const pct = goal > 0 ? Math.round((rev / goal) * 100) : null;
                        return (
                          <TableRow key={w.week_start}>
                            <TableCell>
                              {idx === 0 ? 'This Week' : `${idx} Week${idx > 1 ? 's' : ''} Ago`}
                              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                {w.week_start} — {w.week_end}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">{formatCurrency(w.revenue)}</TableCell>
                            <TableCell align="right">{formatCurrency(w.goal)}</TableCell>
                            <TableCell align="right">
                              {pct !== null ? (
                                <Chip
                                  label={`${pct}%`}
                                  size="small"
                                  color={pct >= 100 ? 'success' : pct >= 80 ? 'warning' : 'error'}
                                />
                              ) : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
