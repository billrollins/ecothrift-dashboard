/**
 * One card that names the current workspace, and a menu of every workspace
 * the user can open.
 *
 * The workspace cards used to sit in the sidebar all the time and ate a third
 * of it. They still exist - they just live in the menu, so the trigger can stay
 * one row and opening it never pushes the links below.
 *
 * Digits and first letters jump while the menu is open and do nothing the rest
 * of the time, so a SKU scan or a price field never has its keystroke stolen.
 */
import ExpandMore from '@mui/icons-material/ExpandMore';
import { Box, ButtonBase, Menu, MenuItem, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useId, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { resolveNavIcon } from './navIcons';
import {
  workspaceIdForKey,
  workspaceShortcutLetter,
  type SlotCWorkspaceMeta,
} from './slotCNavLayout';
import { NavIconWaitingBadge } from './NavWaitingBadge';

export function WorkspaceSwitcher({
  workspaces,
  selectedId,
  onSelect,
  badgeCounts = {},
}: {
  workspaces: SlotCWorkspaceMeta[];
  selectedId: string | null;
  onSelect: (id: string, focusFirst?: boolean) => void;
  /** Waiting work rolled up per workspace id. */
  badgeCounts?: Record<string, number>;
}) {
  const theme = useTheme();
  const menuId = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);
  const current = workspaces.find((w) => w.id === selectedId) ?? workspaces[0] ?? null;

  if (!current) return null;

  const CurrentIcon = resolveNavIcon(current.icon);

  function close() {
    setAnchor(null);
  }

  function pick(id: string, focusFirst: boolean) {
    onSelect(id, focusFirst);
    close();
  }

  function onJumpKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const id = workspaceIdForKey(workspaces, e.key);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    pick(id, true);
  }

  return (
    <Box sx={{ px: 0.5 }}>
      <ButtonBase
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Workspace, ${current.shortLabel}`}
        onClick={(e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)}
        sx={{
          display: 'grid',
          gridTemplateColumns: '28px 1fr 20px',
          gridTemplateRows: 'auto minmax(28px, auto)',
          alignItems: 'center',
          columnGap: 1,
          rowGap: 0.5,
          width: '100%',
          minHeight: 44,
          px: 1.25,
          pt: 0.75,
          pb: 1.25,
          overflow: 'visible',
          borderRadius: '10px',
          textAlign: 'left',
          bgcolor: '#FFFFFF',
          border: '1px solid',
          borderColor: open ? theme.palette.primary.main : '#E5E7EB',
          boxShadow: open ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.12)}` : 'none',
          '&:hover': { bgcolor: '#F8FAFC' },
          '&:focus-visible': {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 2,
          },
        }}
      >
        <Typography
          variant="caption"
          sx={{
            gridColumn: '1 / -1',
            color: '#94A3B8',
            fontSize: '0.5rem',
            fontWeight: 400,
            letterSpacing: '0.1em',
            lineHeight: 1,
            textAlign: 'center',
          }}
        >
          WORKSPACE
        </Typography>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: '8px',
            display: 'grid',
            placeItems: 'center',
            bgcolor: open ? alpha(theme.palette.primary.main, 0.1) : '#F8FAFC',
            color: open ? 'primary.main' : '#64748B',
          }}
        >
          <CurrentIcon sx={{ fontSize: 18 }} />
        </Box>
        <Typography
          variant="body2"
          sx={{
            display: 'flex',
            alignItems: 'center',
            minWidth: 0,
            minHeight: 28,
            overflow: 'visible',
            color: '#0F172A',
            fontSize: '0.84375rem',
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          <ShortcutLabel text={current.shortLabel} color={current.shortcutColor} />
        </Typography>
        <Box sx={{ width: 20, height: 28, display: 'grid', placeItems: 'center' }}>
          <ExpandMore
            sx={{
              fontSize: 20,
              color: open ? 'primary.main' : '#94A3B8',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 150ms ease',
            }}
          />
        </Box>
      </ButtonBase>

      <Menu
        id={menuId}
        anchorEl={anchor}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.75,
              minWidth: 288,
              borderRadius: '14px',
              border: '1px solid #E5E7EB',
              boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
              overflow: 'hidden',
            },
          },
        }}
        MenuListProps={{
          'aria-label': 'Workspaces',
          onKeyDown: onJumpKey,
          sx: { py: 0.75, px: 0.75 },
        }}
      >
        {workspaces.map((workspace) => {
          const selected = workspace.id === current.id;
          const Icon = resolveNavIcon(workspace.icon);
          const letter = workspaceShortcutLetter(workspace);
          return (
            <MenuItem
              key={workspace.id}
              role="menuitemradio"
              aria-label={
                badgeCounts[workspace.id]
                  ? `${workspace.shortLabel}, ${badgeCounts[workspace.id]} waiting`
                  : workspace.shortLabel
              }
              aria-checked={selected}
              aria-keyshortcuts={[
                workspace.shortcutDigit != null ? String(workspace.shortcutDigit) : '',
                letter,
              ]
                .filter(Boolean)
                .join(' ')}
              selected={selected}
              disableRipple
              onClick={(e) => pick(workspace.id, e.detail === 0)}
              sx={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr 20px',
                alignItems: 'center',
                gap: 1,
                minHeight: 44,
                px: 1.25,
                py: 0.75,
                mb: 0.5,
                overflow: 'visible',
                borderRadius: '10px',
                bgcolor: selected ? '#EEF7EE' : '#FFFFFF',
                border: '1px solid',
                borderColor: selected ? alpha(theme.palette.primary.main, 0.22) : 'transparent',
                '&:last-of-type': { mb: 0 },
                '&:hover': { bgcolor: selected ? '#EAF5EA' : '#F8FAFC' },
                '&.Mui-focusVisible': {
                  bgcolor: selected ? '#EAF5EA' : '#F8FAFC',
                },
                '&.Mui-selected': {
                  bgcolor: '#EEF7EE',
                  '&:hover': { bgcolor: '#EAF5EA' },
                },
              }}
            >
              <Box
                sx={{
                  position: 'relative',
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
                <NavIconWaitingBadge count={badgeCounts[workspace.id] ?? 0} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="body2"
                  noWrap
                  sx={{
                    color: '#0F172A',
                    fontSize: '0.8125rem',
                    fontWeight: selected ? 700 : 600,
                    lineHeight: 1.2,
                  }}
                >
                  <ShortcutLabel text={workspace.shortLabel} color={workspace.shortcutColor} />
                </Typography>
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ color: '#64748B', fontSize: '0.6875rem', lineHeight: 1.2 }}
                >
                  {workspace.helper}
                </Typography>
              </Box>
              <Keycap digit={workspace.shortcutDigit} selected={selected} />
            </MenuItem>
          );
        })}
        <Box
          component="li"
          aria-hidden
          sx={{
            mt: 0.5,
            px: 1.25,
            pt: 0.75,
            pb: 0.25,
            borderTop: '1px solid #EEF2F6',
          }}
        >
          <Typography sx={{ color: '#94A3B8', fontSize: '0.6875rem', fontWeight: 600 }}>
            Press a number or letter to jump
          </Typography>
        </Box>
      </Menu>
    </Box>
  );
}

