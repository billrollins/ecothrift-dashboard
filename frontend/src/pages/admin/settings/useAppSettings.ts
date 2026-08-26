import { useQuery } from '@tanstack/react-query';
import { getSettings, type Setting } from '../../../api/core.api';

export function useAppSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await getSettings();
      return Array.isArray(data) ? data : (data as { results?: Setting[] })?.results ?? [];
    },
  });
}

export function settingByKey(settings: Setting[] | undefined, key: string): Setting | undefined {
  return settings?.find((s) => s.key === key);
}
