import {
  Box,
  Button,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import { useState, type ReactNode } from 'react';
import type { TarsAction, TarsActionType, TarsWorkSession } from './tarsWorkTypes';
import { TarsTestActionPanel } from './TarsTestActionPanel';
import { TarsAssembleActionPanel } from './TarsAssembleActionPanel';
import { TarsRepairActionPanel } from './TarsRepairActionPanel';
import { TarsSalvageActionPanel } from './TarsSalvageActionPanel';
import {
  createAssembleAction,
  createRepairAction,
  createSalvageAction,
  createTestAction,
} from './tarsWorkDefaults';

const TAB_TYPES: TarsActionType[] = ['test', 'assemble', 'repair', 'salvage'];

const TAB_LABELS: Record<TarsActionType, string> = {
  test: 'Test',
  assemble: 'Assemble',
  repair: 'Repair',
  salvage: 'Salvage',
};

interface TarsActionLogPanelProps {
  session: TarsWorkSession;
  selectedGrade: string | null;
  onSessionChange: (session: TarsWorkSession) => void;
  /** When set, replaces the add-action button (e.g. pending shelf resume). */
  onResume?: () => void;
  resumeBusy?: boolean;
  /** View-only: no add/resume tab actions, no remove buttons. */
  readOnly?: boolean;
}

export function TarsActionLogPanel({
  session,
  selectedGrade,
  onSessionChange,
  onResume,
  resumeBusy,
  readOnly = false,
}: TarsActionLogPanelProps) {
  const [tab, setTab] = useState<TarsActionType>('test');

  const actionsForTab = session.actions.filter((a) => a.type === tab);

  const updateAction = (id: string, next: TarsAction) => {
    onSessionChange({
      ...session,
      actions: session.actions.map((a) => (a.id === id ? next : a)),
    });
  };

  const removeAction = (id: string) => {
    onSessionChange({
      ...session,
      actions: session.actions.filter((a) => a.id !== id),
    });
  };

  const addAction = () => {
    const linkedGrade = selectedGrade ?? undefined;
    let action: TarsAction;
    switch (tab) {
      case 'test':
        action = createTestAction(linkedGrade);
        break;
      case 'assemble':
        action = createAssembleAction(linkedGrade);
        break;
      case 'repair':
        action = createRepairAction(linkedGrade);
        break;
      case 'salvage':
        action = createSalvageAction(linkedGrade);
        break;
    }
    onSessionChange({ ...session, actions: [...session.actions, action] });
  };

  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          mb: 1,
          flexShrink: 0,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v as TarsActionType)}
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 36,
            borderBottom: 'none',
            '& .MuiTab-root': { minHeight: 36, py: 0.5 },
          }}
        >
          {TAB_TYPES.map((type) => (
            <Tab
              key={type}
              value={type}
              label={`${TAB_LABELS[type]} (${session.actions.filter((a) => a.type === type).length})`}
            />
          ))}
        </Tabs>

        {!readOnly && (onResume ?
          <Button
            size="small"
            variant="contained"
            disabled={resumeBusy}
            onClick={onResume}
            sx={{ flexShrink: 0, mb: 0.35 }}
          >
            Resume
          </Button>
        : <Button
            size="small"
            variant="contained"
            startIcon={<Add />}
            onClick={addAction}
            sx={{ flexShrink: 0, mb: 0.35 }}
          >
            Add {TAB_LABELS[tab]} action
          </Button>)}
      </Box>

      <Stack spacing={1} sx={{ minWidth: 0 }}>
        {actionsForTab.length === 0 ?
          <Typography variant="body2" color="text.secondary" py={2}>
            No {TAB_LABELS[tab].toLowerCase()} actions yet.
          </Typography>
        : actionsForTab.map((action) => {
          const panelShell = (child: ReactNode) => (
            <Box
              sx={{
                p: 1,
                borderRadius: 1.25,
                border: '1px solid #cbd5e1',
                bgcolor: '#fafafa',
                minWidth: 0,
                overflowX: 'auto',
              }}
            >
              {child}
            </Box>
          );

          if (action.type === 'test') {
            return (
              <Box key={action.id}>
                {panelShell(
                  <TarsTestActionPanel
                    action={action}
                    readOnly={readOnly}
                    onChange={(a) => updateAction(action.id, a)}
                    onRemove={readOnly ? undefined : () => removeAction(action.id)}
                  />,
                )}
              </Box>
            );
          }
          if (action.type === 'assemble') {
            return (
              <Box key={action.id}>
                {panelShell(
                  <TarsAssembleActionPanel
                    action={action}
                    readOnly={readOnly}
                    onChange={(a) => updateAction(action.id, a)}
                    onRemove={readOnly ? undefined : () => removeAction(action.id)}
                  />,
                )}
              </Box>
            );
          }
          if (action.type === 'repair') {
            return (
              <Box key={action.id}>
                {panelShell(
                  <TarsRepairActionPanel
                    action={action}
                    readOnly={readOnly}
                    procurementGroups={session.procurementGroups}
                    onChange={(a) => updateAction(action.id, a)}
                    onProcurementGroupsChange={(groups) => onSessionChange({ ...session, procurementGroups: groups })}
                    onRemove={readOnly ? undefined : () => removeAction(action.id)}
                  />,
                )}
              </Box>
            );
          }
          return (
            <Box key={action.id}>
              {panelShell(
                <TarsSalvageActionPanel
                  action={action}
                  readOnly={readOnly}
                  onChange={(a) => updateAction(action.id, a)}
                  onRemove={readOnly ? undefined : () => removeAction(action.id)}
                />,
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
