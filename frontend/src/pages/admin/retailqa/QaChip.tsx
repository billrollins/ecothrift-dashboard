import { CHIP_ICON, CHIP_LABEL } from './commandCenter';
import { QaIcon } from './QaIcons';

export function QaChip({ kind, title }: { kind: keyof typeof CHIP_LABEL; title?: string }) {
  return (
    <span className={`chip ${kind}`} title={title}>
      <QaIcon name={CHIP_ICON[kind]} />
      {CHIP_LABEL[kind]}
    </span>
  );
}
