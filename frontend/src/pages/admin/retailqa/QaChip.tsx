import { useState } from 'react';
import { CHIP_ICON, CHIP_LABEL } from './commandCenter';
import { ItemsMenu, type RowMenuItem } from './ItemsMenu';
import { QaIcon } from './QaIcons';

export function QaChip({
  kind,
  title,
  onClick,
}: {
  kind: keyof typeof CHIP_LABEL;
  title?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const inner = (
    <>
      <QaIcon name={CHIP_ICON[kind]} />
      {CHIP_LABEL[kind]}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`chip ${kind}`} title={title} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return (
    <span className={`chip ${kind}`} title={title}>
      {inner}
    </span>
  );
}

export function ChipMenu({
  kind,
  title,
  items,
}: {
  kind: keyof typeof CHIP_LABEL;
  title?: string;
  items: RowMenuItem[];
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <QaChip
        kind={kind}
        title={title}
        onClick={
          items.length
            ? (event) => {
                event.stopPropagation();
                setAnchor(event.currentTarget);
              }
            : undefined
        }
      />
      <ItemsMenu anchor={anchor} onClose={() => setAnchor(null)} items={items} />
    </>
  );
}
