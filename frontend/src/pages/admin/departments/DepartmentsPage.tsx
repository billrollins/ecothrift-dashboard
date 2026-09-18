import {
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import MoreVert from '@mui/icons-material/MoreVert';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deleteDepartment,
  getDepartments,
  reorderDepartments,
  updateDepartment,
  type Department,
} from '../../../api/hr.api';
import { useAuth } from '../../../hooks/useAuth';
import { QaIcon } from '../retailqa/QaIcons';
import { ccTokens } from '../../../theme';
import {
  DeactivateDepartmentDialog,
  DeleteDepartmentDialog,
  DepartmentFormDialog,
} from './DepartmentDialogs';
import { DEPARTMENT_SUBTITLE, deleteLockTooltip, errorDetail } from './departmentUi';

export default function DepartmentsPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSuper = Boolean(user?.is_superuser);
  const [showInactive, setShowInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Department | null>(null);
  const [deactivateRow, setDeactivateRow] = useState<Department | null>(null);
  const [deleteRow, setDeleteRow] = useState<Department | null>(null);
  const [menu, setMenu] = useState<{ row: Department; anchor: HTMLElement } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const departments = useQuery({
    queryKey: ['hr', 'departments', 'admin'],
    queryFn: async () => (await getDepartments({ includeInactive: true })).data,
  });

  const rows = useMemo(() => {
    const list = [...(departments.data ?? [])].sort((a, b) => (
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
    ));
    return showInactive ? list : list.filter((row) => row.is_active);
  }, [departments.data, showInactive]);

  const [order, setOrder] = useState<number[]>([]);
  useEffect(() => setOrder(rows.map((row) => row.id)), [rows]);
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as Department[];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['hr', 'departments'] });
    await queryClient.invalidateQueries({ queryKey: ['departments'] });
    await queryClient.invalidateQueries({ queryKey: ['hr', 'clockTiles'] });
    await queryClient.invalidateQueries({ queryKey: ['hr', 'roster-shifts'] });
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(Number(active.id));
    const newIndex = order.indexOf(Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    try {
      await reorderDepartments(next);
      await refresh();
    } catch (err) {
      enqueueSnackbar(errorDetail(err, 'Could not reorder departments'), { variant: 'error' });
    }
  }

  async function setActive(row: Department, isActive: boolean) {
    try {
      await updateDepartment(row.id, { is_active: isActive });
      await refresh();
    } catch (err) {
      enqueueSnackbar(errorDetail(err, 'Could not update that department'), { variant: 'error' });
    }
  }

  async function confirmDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      await deleteDepartment(deleteRow.id);
      setDeleteRow(null);
      await refresh();
    } catch (err) {
      enqueueSnackbar(errorDetail(err, 'Could not delete that department'), { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Box sx={{ p: 2.5, pb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 40 }}>
        <Typography sx={{ fontSize: 20, fontWeight: 750, flex: 1 }}>Departments</Typography>
        <FormControlLabel
          control={(
            <Switch
              size="small"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
              inputProps={{ 'aria-label': 'Show inactive' }}
            />
          )}
          label="Show inactive"
        />
        {isSuper ? (
          <Button variant="contained" data-testid="new-department" onClick={() => setCreateOpen(true)}>+ New department</Button>
        ) : null}
      </Box>
      <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mt: 0.5, mb: 2 }}>
        {DEPARTMENT_SUBTITLE}
      </Typography>

      <Box sx={{ maxWidth: 960, bgcolor: ccTokens.card, border: `1px solid ${ccTokens.line}`, borderRadius: ccTokens.r }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {isSuper ? <TableCell sx={{ width: 36 }} /> : null}
                <TableCell sx={{ width: 40 }} />
                <TableCell>Name</TableCell>
                <TableCell align="right">Home</TableCell>
                <TableCell align="right">Shifts</TableCell>
                <TableCell align="right">Sections</TableCell>
                <TableCell>Manager</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              <SortableContext items={ordered.map((row) => row.id)} strategy={verticalListSortingStrategy}>
                {ordered.map((row) => (
                  <DepartmentRow
                    key={row.id}
                    row={row}
                    canDrag={isSuper}
                    onOpen={() => navigate(`/admin/departments/${row.slug}`)}
                    onMenu={(anchor) => setMenu({ row, anchor })}
                  />
                ))}
              </SortableContext>
            </TableBody>
          </Table>
        </DndContext>
      </Box>

      <Menu
        open={menu != null}
        anchorEl={menu?.anchor}
        onClose={() => setMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            if (menu) navigate(`/admin/departments/${menu.row.slug}`);
            setMenu(null);
          }}
        >
          Open
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setEditRow(menu.row);
            setMenu(null);
          }}
        >
          Edit
        </MenuItem>
        {isSuper && menu?.row.is_active ? (
          <MenuItem
            onClick={() => {
              setDeactivateRow(menu.row);
              setMenu(null);
            }}
          >
            Deactivate
          </MenuItem>
        ) : null}
        {isSuper && menu && !menu.row.is_active ? (
          <MenuItem
            onClick={() => {
              void setActive(menu.row, true);
              setMenu(null);
            }}
          >
            Reactivate
          </MenuItem>
        ) : null}
        {isSuper ? (
          <Tooltip
            title={deleteLockTooltip(menu?.row.dependencies) || ''}
            placement="left"
            open={Boolean(deleteLockTooltip(menu?.row.dependencies))}
            slotProps={{ popper: { sx: { zIndex: 1600 } } }}
          >
            <Box component="span" sx={{ display: 'block' }} data-testid="dept-delete-wrap">
              <MenuItem
                data-testid="dept-delete"
                disabled={Boolean(deleteLockTooltip(menu?.row.dependencies))}
                onClick={() => {
                  if (!menu) return;
                  setDeleteRow(menu.row);
                  setMenu(null);
                }}
              >
                Delete
              </MenuItem>
            </Box>
          </Tooltip>
        ) : null}
      </Menu>

      <DepartmentFormDialog
        open={createOpen}
        mode="create"
        canEditHard={isSuper}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void refresh()}
      />
      <DepartmentFormDialog
        open={editRow != null}
        mode="edit"
        department={editRow}
        canEditHard={isSuper}
        onClose={() => setEditRow(null)}
        onSaved={() => void refresh()}
      />
      <DeactivateDepartmentDialog
        open={deactivateRow != null}
        department={deactivateRow}
        homeCount={deactivateRow?.home_count ?? 0}
        onClose={() => setDeactivateRow(null)}
        onConfirm={() => {
          if (deactivateRow) void setActive(deactivateRow, false);
          setDeactivateRow(null);
        }}
      />
      <DeleteDepartmentDialog
        open={deleteRow != null}
        department={deleteRow}
        loading={deleting}
        onClose={() => setDeleteRow(null)}
        onConfirm={() => void confirmDelete()}
      />
    </Box>
  );
}

