import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { useSnackbar } from 'notistack';

import { Link as RouterLink } from 'react-router-dom';

import {

  Box,

  Button,

  Chip,

  CircularProgress,

  Link,

  Stack,

  Table,

  TableBody,

  TableCell,

  TableHead,

  TableRow,

  Typography,

} from '@mui/material';

import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

import LocalPrintshopOutlinedIcon from '@mui/icons-material/LocalPrintshopOutlined';

import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';

import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';

import { getItemCheckIn } from '../../../api/inventory.api';

import { formatCurrency } from '../../../utils/format';

import type { WorkbenchSelection } from '../../../utils/richInventorySearch';

import { printProcessingLabelsAndMarkPrinted } from '../processing/printProcessingLabel';

import { processingTokens } from '../processing/processingTokens';

import { CheckInRemapDialog } from './CheckInRemapDialog';
import { useWorkbenchConfirmDialog } from './useWorkbenchConfirmDialog';



export interface ItemCheckInWorkspacePanelProps {

  checkInId: number;

  onNavigate: (sel: WorkbenchSelection) => void;

}



function formatShortDateTime(iso: string | null | undefined): string {

  if (!iso) return '-';

  try {

    return new Date(iso).toLocaleString(undefined, {

      month: 'short',

      day: 'numeric',

      year: 'numeric',

      hour: 'numeric',

      minute: '2-digit',

    });

  } catch {

    return iso;

  }

}



