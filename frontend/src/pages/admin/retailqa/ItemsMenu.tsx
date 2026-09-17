import { Menu, MenuItem } from '@mui/material';

export type RowMenuItem = {
  label: string;
  onClick: () => void;
};

export function ItemsMenu({
  anchor,
  onClose,
  items,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  items: RowMenuItem[];
}) {
  return (
    <Menu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
    >
      {items.map((item) => (
        <MenuItem
          key={item.label}
          onClick={() => {
            onClose();
            item.onClick();
          }}
        >
          {item.label}
        </MenuItem>
      ))}
    </Menu>
  );
}
