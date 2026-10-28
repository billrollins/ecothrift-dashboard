import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getLabelSizeSetting, saveLabelSizeSetting, savePriceTagDesign, savePriceTagInDash, type PriceTagDesign } from '../api/core.api';
import {
  DEFAULT_LABEL_SIZE,
  effectiveLabelSize,
  parseLabelSize,
  readStationLabelSize,
  writeStationLabelSize,
  type LabelSize,
} from './labelSize';
import { forgetStoreLabelSize } from './printTags';

/** The label-size setting for a screen: the store's size, this computer's override, and the one in use. */
export function useLabelSize() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['label-size'],
    queryFn: getLabelSizeSetting,
    staleTime: 60_000,
  });
  const [station, setStation] = useState<LabelSize | null>(() => readStationLabelSize());
  const store = parseLabelSize(settings?.value) ?? DEFAULT_LABEL_SIZE;

  const saveStore = useMutation({
    mutationFn: (size: LabelSize) => saveLabelSizeSetting(size),
    onSuccess: (saved) => {
      forgetStoreLabelSize(saved);
      qc.setQueryData(['label-size'], saved);
    },
  });

  const savePriceSwitch = useMutation({
    mutationFn: (on: boolean) => savePriceTagInDash(on),
    onSuccess: (on) => {
      const next = { ...settings, value: settings?.value ?? store, price_tag_in_dash: on };
      forgetStoreLabelSize(next);
      qc.setQueryData(['label-size'], next);
    },
  });

  const savePriceDesign = useMutation({
    mutationFn: (design: PriceTagDesign) => savePriceTagDesign(design),
    onSuccess: (design) => {
      const next = { ...settings, value: settings?.value ?? store, price_tag_in_dash: settings?.price_tag_in_dash === true,
        price_tag_design: design };
      forgetStoreLabelSize(next);
      qc.setQueryData(['label-size'], next);
    },
  });

  const saveStation = useCallback((size: LabelSize | null) => {
    writeStationLabelSize(size);
    setStation(size);
  }, []);

  return {
    store,
    station,
    effective: effectiveLabelSize(store, station),
    priceTagInDash: settings?.price_tag_in_dash === true,
    priceTagDesign: (settings?.price_tag_design === 'perks' ? 'perks' : 'classic') as PriceTagDesign,
    isLoading,
    saveStore,
    savePriceSwitch,
    savePriceDesign,
    saveStation,
  };
}