export function ItemCheckInWorkspacePanel({ checkInId, onNavigate }: ItemCheckInWorkspacePanelProps) {

  const { enqueueSnackbar } = useSnackbar();
  const { confirm, ConfirmDialogHost } = useWorkbenchConfirmDialog();

  const [remapOpen, setRemapOpen] = useState(false);



  const checkInQuery = useQuery({

    queryKey: ['item-check-ins', 'detail', checkInId],

    queryFn: async () => (await getItemCheckIn(checkInId)).data,

  });



  if (checkInQuery.isLoading) {

    return (

      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>

        <CircularProgress size={28} />

      </Box>

    );

  }



  const checkIn = checkInQuery.data;

  if (!checkIn) {

    return <Typography color="text.secondary">Check-in not found.</Typography>;

  }



  const defaults = checkIn.defaults ?? {};

  const condition = defaults.condition ? String(defaults.condition).replace(/_/g, ' ') : '-';

  const price = defaults.price != null && defaults.price !== '' ? formatCurrency(String(defaults.price)) : '-';



  const handleReprintAll = async () => {

    if (checkIn.items.length === 0) {

      enqueueSnackbar('No items to print', { variant: 'warning' });

      return;

    }

    const n = checkIn.items.length;
    const allPrinted = checkIn.items.every((it) => it.label_printed);
    const action = allPrinted ? 'Reprint' : 'Print';
    const ok = await confirm({
      title: `${action} labels?`,
      message: `${action} ${n} label${n === 1 ? '' : 's'} for check-in #${checkIn.id}?`,
      confirmLabel: action,
      severity: 'info',
      confirmColor: 'primary',
    });
    if (!ok) return;

    const labelItems = checkIn.items.map((it) => ({
      id: it.id,
      sku: it.sku,
      price: it.price,
      product_title: checkIn.product_title,
      product_brand: checkIn.product_brand,
      product_number: checkIn.product_number ?? undefined,
    }));

    const result = await printProcessingLabelsAndMarkPrinted(labelItems);

    if (result.failed > 0) enqueueSnackbar('Some labels failed to print', { variant: 'error' });
    else if (result.succeeded > 0) enqueueSnackbar(`${result.succeeded} label${result.succeeded === 1 ? '' : 's'} sent to printer`, { variant: 'success' });
    if (result.markFailed) enqueueSnackbar('Labels printed but printed status could not be saved.', { variant: 'warning' });

  };



  const processingUrl = `/inventory/processing/${checkIn.purchase_order}?checkin=${checkIn.id}`;



  return (

    <>

    <Stack spacing={2}>

      <Box>

        <Chip label="Check-in" size="small" color="primary" variant="outlined" sx={{ mb: 1 }} />

        <Typography variant="h6" sx={{ fontWeight: 800 }}>Check-in #{checkIn.id}</Typography>

        <Typography variant="body2" color="text.secondary">

          {checkIn.product_title || 'Unknown product'} · PO {checkIn.purchase_order_number || checkIn.purchase_order}

        </Typography>

      </Box>



      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>

        <Chip label={`Qty ${checkIn.quantity}`} size="small" />

        <Chip label={checkIn.origin.replace(/_/g, ' ')} size="small" variant="outlined" sx={{ textTransform: 'capitalize' }} />

        <Chip label={`Condition ${condition}`} size="small" variant="outlined" />

        <Chip label={`Price ${price}`} size="small" variant="outlined" />

        {checkIn.dispute_count > 0 ?

          <Chip label={`${checkIn.dispute_count} disputed`} size="small" color="warning" />

        : null}

      </Stack>



      <Typography variant="body2" color="text.secondary">

        Created {formatShortDateTime(checkIn.created_at)}

      </Typography>



      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>

        <Button

          variant="contained"

          startIcon={<LocalPrintshopOutlinedIcon />}

          disabled={checkIn.items.length === 0}

          onClick={() => void handleReprintAll()}

        >

          Reprint labels

        </Button>

        <Button

          variant="outlined"

          startIcon={<EditOutlinedIcon />}

          component={RouterLink}

          to={processingUrl}

        >

          Edit check-in

        </Button>

        <Button

          variant="outlined"

          startIcon={<SwapHorizOutlinedIcon />}

          disabled={checkIn.items.length === 0}

          onClick={() => setRemapOpen(true)}

        >

          Remap product

        </Button>

        {checkIn.product ?

          <Button

            variant="outlined"

            startIcon={<OpenInNewOutlinedIcon />}

            onClick={() => onNavigate({

              type: 'product',

              id: checkIn.product!,

              label: checkIn.product_title || `Product #${checkIn.product}`,

            })}

          >

            Open product

          </Button>

        : null}

      </Stack>



      {checkIn.origin === 'processing' ?

        <Typography variant="caption" color="text.secondary">

          Full check-in editing (qty, defaults, add/remove items) lives on the{' '}

          <Link component={RouterLink} to={processingUrl}>processing workspace</Link> for PO {checkIn.purchase_order_number || checkIn.purchase_order}.

        </Typography>

      : null}



      <Box>

        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Items in this check-in</Typography>

        {checkIn.items.length === 0 ?

          <Typography variant="body2" color="text.secondary">No items linked.</Typography>

        : (

          <Table size="small" sx={{ border: 1, borderColor: processingTokens.border, borderRadius: 1 }}>

            <TableHead>

              <TableRow>

                <TableCell>SKU</TableCell>

                <TableCell>Status</TableCell>

                <TableCell>Condition</TableCell>

                <TableCell align="right">Price</TableCell>

                <TableCell>Location</TableCell>

              </TableRow>

            </TableHead>

            <TableBody>

              {checkIn.items.map((it) => (

                <TableRow

                  key={it.id}

                  hover

                  sx={{ cursor: 'pointer' }}

                  onClick={() => onNavigate({ type: 'item', id: it.id, label: it.sku })}

                >

                  <TableCell>{it.sku}</TableCell>

                  <TableCell sx={{ textTransform: 'capitalize' }}>{it.status.replace(/_/g, ' ')}</TableCell>

                  <TableCell sx={{ textTransform: 'capitalize' }}>{String(it.condition).replace(/_/g, ' ')}</TableCell>

                  <TableCell align="right">{formatCurrency(it.price)}</TableCell>

                  <TableCell>{it.location || '-'}</TableCell>

                </TableRow>

              ))}

            </TableBody>

          </Table>

        )}

      </Box>



      <CheckInRemapDialog

        open={remapOpen}

        orderId={checkIn.purchase_order}

        checkInId={checkIn.id}

        currentProductTitle={checkIn.product_title}

        onClose={() => setRemapOpen(false)}

        onRemapped={(productId) => {

          onNavigate({

            type: 'product',

            id: productId,

            label: checkIn.product_title || `Product #${productId}`,

          });

        }}

      />

    </Stack>

    {ConfirmDialogHost}

    </>

  );

}

