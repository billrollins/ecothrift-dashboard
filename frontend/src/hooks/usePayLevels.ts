import { useQuery } from '@tanstack/react-query';
import { getPayLevels } from '../api/accounts.api';
import { DEFAULT_PAY_LEVELS } from '../utils/payLevels';

/** The pay levels with their ranges (the owner's hr.pay_levels setting); the built-in defaults until they load. */
export function usePayLevels() {
  const query = useQuery({
    queryKey: ['pay-levels'],
    queryFn: async () => (await getPayLevels()).data.levels,
    staleTime: 300_000,
    retry: false,
  });
  return query.data?.length ? query.data : DEFAULT_PAY_LEVELS;
}
