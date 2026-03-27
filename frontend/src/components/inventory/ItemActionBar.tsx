import { Button, CircularProgress, Stack } from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import ClearAll from '@mui/icons-material/ClearAll';
import Close from '@mui/icons-material/Close';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import LabelOutlined from '@mui/icons-material/LabelOutlined';
import LocalOffer from '@mui/icons-material/LocalOffer';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import type { Item } from '../../types/inventory.types';

export type ItemActionBarProps = {
  mode: 'create' | 'edit';
  item: Item | null | undefined;
  itemLoading: boolean;
  formId: string;
  formPending: boolean;
  onPrintTag: () => void;
  onReprice: () => void;
  onMarkReady: () => void;
  onDeleteClick: () => void;
  markReadyPending?: boolean;
  /** Primary toolbar at top of panel (divider below); default bottom (divider above). */
  placement?: 'top' | 'bottom';
  /** Create-mode: reset / clear all fields. */
  onClear?: () => void;
  /** Create-mode: close the panel entirely. */
  onCancel?: () => void;
};

export default function ItemActionBar({
  mode,
  item,
  itemLoading,
  formId,
  formPending,
  onPrintTag,
  onReprice,
  onMarkReady,
  onDeleteClick,
  markReadyPending = false,
  placement = 'bottom',
  onClear,
  onCancel,
}: ItemActionBarProps) {
  const showEditActions = mode === 'edit' && item && !itemLoading;
  const canMarkReady = item && ['intake', 'processing'].includes(item.status);

  return (
    <Stack
      direction="row"
      spacing={1}
      flexWrap="wrap"
      sx={{
        p: 1.5,
        borderColor: 'divider',
        ...(placement === 'top'
          ? { borderBottom: 1, borderTop: 0 }
          : { borderTop: 1, borderBottom: 0 }),
        justifyContent: 'flex-start',
        alignItems: 'center',
      }}
    >
      {showEditActions && (
        <>
          <Button
            size="small"
            variant="outlined"
            startIcon={<LabelOutlined />}
            onClick={() => void onPrintTag()}
          >
            Print tag
          </Button>
          <Button size="small" variant="outlined" startIcon={<LocalOffer />} onClick={onReprice}>
            Reprice
          </Button>
          {canMarkReady && (
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={<CheckCircle />}
              onClick={() => void onMarkReady()}
              disabled={markReadyPending}
            >
              Mark ready
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<DeleteOutline />}
            onClick={onDeleteClick}
          >
            Delete
          </Button>
        </>
      )}
      {mode === 'create' && onClear && (
        <Button size="medium" variant="outlined" startIcon={<ClearAll />} onClick={onClear}>
          Clear
        </Button>
      )}
      <Button
        type="submit"
        form={formId}
        variant="contained"
        size={mode === 'create' ? 'medium' : 'small'}
        startIcon={formPending ? <CircularProgress size={18} color="inherit" /> : <SaveOutlined />}
        disabled={formPending || (mode === 'edit' && (itemLoading || !item))}
      >
        {mode === 'create' ? 'Create' : 'Save'}
      </Button>
      {mode === 'create' && onCancel && (
        <Button size="medium" variant="outlined" color="inherit" startIcon={<Close />} onClick={onCancel} sx={{ ml: 'auto' }}>
          Cancel
        </Button>
      )}
    </Stack>
  );
}
