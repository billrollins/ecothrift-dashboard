import { SalesDayDetailContent } from '../SalesDayDetailContent';
import { DashboardPhoneSheet } from './DashboardPhoneSheet';

export function DayDetailSheet({
  open,
  onClose,
  headline,
  salesLabel,
  revenue,
  itemsSold,
}: {
  open: boolean;
  onClose: () => void;
  headline: string;
  salesLabel: string;
  revenue: string;
  itemsSold: number;
}) {
  return (
    <DashboardPhoneSheet open={open} title="Day detail" onClose={onClose}>
      <SalesDayDetailContent
        headline={headline}
        salesLabel={salesLabel}
        revenue={revenue}
        itemsSold={itemsSold}
      />
    </DashboardPhoneSheet>
  );
}
