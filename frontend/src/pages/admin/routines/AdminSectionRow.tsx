import { Box, MenuItem, Select, TextField, Tooltip, Typography } from '@mui/material';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState } from 'react';
import type { RoutineAssignee, Section } from '../../../api/routines.api';
import { TaskRowIcon } from '../../../components/duty/TaskRow';
import { dutyColors } from '../../../components/duty/tokens';

const SELECT_SX = {
  height: 34,
  fontSize: 13,
  bgcolor: dutyColors.card,
  borderRadius: '9px',
  '& .MuiOutlinedInput-notchedOutline': { borderColor: dutyColors.ink15 },
};

/**
 * One area of the floor, edited where it sits. A section is two facts - its
 * name and its keeper - so opening a dialog to change either would cost more
 * than it is worth.
 */
export function AdminSectionRow({
  section,
  people,
  busy,
  onRename,
  onOwner,
  onRetire,
  onRestore,
}: {
  section: Section;
  people: RoutineAssignee[];
  busy: boolean;
  onRename: (name: string) => void;
  onOwner: (owner: number | null) => void;
  onRetire: () => void;
  onRestore: () => void;
}) {
  const sortable = useSortable({ id: section.id, disabled: !section.is_active });
  const [name, setName] = useState(section.name);

  useEffect(() => setName(section.name), [section.id, section.name]);

  function commitName() {
    const cleaned = name.trim();
    if (!cleaned) {
      setName(section.name);
      return;
    }
    if (cleaned !== section.name) onRename(cleaned);
  }

  const retired = !section.is_active;
  return (
    <Box
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        mx: 1.5,
        mb: 0.75,
        pl: 0.5,
        pr: 1,
        py: 0.9,
        opacity: retired ? 0.55 : 1,
        bgcolor: dutyColors.card,
        border: `1px solid ${section.owner == null && !retired ? dutyColors.amberBg : dutyColors.ink08}`,
        borderRadius: '12px',
        boxShadow: sortable.isDragging
          ? '0 8px 24px rgba(26,31,28,0.18)'
          : '0 1px 2px rgba(26,31,28,0.04)',
        zIndex: sortable.isDragging ? 1 : 'auto',
      }}
    >
      <Tooltip title={retired ? 'Retired sections keep their place' : 'Drag to reorder'}>
        <Box
          {...sortable.attributes}
          {...sortable.listeners}
          sx={{
            width: 28,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: retired ? 'default' : 'grab',
            color: dutyColors.ink15,
            '& svg': { fontSize: 18 },
            '&:hover': { color: retired ? dutyColors.ink15 : dutyColors.ink40 },
          }}
        >
          <DragIndicatorRounded />
        </Box>
      </Tooltip>

      <TextField
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setName(section.name);
        }}
        disabled={busy || retired}
        size="small"
        sx={{ flex: 1, minWidth: 0, '& .MuiInputBase-root': SELECT_SX }}
      />

      <Select
        value={section.owner == null ? '' : String(section.owner)}
        onChange={(e) => onOwner(e.target.value ? Number(e.target.value) : null)}
        displayEmpty
        disabled={busy || retired}
        size="small"
        sx={{ width: 210, flexShrink: 0, ...SELECT_SX }}
        renderValue={(value) => (
          value ? (
            people.find((p) => String(p.id) === value)?.full_name ?? section.owner_name ?? 'Someone'
          ) : (
            <Typography component="span" sx={{ fontSize: 13, color: dutyColors.ink40 }}>
              No owner
            </Typography>
          )
        )}
      >
        <MenuItem value="">No owner</MenuItem>
        {people.map((person) => (
          <MenuItem key={person.id} value={String(person.id)}>
            {person.full_name}
            {person.department_name ? ` · ${person.department_name}` : ''}
          </MenuItem>
        ))}
      </Select>

      <Box sx={{ display: 'flex', flexShrink: 0 }}>
        {retired ? (
          <TaskRowIcon
            label="Put this section back on the floor"
            disabled={busy}
            icon={<UnarchiveOutlined sx={{ fontSize: 17 }} />}
            onClick={onRestore}
          />
        ) : (
          <TaskRowIcon
            label="Retire - nobody is asked to check it again, history stays"
            danger
            disabled={busy}
            icon={<ArchiveOutlined sx={{ fontSize: 17 }} />}
            onClick={onRetire}
          />
        )}
      </Box>
    </Box>
  );
}
