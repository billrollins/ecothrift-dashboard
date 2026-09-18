import { useQuery } from '@tanstack/react-query';
import { asSettingRows, getSettings, type Setting } from '../../../api/core.api';

export function useAppSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await getSettings()).data,
    select: asSettingRows,
  });
}

export function settingByKey(settings: Setting[] | undefined, key: string): Setting | undefined {
  return settings?.find((s) => s.key === key);
}
