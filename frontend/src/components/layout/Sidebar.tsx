import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, List, Typography } from '@mui/material';
import { NavItemRow } from '../../navigation/NavItemRow';
import { WorkspaceSwitcher } from '../../navigation/WorkspaceSwitcher';
import { resolveNavGroups } from '../../navigation/navResolve';
import {
  resolveWorkspaceForRoute,
  rollupWorkspaceBadgeCounts,
  SLOT_C_DEFAULT_WORKSPACE_ID,
  SLOT_C_REGISTER_WORKSPACE_ID,
  SLOT_C_ESSENTIALS_GROUP_ID,
  SLOT_C_NAV_GROUPS,
  SLOT_C_WORKSPACES,
  SLOT_C_WORKSPACE_ID_MIGRATION,
  glowColorForNavItem,
} from '../../navigation/slotCNavLayout';
import type { ResolvedNavGroup, ResolvedNavItem } from '../../navigation/navTypes';
import { useStaffNav } from '../../navigation/useStaffNav';
import { useNavBadgeCounts } from '../../hooks/useNavBadgeCounts';
import { isRegisterDevice } from '../../hooks/useDeviceConfig';

export const SIDEBAR_WIDTH = 252;

// Per person (`.<user id>`): a shared register computer must not hand one person's workspace to the next.
const LS_NAV_C_WORKSPACE = 'ecothrift.navC.workspace.v1';
const INACTIVE_ICON = '#64748B';

function normalizeWorkspaceId(raw: string | null): string | null {
  if (!raw) return null;
  return SLOT_C_WORKSPACE_ID_MIGRATION[raw] ?? raw;
}

function workspaceKey(userId: number | undefined): string {
  return `${LS_NAV_C_WORKSPACE}.${userId ?? 'anon'}`;
}

function loadWorkspace(userId: number | undefined): string | null {
  try {
    const raw = localStorage.getItem(workspaceKey(userId));
    if (!raw) return null;
    const migrated = normalizeWorkspaceId(raw);
    if (migrated && migrated !== raw) {
      localStorage.setItem(workspaceKey(userId), migrated);
    }
    return migrated;
  } catch {
    return null;
  }
}

function saveWorkspace(userId: number | undefined, id: string) {
  try {
    localStorage.setItem(workspaceKey(userId), id);
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
    () => loadWorkspace(user?.id) ?? null,
  );

  useEffect(() => {
    if (!visibleWorkspaces.length) return;
    const selectedStillVisible = visibleWorkspaces.some((w) => w.id === selectedWorkspaceId);
    if (!selectedStillVisible) {
      // A register computer starts in Cashier; anywhere else in the default (Buying).
      const preferred = isRegisterDevice() ? SLOT_C_REGISTER_WORKSPACE_ID : SLOT_C_DEFAULT_WORKSPACE_ID;
      const fallback =
        visibleWorkspaces.find((w) => w.id === preferred)?.id ??
        visibleWorkspaces.find((w) => w.id === SLOT_C_DEFAULT_WORKSPACE_ID)?.id ??
        visibleWorkspaces[0]!.id;
      setSelectedWorkspaceId(fallback);
      saveWorkspace(user?.id, fallback);
    }
  }, [selectedWorkspaceId, visibleWorkspaces, user?.id]);

  // External URL entry: resolve lowest lifecycle workspace. Sidebar clicks skip via navFromSidebar state.
  useEffect(() => {
    const navState = locationState as { navFromSidebar?: boolean } | null;
    if (navState?.navFromSidebar) return;

    const resolved = resolveWorkspaceForRoute(workspaceGroups, visibleWorkspaces, isActive);
    if (resolved) {
      setSelectedWorkspaceId(resolved);
      saveWorkspace(user?.id, resolved);
    }
  }, [pathname, search, hash, locationState, workspaceGroups, visibleWorkspaces, isActive, user?.id]);

  const selectedWorkspace =
    workspaceGroups.find((g) => g.id === selectedWorkspaceId) ?? workspaceGroups[0] ?? null;

  const selectWorkspace = useCallback((id: string, focusFirst = false) => {
    setSelectedWorkspaceId(id);
    saveWorkspace(user?.id, id);
    if (focusFirst) focusFirstPanelItem(panelRef.current);
  }, [user?.id]);

  // Only ask for Online Sales counts when the user can actually open it.
  const badgeCounts = useNavBadgeCounts({
    onlineSales: workspaceGroups.some((g) => g.id === 'onlineSales'),
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
      {group.items.filter((item) => !group.setupItems.includes(item)).map(renderRow)}
      {group.setupItems.length > 0 ? (
        <>
          <Typography
            variant="overline"
            component="div"
            sx={{ px: 2.25, mt: 1, mb: 0.25, lineHeight: 1.6, fontSize: '0.65rem', letterSpacing: '0.08em', color: 'text.disabled' }}
          >
            Setup
          </Typography>
          {group.setupItems.map(renderRow)}
        </>
      ) : null}
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
