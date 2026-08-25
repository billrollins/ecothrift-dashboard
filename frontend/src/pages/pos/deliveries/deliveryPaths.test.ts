import { describe, expect, it } from 'vitest';
import {
  deliveryDayIdFromPath,
  deliveryDayPath,
  deliveryListPath,
  isDeliveryDayDetailPath,
  isDeliveryTablePath,
} from './deliveryPaths';

describe('deliveryPaths', () => {
  it('builds schedule and table list urls per experience', () => {
    expect(deliveryListPath('desk', 'schedule')).toBe('/pos/deliveries/desk/schedule');
    expect(deliveryListPath('field', 'table', '?q=a')).toBe('/pos/deliveries/field/table?q=a');
  });

  it('builds a schedule day url', () => {
    expect(deliveryDayPath('desk', 46)).toBe('/pos/deliveries/desk/schedule/46');
  });

  it('recognizes table vs day-detail', () => {
    expect(isDeliveryTablePath('/pos/deliveries/desk/table')).toBe(true);
    expect(isDeliveryTablePath('/pos/deliveries/desk/schedule')).toBe(false);
    expect(isDeliveryDayDetailPath('/pos/deliveries/field/schedule/9')).toBe(true);
    expect(isDeliveryDayDetailPath('/pos/deliveries/field/schedule')).toBe(false);
    expect(deliveryDayIdFromPath('/pos/deliveries/desk/schedule/46')).toBe('46');
  });
});
