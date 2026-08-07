import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, ButtonBase, Divider, List, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { NavItemRow } from '../../navigation/NavItemRow';
import { resolveNavIcon } from '../../navigation/navIcons';
import { resolveNavGroups } from '../../navigation/navResolve';
import {
  resolveWorkspaceForRoute,
  SLOT_C_DEFAULT_WORKSPACE_ID,
  SLOT_C_ESSENTIALS_GROUP_ID,
  SLOT_C_NAV_GROUPS,
  SLOT_C_WORKSPACES,
  SLOT_C_WORKSPACE_ID_MIGRATION,
  type SlotCWorkspaceMeta,
} from '../../navigation/slotCNavLayout';
import type { ResolvedNavGroup, ResolvedNavItem } from '../../navigation/navTypes';
import { useStaffNav } from '../../navigation/useStaffNav';
import { useNavBadgeCounts } from '../../hooks/useNavBadgeCounts';

export const SIDEBAR_WIDTH = 252;

const LS_NAV_C_WORKSPACE = 'ecothrift.navC.workspace.v1';
const INACTIVE_ICON = '#64748B';

function normalizeWorkspaceId(raw: string | null): string | null {
  if (!raw) return null;
  return SLOT_C_WORKSPACE_ID_MIGRATION[raw] ?? raw;
}

function loadWorkspace(): string | null {
  try {
    const raw = localStorage.getItem(LS_NAV_C_WORKSPACE);
    if (!raw) return null;
    const migrated = normalizeWorkspaceId(raw);
    if (migrated && migrated !== raw) {
      localStorage.setItem(LS_NAV_C_WORKSPACE, migrated);
    }
    return migrated;
  } catch {
    return null;
  }
}

function saveWorkspace(id: string) {
  try {
    localStorage.setItem(LS_NAV_C_WORKSPACE, id);
  } catch {
    /* ignore quota */
  }
}

function focusFirstPanelItem(panel: HTMLElement | null) {
  requestAnimationFrame(() => {
    const target = panel?.querySelector<HTMLElement>(
      '[role="button"], button, a, [tabindex]:not([tabindex="-1"])',
    );
    target?.focus();
  });
}

export function Sidebar() {
  const panelRef = useRef<HTMLDivElement>(null);
  const { user, pathname, search, hash, locationState, isActive, navigateToItem } = useStaffNav();

  const groups = useMemo(() => resolveNavGroups(user, SLOT_C_NAV_GROUPS), [user]);
  const essentials = useMemo(
    () => groups.find((g) => g.id === SLOT_C_ESSENTIALS_GROUP_ID) ?? null,
    [groups],
  );
  const workspaceGroups = useMemo(
    () => groups.filter((g) => g.id !== SLOT_C_ESSENTIALS_GROUP_ID),
    [groups],
  );
  const visibleWorkspaces = useMemo(
    () => SLOT_C_WORKSPACES.filter((meta) => workspaceGroups.some((g) => g.id === meta.id)),
    [workspaceGroups],
  );

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    () => loadWorkspace() ?? null,
  );

  useEffect(() => {
    if (!visibleWorkspaces.length) return;
    const selectedStillVisible = visibleWorkspaces.some((w) => w.id === selectedWorkspaceId);
    if (!selectedStillVisible) {
      const fallback =
        visibleWorkspaces.find((w) => w.id === SLOT_C_DEFAULT_WORKSPACE_ID)?.id ??
        visibleWorkspaces[0]!.id;
      setSelectedWorkspaceId(fallback);
      saveWorkspace(fallback);
    }
  }, [selectedWorkspaceId, visibleWorkspaces]);

  // External URL entry: resolve lowest lifecycle workspace. Sidebar clicks skip via navFromSidebar state.
  useEffect(() => {
    const navState = locationState as { navFromSidebar?: boolean } | null;
    if (navState?.navFromSidebar) return;

    const resolved = resolveWorkspaceForRoute(workspaceGroups, visibleWorkspaces, isActive);
    if (resolved) {
      setSelectedWorkspaceId(resolved);
      saveWorkspace(resolved);
    }
  }, [pathname, search, hash, locationState, workspaceGroups, visibleWorkspaces, isActive]);

  const selectedWorkspace =
    workspaceGroups.find((g) => g.id === selectedWorkspaceId) ?? workspaceGroups[0] ?? null;

  const selectWorkspace = useCallback((id: string, focusFirst = false) => {
    setSelectedWorkspaceId(id);
    saveWorkspace(id);
    if (focusFirst) focusFirstPanelItem(panelRef.current);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > visibleWorkspaces.length) return;
      e.preventDefault();
      selectWorkspace(visibleWorkspaces[n - 1]!.id, true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectWorkspace, visibleWorkspaces]);

  // Only ask for Online Sales counts when the user can actually open it.
  const badgeCounts = useNavBadgeCounts({
    onlineSales: workspaceGroups.some((g) => g.id === 'onlineSales'),
  });

  const renderRow = (item: ResolvedNavItem) => (
    <NavItemRow
      key={item.id}
      item={item}
      iconTint={INACTIVE_ICON}
      isActive={isActive(item)}
      badgeCount={badgeCounts[item.id]}
      onClick={() => navigateToItem(item, { fromSidebar: true })}
    />
  );

  return (
    <Box
      component="nav"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        overflowX: 'hidden',
        px: 0.5,
        pt: 1.25,
        pb: 1,
      }}
    >
      {essentials && (
        <List component="div" disablePadding sx={{ mb: 1 }}>
          {essentials.items.map(renderRow)}
        </List>
      )}

      <Divider sx={{ mx: 1.5, mb: 1, borderColor: '#E5E7EB' }} />

      <WorkspaceSelector
        workspaces={visibleWorkspaces}
        selectedId={selectedWorkspace?.id ?? null}
        onSelect={selectWorkspace}
      />

      <Divider sx={{ mx: 1.5, my: 1, borderColor: '#EEF2F6' }} />

      <Box ref={panelRef} sx={{ flexGrow: 1, minWidth: 0 }}>
        {selectedWorkspace && (
          <WorkspacePanel group={selectedWorkspace} renderRow={renderRow} />
        )}
      </Box>
    </Box>
  );
}

