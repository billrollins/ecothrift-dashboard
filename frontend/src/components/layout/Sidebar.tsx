import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, List } from '@mui/material';
import { NavItemRow } from '../../navigation/NavItemRow';
import { WorkspaceSwitcher } from '../../navigation/WorkspaceSwitcher';
import { resolveNavGroups } from '../../navigation/navResolve';
import {
  resolveWorkspaceForRoute,
  rollupWorkspaceBadgeCounts,
  SLOT_C_DEFAULT_WORKSPACE_ID,
  SLOT_C_ESSENTIALS_GROUP_ID,
  SLOT_C_NAV_GROUPS,
  SLOT_C_WORKSPACES,
  SLOT_C_WORKSPACE_ID_MIGRATION,
  glowColorForNavItem,
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

  // Only ask for Online Sales counts when the user can actually open it.
  const badgeCounts = useNavBadgeCounts({
    onlineSales: workspaceGroups.some((g) => g.id === 'onlineSales'),
    retailInbox: workspaceGroups.some((g) => g.id === 'admin'),
  });
  const workspaceBadgeCounts = useMemo(
    () => rollupWorkspaceBadgeCounts(workspaceGroups, badgeCounts),
    [workspaceGroups, badgeCounts],
  );

  const renderRow = (item: ResolvedNavItem) => (
    <NavItemRow
      key={item.id}
      item={item}
      iconTint={INACTIVE_ICON}
      glowColor={glowColorForNavItem(item.id)}
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
        height: '100%',
        minHeight: 0,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
        px: 0.5,
        pt: 1.25,
        pb: 1,
      }}
    >
      <Box sx={{ flexShrink: 0 }}>
        {essentials && (
          <List component="div" disablePadding sx={{ mb: 1 }}>
            {essentials.items.map(renderRow)}
          </List>
        )}
        <WorkspaceSwitcher
          workspaces={visibleWorkspaces}
          selectedId={selectedWorkspace?.id ?? null}
          onSelect={selectWorkspace}
          badgeCounts={workspaceBadgeCounts}
        />
      </Box>

      <Box ref={panelRef} sx={{ flexGrow: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', mt: 1 }}>
        {selectedWorkspace && (
          <WorkspacePanel group={selectedWorkspace} renderRow={renderRow} />
        )}
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
    <List component="div" disablePadding>
      {group.items.map(renderRow)}
      {group.guestItems.length > 0 ? (
        <>
          <Box
            aria-hidden
            sx={{
              mx: 2.25,
              mt: 1.15,
              mb: 0.85,
              height: '1px',
              bgcolor: '#E2E8F0',
            }}
          />
          {group.guestItems.map(renderRow)}
        </>
      ) : null}
    </List>
  );
}