function DepartmentRow({
  row,
  canDrag,
  onOpen,
  onMenu,
}: {
  row: Department;
  canDrag: boolean;
  onOpen: () => void;
  onMenu: (anchor: HTMLElement) => void;
}) {
  const sortable = useSortable({ id: row.id, disabled: !canDrag });
  return (
    <TableRow
      ref={sortable.setNodeRef}
      hover
      onClick={onOpen}
      sx={{
        cursor: 'pointer',
        opacity: row.is_active ? 1 : 0.55,
        bgcolor: row.is_active ? 'transparent' : ccTokens.neuTint,
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
    >
      {canDrag ? (
        <TableCell
          sx={{ width: 36, color: ccTokens.ink3, cursor: 'grab' }}
          onClick={(event) => event.stopPropagation()}
        >
          <Box
            ref={sortable.setActivatorNodeRef}
            {...sortable.listeners}
            {...sortable.attributes}
            sx={{ display: 'flex' }}
          >
            <DragIndicatorRounded fontSize="small" />
          </Box>
        </TableCell>
      ) : null}
      <TableCell sx={{ width: 40 }}>
        <Box sx={{ width: 20, height: 20, color: ccTokens.ink2, '& svg': { width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 2 } }}>
          <QaIcon name={row.icon || 'none'} />
        </Box>
      </TableCell>
      <TableCell>
        <Typography sx={{ fontWeight: 650 }}>{row.name}</Typography>
      </TableCell>
      <TableCell align="right">{row.home_count ?? 0}</TableCell>
      <TableCell align="right">{row.shift_count ?? 0}</TableCell>
      <TableCell align="right">{row.section_count ?? 0}</TableCell>
      <TableCell>{row.manager_name || '—'}</TableCell>
      <TableCell>
        <Chip
          size="small"
          label={row.is_active ? 'Active' : 'Inactive'}
          sx={{
            bgcolor: row.is_active ? ccTokens.goodTint : ccTokens.neuTint,
            color: row.is_active ? ccTokens.goodText : ccTokens.ink2,
          }}
        />
      </TableCell>
      <TableCell align="right" onClick={(event) => event.stopPropagation()}>
        <IconButton
          size="small"
          aria-label={`More for ${row.name}`}
          onClick={(event) => onMenu(event.currentTarget)}
        >
          <MoreVert fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
}
