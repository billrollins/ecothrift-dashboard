/** Store signs (#106). Where each copy hangs is a store-map pin on the Signage layer. */
export type SignStatus = 'to_make' | 'printed' | 'up';

export const SIGN_STATUSES: { value: SignStatus; label: string }[] = [
  { value: 'to_make', label: 'To make' },
  { value: 'printed', label: 'Printed' },
  { value: 'up', label: 'Up' },
];

/** `MapPin.ref_type` of a pin that stands for a sign. */
export const SIGN_REF_TYPE = 'signage.sign';

export interface Sign {
  id: number;
  name: string;
  status: SignStatus;
  status_label: string;
  copies_up: number;
  note: string;
  pdf_name: string | null;
  pdf_size: number | null;
  /** Spots on the Current store map. */
  pins: number;
  created_at: string;
  updated_at: string;
}

export type SignPayload = Partial<Pick<Sign, 'name' | 'status' | 'copies_up' | 'note'>>;
