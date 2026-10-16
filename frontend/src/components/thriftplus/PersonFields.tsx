import AddAPhotoOutlined from '@mui/icons-material/AddAPhotoOutlined';
import { Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { fetchEmailNote } from '../../api/thriftplus.api';
import type { NewMember } from '../../types/thriftplus.types';

/** A plausible email address (the server makes the final check). */
export function looksLikeEmail(email: string | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email ?? '').trim());
}

type IdValue = Pick<NewMember, 'id_checked' | 'verified_18'>;

/** The ID check and the 18+ flag it allows (J3: nothing from the ID is kept). Also used by Finish joining (J8). */
export function IdCheckFields<T extends IdValue>({ value, onChange }: { value: T; onChange: (v: T) => void }) {
  return (
    <>
      <FormControlLabel
        control={<Checkbox checked={Boolean(value.id_checked)} onChange={(e) => onChange({ ...value, id_checked: e.target.checked, verified_18: e.target.checked ? value.verified_18 : false })} />}
        label="Checked a photo ID (the name matches)"
      />
      <FormControlLabel
        control={<Checkbox checked={Boolean(value.verified_18)} disabled={!value.id_checked} onChange={(e) => onChange({ ...value, verified_18: e.target.checked })} />}
        label="The ID shows 18 or older"
      />
    </>
  );
}

/** The member's photo from the register's camera (J4). Also used by Finish joining (J8). */
export function PhotoField({ photo, onChange }: { photo: File | null | undefined; onChange: (photo: File | null) => void }) {
  return (
    <Button component="label" variant="outlined" startIcon={<AddAPhotoOutlined />}>
      {photo ? `Photo: ${photo.name}` : 'Take or add a photo'}
      <input hidden type="file" accept="image/*" capture="user" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </Button>
  );
}

/**
 * A Thrift+ person's signup fields (Dash member service and the register): name, phone, an optional email (no
 * boxes: receipts and updates go to it, and store news with an unsubscribe link; T74), the ID check and the 18+
 * flag it allows, and a photo. The ID itself is never kept.
 *
 * `blankCard` keeps the register's old blank-card scan until the register drops it. Dash passes false: there is no
 * physical card since 2026-10-14 (owner); members get their member code in the Thrift+ app.
 */
export default function PersonFields({ value, onChange, blankCard = true }: { value: NewMember; onChange: (v: NewMember) => void; blankCard?: boolean }) {
  const note = useQuery({ queryKey: ['thriftplus', 'email-note'], queryFn: fetchEmailNote, staleTime: Infinity });
  return (
    <Stack spacing={1.25} sx={{ mt: 1 }}>
      <Stack direction="row" spacing={1}>
        <TextField label="First name" required fullWidth value={value.first_name} onChange={(e) => onChange({ ...value, first_name: e.target.value })} />
        <TextField label="Last name" required fullWidth value={value.last_name ?? ''} onChange={(e) => onChange({ ...value, last_name: e.target.value })} />
      </Stack>
      <TextField label="Phone" value={value.phone ?? ''} onChange={(e) => onChange({ ...value, phone: e.target.value })} slotProps={{ htmlInput: { inputMode: 'tel' } }} />
      <TextField
        label="Email (optional)"
        type="email"
        value={value.email ?? ''}
        helperText={note.data?.note ?? ''}
        error={Boolean(value.email) && !looksLikeEmail(value.email)}
        onChange={(e) => onChange({ ...value, email: e.target.value })}
      />
      <IdCheckFields value={value} onChange={onChange} />
      <PhotoField photo={value.photo} onChange={(photo) => onChange({ ...value, photo })} />
      {blankCard ? (
        <TextField label="Scan a blank card" value={value.card_code ?? ''} onChange={(e) => onChange({ ...value, card_code: e.target.value })} helperText="Optional. Scan the card, or type its 12 digits." />
      ) : null}
      <Typography variant="caption" color="text.secondary">
        Never scan or keep the ID itself: only the name, phone, email, photo and the 18+ flag are stored.
      </Typography>
    </Stack>
  );
}
