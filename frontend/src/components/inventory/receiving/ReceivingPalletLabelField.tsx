import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useRecordTruckPallet, useTruckPallets } from '../../../hooks/useTruckPallets';

/**
 * Receiving: the number on this pallet's label (scan or type). Saving it marks the pallet arrived; when the manifest
 * has pallet ids they are offered, and picking another slot's id swaps the two (E1, `services/truck_pallets.py`).
 */
export function ReceivingPalletLabelField({ orderId, palletNumber }: { orderId: number; palletNumber: number }) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: ledger } = useTruckPallets(orderId);
  const record = useRecordTruckPallet(orderId);
  const pallet = ledger?.pallets.find((p) => p.number === palletNumber);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft(pallet?.code ? pallet.label : '');
  }, [pallet?.code, pallet?.label]);

  const options = useMemo(
    () => (ledger?.pallets ?? []).filter((p) => p.from_manifest && p.code).map((p) => p.label),
    [ledger?.pallets],
  );

  /** Enter / pick always records arrival; leaving the field saves only a changed label. */
  const save = (raw: string, confirmed: boolean) => {
    const text = raw.trim();
    if (!text) return;
    const unchanged = (pallet?.code ? pallet.label : '') === text;
    if (unchanged && (!confirmed || pallet?.arrived_at)) return;
    const match = ledger?.pallets.find((p) => p.code && (p.label === text || p.code === text));
    record.mutate(
      { number: palletNumber, code: match ? match.code : text },
      {
        onError: (err) => {
          const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
          enqueueSnackbar(detail || 'Could not save the pallet label.', { variant: 'error' });
          setDraft(pallet?.code ? pallet.label : '');
        },
      },
    );
  };

  return (
    <Autocomplete
      freeSolo
      size="small"
      options={options}
      inputValue={draft}
      onInputChange={(_, value) => setDraft(value)}
      onChange={(_, value) => {
        if (typeof value === 'string') save(value, true);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Label no."
          placeholder="Scan pallet label"
          onBlur={() => save(draft, false)}
          helperText={pallet?.arrived_at ? 'Arrived' : ' '}
          FormHelperTextProps={{ sx: { m: 0, fontSize: 10 } }}
        />
      )}
      sx={{ px: '10px', pt: '8px' }}
    />
  );
}
