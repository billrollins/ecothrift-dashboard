import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Button,
  TextField,
  Grid,
  InputAdornment,
  MenuItem,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import PersonAdd from '@mui/icons-material/PersonAdd';
import { DataGrid } from '@mui/x-data-grid';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useUsers } from '../../hooks/useEmployees';
import type { User } from '../../types';

export default function EmployeeListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  const { data, isLoading } = useUsers({
    role: 'Employee',
    search: search || undefined,
  });

  const allUsers = data?.results ?? [];
  const users = departmentFilter
    ? allUsers.filter((u) => u.employee?.department_name === departmentFilter)
    : allUsers;
  const departments = [...new Set(allUsers.map((u) => u.employee?.department_name).filter(Boolean))] as string[];

  const columns = [
    { field: 'full_name', headerName: 'Name', flex: 1, minWidth: 160 },
    {
      field: 'department_name',
      headerName: 'Department',
      width: 140,
      valueGetter: (_value: unknown, row: User) => row.employee?.department_name ?? '—',
    },
    {
      field: 'position',
      headerName: 'Position',
      width: 140,
      valueGetter: (_value: unknown, row: User) => row.employee?.position ?? '—',
    },
    {
      field: 'employment_type',
      headerName: 'Employment Type',
      width: 140,
      valueGetter: (_value: unknown, row: User) => row.employee?.employment_type ?? '—',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: ({ row }: { row: User }) => (
        <StatusBadge status={row.is_active ? 'active' : 'inactive'} />
      ),
    },
  ];

  if (isLoading) return <LoadingScreen message="Loading employees..." />;

  return (
    <Box>
      <PageHeader
        title="Employees"
        subtitle="Manage employee records"
        action={
          <Button
            variant="contained"
            startIcon={<PersonAdd />}
            onClick={() => navigate('/hr/employees/new')}
          >
            Add Employee
          </Button>
        }
      />

      <Grid container spacing={3}>
        <Grid size={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                <TextField
                  placeholder="Search employees..."
                  size="small"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search fontSize="small" />
                        </InputAdornment>
                      ),
                    },
                  }}
                  sx={{ minWidth: 240 }}
                />
                <TextField
                  select
                  label="Department"
                  size="small"
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value="">All</MenuItem>
                  {departments.map((d) => (
                    <MenuItem key={d} value={d}>
                      {d}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <Box sx={{ height: 500 }}>
                <DataGrid
                  rows={users}
                  columns={columns}
                  loading={isLoading}
                  pageSizeOptions={[10, 25, 50, 100]}
                  initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                  onRowClick={({ row }) => navigate(`/hr/employees/${row.id}`)}
                  getRowId={(row) => row.id}
                  sx={{
                    '& .MuiDataGrid-row': { cursor: 'pointer' },
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
