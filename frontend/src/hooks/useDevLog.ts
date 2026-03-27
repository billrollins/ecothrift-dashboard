import { useQuery } from '@tanstack/react-query';
import { getDevLogConfig } from '../api/core.api';

export function useDevLogConfig() {
  return useQuery({
    queryKey: ['devLogConfig'],
    queryFn: async () => {
      const { data } = await getDevLogConfig();
      return data;
    },
    staleTime: 30_000,
    retry: false,
  });
}
