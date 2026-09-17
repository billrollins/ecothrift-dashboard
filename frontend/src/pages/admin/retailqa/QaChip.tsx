import { CHIP_ICON, CHIP_LABEL } from './commandCenter';
import { QaIcon } from './QaIcons';

export function QaChip({ kind }: { kind: keyof typeof CHIP_LABEL }) {
  return (
    <span className={`chip ${kind}`}>
      <QaIcon name={CHIP_ICON[kind]} />
      {CHIP_LABEL[kind]}
    </span>
  );
}