/** The first letter is the jump key: a colored chip, unique per workspace. */
function ShortcutLabel({ text, color }: { text: string; color: string }) {
  const first = text.charAt(0);
  const rest = text.slice(1);
  if (!first) return null;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
      <Box
        component="span"
        aria-hidden
        sx={{
          display: 'inline-grid',
          placeItems: 'center',
          flexShrink: 0,
          width: 20,
          height: 20,
          mr: 0.25,
          borderRadius: '6px',
          fontSize: '0.75rem',
          fontWeight: 900,
          letterSpacing: 0,
          lineHeight: 1,
          color: '#FFFFFF',
          bgcolor: color,
        }}
      >
        {first}
      </Box>
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {rest}
      </Box>
    </Box>
  );
}

function Keycap({ digit, selected }: { digit?: number; selected: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        width: 20,
        height: 20,
        borderRadius: '6px',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '0.6875rem',
        fontWeight: 800,
        lineHeight: 1,
        bgcolor: selected ? '#FFFFFF' : '#F1F5F9',
        color: selected ? 'primary.main' : '#64748B',
        border: '1px solid',
        borderColor: selected ? '#D1E7D3' : '#E2E8F0',
        boxShadow: selected ? 'inset 0 -1px 0 #D1E7D3' : 'inset 0 -1px 0 #E2E8F0',
      }}
    >
      {digit != null ? digit : ''}
    </Box>
  );
}
