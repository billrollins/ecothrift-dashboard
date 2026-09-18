import {
  Box,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import MoreVert from '@mui/icons-material/MoreVert';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useMemo, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  deleteDepartment,
  getDepartments,
  getDepartmentSummary,
  updateDepartment,
  type Department,
  type DepartmentSummary,
  type RosterAssignment,
  type RosterShift,
} from '../../../api/hr.api';
import { useAuth } from '../../../hooks/useAuth';
import { coverageNote, sectionCoverage } from '../routines/sectionCoverage';
import { ShiftCard } from '../retailqa/ShiftCard';
import { shortName } from '../retailqa/commandCenter';
import { QaIcon } from '../retailqa/QaIcons';
import { ccTokens } from '../../../theme';
import {
  DeactivateDepartmentDialog,
  DeleteDepartmentDialog,
  DepartmentFormDialog,
} from './DepartmentDialogs';
import { deleteLockTooltip, errorDetail } from './departmentUi';

export default function DepartmentDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSuper = Boolean(user?.is_superuser);
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const departments = useQuery({
    queryKey: ['hr', 'departments', 'admin'],
    queryFn: async () => (await getDepartments({ includeInactive: true })).data,
  });
  const department = (departments.data ?? []).find((row) => row.slug === slug) || null;
  const summary = useQuery({
    queryKey: ['hr', 'departments', 'summary', department?.id],
    queryFn: async () => (await getDepartmentSummary(department!.id)).data,
    enabled: department != null,
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['hr', 'departments'] });
    await queryClient.invalidateQueries({ queryKey: ['hr', 'clockTiles'] });
    await queryClient.invalidateQueries({ queryKey: ['hr', 'roster-shifts'] });
  }

  if (departments.isSuccess && slug && !department) {
    navigate('/admin/departments', { replace: true });
    return null;
  }

  const row = department;
  const data = summary.data;
  const lock = deleteLockTooltip(data?.dependencies || row?.dependencies);

  async function setActive(isActive: boolean) {
    if (!row) return;
    try {
      await updateDepartment(row.id, { is_active: isActive });
      await refresh();
    } catch (err) {
      enqueueSnackbar(errorDetail(err, 'Could not update that department'), { variant: 'error' });
    }
  }

  async function confirmDelete() {
    if (!row) return;
    setDeleting(true);
    try {
      await deleteDepartment(row.id);
      await refresh();
      navigate('/admin/departments');
    } catch (err) {
      enqueueSnackbar(errorDetail(err, 'Could not delete that department'), { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Box sx={{ p: 2.5, pb: 4 }}>
      <Typography
        component={RouterLink}
        to="/admin/departments"
        sx={{ fontSize: 13, color: ccTokens.ink2, textDecoration: 'none', display: 'inline-block', mb: 1.5 }}
      >
        ← Departments
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3 }}>
        <Box sx={{ width: 36, height: 36, color: ccTokens.ink2, '& svg': { width: 36, height: 36, fill: 'none', stroke: 'currentColor', strokeWidth: 1.75 } }}>
          <QaIcon name={row?.icon || 'none'} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 20, fontWeight: 750 }}>{row?.name || 'Department'}</Typography>
            <Typography sx={{ fontSize: 13, color: ccTokens.ink3 }}>{row?.slug}</Typography>
            <Chip
              size="small"
              label={row?.is_active ? 'Active' : 'Inactive'}
              sx={{
                bgcolor: row?.is_active ? ccTokens.goodTint : ccTokens.neuTint,
                color: row?.is_active ? ccTokens.goodText : ccTokens.ink2,
              }}
            />
          </Box>
          <Typography sx={{ fontSize: 14, color: ccTokens.ink2, mt: 0.5 }}>
            {row?.manager_name ? `Manager ${row.manager_name}` : 'No manager'}
            {row?.location_name ? ` · ${row.location_name}` : ''}
          </Typography>
          {row?.description ? (
            <Typography sx={{ fontSize: 14, mt: 1, maxWidth: 720 }}>{row.description}</Typography>
          ) : null}
        </Box>
        <Button variant="outlined" onClick={() => setEditOpen(true)}>Edit</Button>
        {isSuper ? (
          <IconButton aria-label="More" onClick={(event) => setMenuAnchor(event.currentTarget)}>
            <MoreVert />
          </IconButton>
        ) : null}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) minmax(0,1.2fr)' }, gap: 3 }}>
        <Box>
          <HubCard title="Home staff">
            {data?.home_staff.length ? data.home_staff.map((person) => (
              <Box key={person.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.6 }}>
                <Typography sx={{ flex: 1 }}>{shortName(person.full_name)}</Typography>
                <Typography sx={{ fontSize: 13, color: ccTokens.ink2 }}>{person.role || '—'}</Typography>
                <Chip
                  size="small"
                  label={person.is_active ? 'Active' : 'Inactive'}
                  sx={{
                    height: 22,
                    bgcolor: person.is_active ? ccTokens.goodTint : ccTokens.neuTint,
                    color: person.is_active ? ccTokens.goodText : ccTokens.ink2,
                  }}
                />
              </Box>
            )) : (
              <Empty>No home staff yet · Assign one on Users</Empty>
            )}
          </HubCard>
          <HubCard title="Also scheduled here">
            {data?.also_scheduled_here.length ? data.also_scheduled_here.map((person) => (
              <Typography key={`${person.id}-${person.shift_name}`} sx={{ py: 0.5 }}>
                {shortName(person.full_name)} · {person.shift_name}
              </Typography>
            )) : (
              <Empty>No one from another home department is scheduled here</Empty>
            )}
          </HubCard>
        </Box>
        <Box>
          <HubCard
            title="Shifts"
            action={<Button component={RouterLink} to="/admin/shifts" size="small">Open in Shifts</Button>}
          >
            {data?.shifts.length ? data.shifts.map((shift) => (
              <ReadOnlyShift key={shift.id} shift={shift} department={row} />
            )) : (
              <Empty>No shifts yet · Add one in Shifts</Empty>
            )}
          </HubCard>
          <HubCard title="Routines">
            {data?.routines.length ? data.routines.map((routine) => (
              <Typography key={routine.id} sx={{ py: 0.5 }}>
                {routine.title}
                <Box component="span" sx={{ color: ccTokens.ink2 }}> · {routine.audience_type}</Box>
              </Typography>
            )) : (
              <Empty>No routines yet · Add one in Routines</Empty>
            )}
          </HubCard>
          {data?.sections ? (
            <SectionsCard summary={data} />
          ) : null}
        </Box>
      </Box>

      <Menu
        open={menuAnchor != null}
        anchorEl={menuAnchor}
        onClose={() => setMenuAnchor(null)}
      >
        {row?.is_active ? (
          <MenuItem
            onClick={() => {
              setDeactivateOpen(true);
              setMenuAnchor(null);
            }}
          >
            Deactivate
          </MenuItem>
        ) : (
          <MenuItem
            onClick={() => {
              void setActive(true);
              setMenuAnchor(null);
            }}
          >
            Reactivate
          </MenuItem>
        )}
        <Tooltip title={lock || ''} placement="left" enterDelay={0} slotProps={{ popper: { sx: { zIndex: 1600 } } }}>
          <Box component="span" sx={{ display: 'block' }}>
            <MenuItem
              disabled={Boolean(lock)}
              onClick={() => {
                setDeleteOpen(true);
                setMenuAnchor(null);
              }}
            >
              Delete
            </MenuItem>
          </Box>
        </Tooltip>
      </Menu>

      <DepartmentFormDialog
        open={editOpen}
        mode="edit"
        department={row}
        canEditHard={isSuper}
        onClose={() => setEditOpen(false)}
        onSaved={() => void refresh()}
      />
      <DeactivateDepartmentDialog
        open={deactivateOpen}
        department={row}
        homeCount={data?.home_staff.length ?? row?.home_count ?? 0}
        onClose={() => setDeactivateOpen(false)}
        onConfirm={() => {
          void setActive(false);
          setDeactivateOpen(false);
        }}
      />
      <DeleteDepartmentDialog
        open={deleteOpen}
        department={row}
        loading={deleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
      />
    </Box>
  );
}

function HubCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        mb: 2,
        p: 2,
        bgcolor: ccTokens.card,
        border: `1px solid ${ccTokens.line}`,
        borderRadius: ccTokens.r,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: ccTokens.ink2, flex: 1 }}>
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <Typography sx={{ fontSize: 13, color: ccTokens.ink3 }}>{children}</Typography>;
}

function ReadOnlyShift({
  shift,
  department,
}: {
  shift: DepartmentSummary['shifts'][number];
  department: Department | null;
}) {
  const roster: RosterShift = {
    id: shift.id,
    name: shift.name,
    department: department?.id ?? 0,
    department_name: department?.name ?? '',
    department_slug: department?.slug ?? '',
    time_in: shift.time_in,
    time_out: shift.time_out,
    weekdays: shift.weekdays,
    punch_code: '',
    is_active: true,
    assigned_count: shift.assigned_count,
  };
  const assigned: RosterAssignment[] = shift.assignments.map((row) => ({
    id: row.id,
    employee: row.employee,
    employee_name: row.employee_name,
    shift: shift.id,
    shift_name: shift.name,
    department_name: department?.name ?? '',
    time_in: shift.time_in,
    time_out: shift.time_out,
    weekdays: row.weekdays,
  }));
  return <ShiftCard shift={roster} assigned={assigned} readOnly />;
}

function SectionsCard({ summary }: { summary: DepartmentSummary }) {
  const people = useMemo(
    () => (summary.home_staff || []).map((person) => ({
      id: person.id,
      full_name: person.full_name,
      email: '',
      role: person.role || 'Employee',
      department_id: summary.id,
      department_name: summary.name,
    })),
    [summary],
  );
  const sections = (summary.sections?.items || []).map((item) => ({
    id: item.id,
    name: item.name,
    department: summary.id,
    department_name: summary.name,
    owner: item.owner,
    owner_name: item.owner_name,
    is_active: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
  }));
  const coverage = sectionCoverage(sections, people, summary.id);
  return (
    <HubCard title="Sections">
      <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mb: 1 }}>
        {coverageNote(coverage, sections.length)}
      </Typography>
      {sections.map((section) => (
        <Typography key={section.id} sx={{ py: 0.4 }}>
          {section.name}
          <Box component="span" sx={{ color: ccTokens.ink2 }}>
            {' · '}
            {section.owner_name || 'No owner'}
          </Box>
        </Typography>
      ))}
    </HubCard>
  );
}
