import { Menu, MenuItem } from '@mui/material';
import { useState } from 'react';

export type RowMenuItem = {
  label: string;
  onClick: () => void;
};

export function RowActionMenu({
  label,
  items,
  tone,
  always,
  title,
}: {
  label: string;
  items: RowMenuItem[];
  tone?: string;
  always?: boolean;
  title?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!items.length) return null;
  return (
    <>
      <button
        type="button"
        className={`act ${always ? 'always' : ''} ${tone || ''}`.trim()}
        title={title}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(event.currentTarget);
        }}
      >
        {label}
      </button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {items.map((item) => (
          <MenuItem
            key={item.label}
            onClick={() => {
              setAnchor(null);
              item.onClick();
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
