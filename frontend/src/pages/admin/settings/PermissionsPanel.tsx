import { Box, Card, CardContent, Typography } from '@mui/material';
import Check from '@mui/icons-material/Check';
import { useQuery } from '@tanstack/react-query';
import { getCapabilityCatalog, type CapabilityRow } from '../../../api/accounts.api';

const MATRIX_COLS = ['Employee', 'Manager', 'Admin', 'Super Admin'] as const;
const PORTAL_ROLES = ['Consignee', 'Customer'] as const;

function groupByArea(rows: CapabilityRow[]): { area: string; rows: CapabilityRow[] }[] {
  const order: string[] = [];
  const map = new Map<string, CapabilityRow[]>();
  for (const row of rows) {
    if (!map.has(row.area)) {
      map.set(row.area, []);
      order.push(row.area);
    }
    map.get(row.area)!.push(row);
  }
  return order.map((area) => ({ area, rows: map.get(area)! }));
}

function holds(row: CapabilityRow, col: string): boolean {
  return row.holders.includes(col);
}

export function PermissionsPanel() {
  const catalog = useQuery({
    queryKey: ['capabilityCatalog'],
    queryFn: async () => (await getCapabilityCatalog()).data.results,
  });

  const rows = catalog.data ?? [];
  const staffRows = rows.filter((r) => !PORTAL_ROLES.some((p) => r.holders.length === 1 && r.holders[0] === p));
  const portalRows = rows.filter((r) => PORTAL_ROLES.some((p) => r.holders.includes(p)));
  const groups = groupByArea(staffRows);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        What each role can do today. Super Admin is the Django superuser flag, not a group.
        Extra per-person grants are not wired yet.
      </Typography>
      <Card>
        <CardContent sx={{ overflowX: 'auto' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 2fr) repeat(4, minmax(88px, 1fr))',
              columnGap: 1,
              rowGap: 0,
              minWidth: 640,
              minHeight: 320,
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ py: 1 }}>
              Capability
            </Typography>
            {MATRIX_COLS.map((col) => (
              <Typography
                key={col}
                variant="caption"
                color="text.secondary"
                sx={{ py: 1, textAlign: 'center' }}
              >
                {col}
              </Typography>
            ))}
            {groups.length === 0
              ? Array.from({ length: 8 }).map((_, i) => (
                  <Box key={i} sx={{ gridColumn: '1 / -1', height: 36, borderBottom: '1px solid', borderColor: 'divider' }} />
                ))
              : groups.map((group) => (
                  <Box key={group.area} sx={{ display: 'contents' }}>
                    <Typography
                      variant="subtitle2"
                      sx={{ gridColumn: '1 / -1', pt: 2, pb: 0.5 }}
                    >
                      {group.area}
                    </Typography>
                    {group.rows.map((row) => (
                      <Box key={row.id} sx={{ display: 'contents' }}>
                        <Box sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                          <Typography variant="body2">{row.label}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.id}
                          </Typography>
                        </Box>
                        {MATRIX_COLS.map((col) => (
                          <Box
                            key={col}
                            sx={{
                              py: 1,
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                              display: 'grid',
                              placeItems: 'center',
                              color: holds(row, col) ? 'success.main' : 'text.disabled',
                            }}
                          >
                            {holds(row, col) ? <Check fontSize="small" /> : '—'}
                          </Box>
                        ))}
                      </Box>
                    ))}
                  </Box>
                ))}
          </Box>
        </CardContent>
      </Card>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, minHeight: 120 }}>
        {PORTAL_ROLES.map((role) => {
          const cap = portalRows.find((r) => r.holders.includes(role));
          return (
            <Card key={role}>
              <CardContent>
                <Typography variant="h6">{role}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, minHeight: 40 }}>
                  {cap?.label ?? '—'}
                </Typography>
              </CardContent>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
}
