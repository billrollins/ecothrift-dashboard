/**
 * This computer's print server: Online / Needs update / Offline, from its health and the published release. Read by
 * the sidebar's Print server button and the Printing screen (Bill, Dash Updates #9).
 */
import { useQuery } from '@tanstack/react-query';
import { getPrintServerVersion } from '../../api/core.api';
import { localPrintService } from '../../services/localPrintService';
import { printServerState } from '../../printing/printServerState';

export interface PrintServerRelease {
  available?: boolean;
  version?: string;
  released_at?: string;
  s3_file_info?: { filename?: string; size?: number; url: string | null } | null;
}

export function usePrintServerState() {
  const { data: health, isFetched, isFetching, refetch } = useQuery({
    queryKey: ['ps-chip-health'],
    queryFn: () => localPrintService.getHealth(),
    refetchInterval: 30_000,
    retry: false,
  });
  const { data: release } = useQuery<PrintServerRelease>({
    queryKey: ['printServerVersion'],
    queryFn: async () => (await getPrintServerVersion()).data as unknown as PrintServerRelease,
    staleTime: 10 * 60_000,
  });
  const latest = release?.available ? release.version : undefined;
  return {
    state: printServerState(health?.status === 'ok', health?.version, latest),
    checked: isFetched,
    refreshing: isFetching,
    refresh: refetch,
    installed: health?.version,
    printers: health?.printers_available,
    latest,
    release,
    downloadUrl: release?.s3_file_info?.url ?? null,
  };
}