function WorkspaceSelector({
  workspaces,
  selectedId,
  onSelect,
}: {
  workspaces: SlotCWorkspaceMeta[];
  selectedId: string | null;
  onSelect: (id: string, focusFirst?: boolean) => void;
}) {
  const theme = useTheme();

  return (
    <Box sx={{ px: 0.5 }}>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          px: 1.25,
          pb: 0.75,
          color: '#64748B',
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
        }}
      >
        Workspace
      </Typography>
      <Box sx={{ display: 'grid', gap: 0.5 }}>
        {workspaces.map((workspace, idx) => {
          const selected = workspace.id === selectedId;
          const Icon = resolveNavIcon(workspace.icon);
          return (
            <ButtonBase
              key={workspace.id}
              onClick={() => onSelect(workspace.id)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                onSelect(workspace.id, true);
              }}
              sx={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr',
                alignItems: 'center',
                gap: 1,
                position: 'relative',
                width: '100%',
                minHeight: 44,
                px: 1.25,
                pr: 5.25,
                py: 0.75,
                borderRadius: '10px',
                textAlign: 'left',
                bgcolor: selected ? '#EEF7EE' : '#FFFFFF',
                border: '1px solid',
                borderColor: selected ? alpha(theme.palette.primary.main, 0.22) : 'transparent',
                '&:hover': {
                  bgcolor: selected ? '#EAF5EA' : '#F8FAFC',
                },
                '&:focus-visible': {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: 2,
                },
              }}
              aria-pressed={selected}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '8px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: selected ? '#FFFFFF' : '#F8FAFC',
                  color: selected ? 'primary.main' : '#64748B',
                }}
              >
                <Icon sx={{ fontSize: 18 }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="body2"
                  fontWeight={selected ? 700 : 600}
                  sx={{ color: '#0F172A', fontSize: '0.8125rem', lineHeight: 1.2 }}
                  noWrap
                >
                  {workspace.shortLabel}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: '#64748B', fontSize: '0.6875rem', lineHeight: 1.2 }}
                  noWrap
                >
                  {workspace.helper}
                </Typography>
              </Box>
              <Typography
                component="span"
                sx={{
                  position: 'absolute',
                  top: 5,
                  right: 10,
                  color: selected ? 'primary.main' : '#94A3B8',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                Alt {idx + 1}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}

function WorkspacePanel({
  group,
  renderRow,
}: {
  group: ResolvedNavGroup;
  renderRow: (item: ResolvedNavItem) => ReactNode;
}) {
  return (
    <Box>
      <Box sx={{ px: 1.75, pb: 0.75 }}>
        <Typography
          variant="caption"
          sx={{ color: '#64748B', fontSize: '0.6875rem', fontWeight: 700 }}
        >
          {group.label}
        </Typography>
      </Box>
      <List component="div" disablePadding>
        {group.items.map(renderRow)}
      </List>
    </Box>
  );
}
