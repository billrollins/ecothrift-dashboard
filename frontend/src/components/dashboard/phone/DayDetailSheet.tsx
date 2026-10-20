import { SalesDayDetailContent } from '../SalesDayDetailContent';
import { DashboardPhoneSheet } from './DashboardPhoneSheet';

export function DayDetailSheet({
  open,
  onClose,
  headline,
  salesLabel,
  revenue,
  itemsSold,
  returns,
  thriftplusRevenue,
}: {
  open: boolean;
  onClose: () => void;
  headline: string;
  salesLabel: string;
  revenue: string;
  itemsSold: number;
  returns?: string;
  thriftplusRevenue?: string;
}) {
  return (
    <DashboardPhoneSheet open={open} title="Day detail" onClose={onClose}>
      <SalesDayDetailContent
        headline={headline}
        salesLabel={salesLabel}
        revenue={revenue}
        itemsSold={itemsSold}
        returns={returns}
        thriftplusRevenue={thriftplusRevenue}
      />
    </DashboardPhoneSheet>
  );
}
