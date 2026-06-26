import {
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Delete from '@mui/icons-material/Delete';
import LocalShipping from '@mui/icons-material/LocalShipping';
import { useState } from 'react';
import type {
  TarsPartLine,
  TarsPartStatus,
  TarsProcurementGroup,
  TarsRepairAction,
  TarsRepairOption,
} from './tarsWorkTypes';
import { newId } from './tarsWorkRollup';
import { fmtUsd } from './tarsProfit';
import { TarsPartsOrderDialog } from './TarsPartsOrderDialog';

const PART_STATUSES: TarsPartStatus[] = [
  'considering',
  'planned',
  'ordered',
  'received',
  'installed',
  'skipped',
];

interface TarsRepairActionPanelProps {
  action: TarsRepairAction;
  procurementGroups: TarsProcurementGroup[];
  onChange: (action: TarsRepairAction) => void;
  onProcurementGroupsChange: (groups: TarsProcurementGroup[]) => void;
  onRemove?: () => void;
  readOnly?: boolean;
}

export function TarsRepairActionPanel({
  action,
  procurementGroups,
  onChange,
  onProcurementGroupsChange,
  onRemove,
  readOnly = false,
}: TarsRepairActionPanelProps) {
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TarsProcurementGroup | null>(null);

  const selectedOption = action.options.find((o) => o.selected) ?? action.options[0];

  const updateOption = (optionId: string, patch: Partial<TarsRepairOption>) => {
    onChange({
      ...action,
      options: action.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)),
    });
  };

  const selectOption = (optionId: string) => {
    onChange({
      ...action,
      options: action.options.map((o) => ({ ...o, selected: o.id === optionId })),
    });
  };

  const addOption = () => {
    const label = String.fromCharCode(65 + action.options.length);
    onChange({
      ...action,
      options: [
        ...action.options.map((o) => ({ ...o, selected: false })),
        {
          id: newId(),
          name: `Option ${label}`,
          notes: '',
          timeEstimateHours: 0,
          timeActualHours: 0,
          parts: [],
          selected: true,
        },
      ],
    });
  };

  const addPart = (optionId: string) => {
    const part: TarsPartLine = {
      id: newId(),
      partNumber: '',
      description: '',
      url: '',
      qty: 1,
      unitPriceEstimate: 0,
      unitPriceActual: 0,
      status: 'considering',
      procurementGroupId: null,
    };
    updateOption(optionId, {
      parts: [...(action.options.find((o) => o.id === optionId)?.parts ?? []), part],
    });
  };

  const updatePart = (optionId: string, partId: string, patch: Partial<TarsPartLine>) => {
    const opt = action.options.find((o) => o.id === optionId);
    if (!opt) return;
    updateOption(optionId, {
      parts: opt.parts.map((p) => (p.id === partId ? { ...p, ...patch } : p)),
    });
  };

  const partsTotal = (option: TarsRepairOption, useActual: boolean) =>
    option.parts.reduce((sum, p) => {
      const unit = useActual && p.unitPriceActual > 0 ? p.unitPriceActual : p.unitPriceEstimate;
      return sum + unit * (p.qty || 1);
    }, 0);

  const groupExtra = (option: TarsRepairOption) => {
    const partIds = new Set(option.parts.map((p) => p.id));
    return procurementGroups
      .filter((g) => g.partIds.some((id) => partIds.has(id)))
      .reduce((sum, g) => sum + g.shipping + g.tax + g.fees, 0);
  };

  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" fontWeight={900}>
          Repair action
        </Typography>
        {!readOnly && onRemove ?
          <Button size="small" color="error" onClick={onRemove}>
            Remove
          </Button>
        : null}
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 0.75 }}>
        <TextField size="small" label="Complaint / issue" value={action.complaint} onChange={(e) => onChange({ ...action, complaint: e.target.value })} fullWidth disabled={readOnly} />
        <TextField size="small" label="Diagnosis" value={action.diagnosis} onChange={(e) => onChange({ ...action, diagnosis: e.target.value })} fullWidth disabled={readOnly} />
        <TextField size="small" label="Correction / what was done" value={action.correction} onChange={(e) => onChange({ ...action, correction: e.target.value })} fullWidth disabled={readOnly} />
        <TextField size="small" label="Result" value={action.result} onChange={(e) => onChange({ ...action, result: e.target.value })} fullWidth disabled={readOnly} />
      </Box>

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
        <Typography variant="caption" fontWeight={900} color="text.secondary">
          Eval card / repair options:
        </Typography>
        {action.options.map((opt) => (
          <Chip
            key={opt.id}
            label={opt.name}
            size="small"
            color={opt.selected ? 'primary' : 'default'}
            variant={opt.selected ? 'filled' : 'outlined'}
            onClick={readOnly ? undefined : () => selectOption(opt.id)}
            sx={{ cursor: readOnly ? 'default' : 'pointer' }}
          />
        ))}
        {!readOnly ?
          <Chip label="+ Option" size="small" icon={<Add />} onClick={addOption} sx={{ cursor: 'pointer' }} />
        : null}
      </Stack>

      {selectedOption ?
        <Box sx={{ p: 1, borderRadius: 1.25, border: '1px solid #cbd5e1', bgcolor: '#f8fafc' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1} flexWrap="wrap" useFlexGap spacing={1}>
            <TextField
              size="small"
              label="Option name"
              value={selectedOption.name}
              onChange={(e) => updateOption(selectedOption.id, { name: e.target.value })}
              sx={{ maxWidth: 280, minWidth: 0, flex: '1 1 160px' }}
              disabled={readOnly}
            />
            <Typography variant="caption" fontFamily="monospace" fontWeight={700} sx={{ flexShrink: 0 }}>
              Parts + orders {fmtUsd(partsTotal(selectedOption, false) + groupExtra(selectedOption))}
            </Typography>
          </Stack>

          {!readOnly ?
            <Stack direction="row" spacing={1} mb={0.75} alignItems="center" flexWrap="wrap">
              <Button
                size="small"
                variant="outlined"
                startIcon={<LocalShipping />}
                onClick={() => {
                  setEditingGroup(null);
                  setGroupDialogOpen(true);
                }}
                disabled={selectedOption.parts.length === 0}
              >
                Group selected parts into order
              </Button>
              <Typography variant="caption" color="text.secondary">
                Keep part prices clean; put shipping, tax, and fees on the order group.
              </Typography>
            </Stack>
          : null}

          {procurementGroups
            .filter((g) => g.partIds.some((id) => selectedOption.parts.some((p) => p.id === id)))
            .map((g) => (
              <Chip
                key={g.id}
                size="small"
                label={`${g.supplierName}: ship ${fmtUsd(g.shipping)} + tax ${fmtUsd(g.tax)}`}
                onClick={readOnly ? undefined : () => {
                  setEditingGroup(g);
                  setGroupDialogOpen(true);
                }}
                sx={{ mr: 0.5, mb: 0.5, cursor: readOnly ? 'default' : 'pointer' }}
              />
            ))}

          {!readOnly ?
            <Button size="small" startIcon={<Add />} onClick={() => addPart(selectedOption.id)} sx={{ mb: 0.75 }}>
              Add part to parts list
            </Button>
          : null}

          {selectedOption.parts.map((part) => (
            <Box key={part.id} sx={{ p: 0.75, mb: 0.65, borderRadius: 1, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="flex-start">
                  <TextField size="small" label="Part #" value={part.partNumber} onChange={(e) => updatePart(selectedOption.id, part.id, { partNumber: e.target.value })} sx={{ width: 100, flexShrink: 0 }} disabled={readOnly} />
                  <TextField size="small" label="Description" value={part.description} onChange={(e) => updatePart(selectedOption.id, part.id, { description: e.target.value })} sx={{ flex: '1 1 160px', minWidth: 0 }} disabled={readOnly} />
                  {!readOnly ?
                    <IconButton size="small" onClick={() => updateOption(selectedOption.id, { parts: selectedOption.parts.filter((p) => p.id !== part.id) })} sx={{ flexShrink: 0 }}>
                      <Delete fontSize="small" />
                    </IconButton>
                  : null}
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <TextField size="small" label="URL" value={part.url} onChange={(e) => updatePart(selectedOption.id, part.id, { url: e.target.value })} sx={{ flex: 1, minWidth: 160 }} disabled={readOnly} />
                  <TextField size="small" label="Qty" type="number" value={part.qty} onChange={(e) => updatePart(selectedOption.id, part.id, { qty: Number.parseInt(e.target.value, 10) || 1 })} sx={{ width: 72 }} disabled={readOnly} />
                  <TextField size="small" label="Est $" type="number" value={part.unitPriceEstimate || ''} onChange={(e) => updatePart(selectedOption.id, part.id, { unitPriceEstimate: Number.parseFloat(e.target.value) || 0 })} sx={{ width: 88 }} disabled={readOnly} />
                  <TextField size="small" label="Actual $" type="number" value={part.unitPriceActual || ''} onChange={(e) => updatePart(selectedOption.id, part.id, { unitPriceActual: Number.parseFloat(e.target.value) || 0 })} sx={{ width: 88 }} disabled={readOnly} />
                  <TextField select size="small" label="Status" value={part.status} onChange={(e) => updatePart(selectedOption.id, part.id, { status: e.target.value as TarsPartStatus })} sx={{ minWidth: 110 }} disabled={readOnly}>
                    {PART_STATUSES.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
              </Stack>
            </Box>
          ))}
        </Box>
      : null}

      <TarsPartsOrderDialog
        open={groupDialogOpen}
        parts={selectedOption?.parts ?? []}
        existing={editingGroup}
        orderIndex={
          editingGroup
            ? procurementGroups.findIndex((g) => g.id === editingGroup.id)
            : procurementGroups.length
        }
        onClose={() => {
          setGroupDialogOpen(false);
          setEditingGroup(null);
        }}
        onSave={({ order, partUpdates }) => {
          const others = procurementGroups.filter((g) => g.id !== order.id);
          onProcurementGroupsChange([...others, order]);
          if (selectedOption) {
            const updatesById = new Map(partUpdates.map((u) => [u.id, u]));
            updateOption(selectedOption.id, {
              parts: selectedOption.parts.map((p) => {
                const patch = updatesById.get(p.id);
                const merged = patch ? { ...p, ...patch } : p;
                if (order.partIds.includes(p.id)) {
                  return { ...merged, procurementGroupId: order.id };
                }
                if (p.procurementGroupId === order.id) {
                  return { ...merged, procurementGroupId: null };
                }
                return merged;
              }),
            });
          }
          setGroupDialogOpen(false);
          setEditingGroup(null);
        }}
        onDelete={
          editingGroup
            ? () => {
                onProcurementGroupsChange(procurementGroups.filter((g) => g.id !== editingGroup.id));
                if (selectedOption) {
                  updateOption(selectedOption.id, {
                    parts: selectedOption.parts.map((p) =>
                      p.procurementGroupId === editingGroup.id ? { ...p, procurementGroupId: null } : p,
                    ),
                  });
                }
                setGroupDialogOpen(false);
                setEditingGroup(null);
              }
            : undefined
        }
      />
    </Stack>
  );
}
