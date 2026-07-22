import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { CsvViewerDialog } from '../common/CsvViewerDialog';
import {
  downloadOrderManifest,
  getOrderManifestPreview,
} from '../../api/inventory.api';
import { downloadBlob } from '../../utils/downloadBlob';

export interface PurchaseOrderManifestDialogProps {
  open: boolean;
  onClose: () => void;
  orderId: number | null;
  /** Optional fallback title while preview loads. */
  fallbackFilename?: string | null;
}

/**
 * Order-domain wrapper around {@link CsvViewerDialog}: lazy preview + authenticated download.
 */
export function PurchaseOrderManifestDialog({
  open,
  onClose,
  orderId,
  fallbackFilename,
}: PurchaseOrderManifestDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const previewQ = useQuery({
    queryKey: ['orderManifestPreview', orderId],
    enabled: open && orderId != null && Number.isFinite(orderId),
    staleTime: 60_000,
    queryFn: async () => {
      if (orderId == null) throw new Error('no_order');
      const { data } = await getOrderManifestPreview(orderId);
      return data;
    },
  });

  const filename =
    previewQ.data?.filename || fallbackFilename || (orderId != null ? `order-${orderId}-manifest.csv` : 'manifest.csv');

  return (
    <CsvViewerDialog
      open={open}
      onClose={onClose}
      title={filename}
      subtitle={
        previewQ.data?.order_number
          ? `Order ${previewQ.data.order_number}${
              previewQ.data.size != null ? ` · ${Math.round(previewQ.data.size / 1024)} KB` : ''
            }`
          : null
      }
      headers={previewQ.data?.headers ?? []}
      rows={previewQ.data?.rows ?? []}
      totalRowCount={previewQ.data?.total_row_count}
      loading={previewQ.isLoading || previewQ.isFetching}
      error={
        previewQ.isError
          ? ((previewQ.error as { response?: { data?: { detail?: string } } })?.response?.data
              ?.detail as string) || 'Could not load manifest preview.'
          : null
      }
      onDownload={async () => {
        if (orderId == null) return;
        try {
          const { data } = await downloadOrderManifest(orderId);
          downloadBlob(data, filename);
        } catch {
          enqueueSnackbar('Could not download manifest.', { variant: 'error' });
        }
      }}
    />
  );
}
