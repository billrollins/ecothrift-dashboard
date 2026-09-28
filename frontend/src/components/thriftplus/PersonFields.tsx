import AddAPhotoOutlined from '@mui/icons-material/AddAPhotoOutlined';
import { Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import type { NewMember } from '../../types/thriftplus.types';

/**
 * A Thrift+ person's signup fields (Dash member service and the register): name, phone, the ID
 * check and the 18+ flag it allows, a photo, and a blank card. The ID itself is never kept.
 */
export default function PersonFields({ value, onChange }: { value: NewMember; onChange: (v: NewMember) => void }) {
  return (
    <Stack spacing={1.25} sx={{ mt: 1 }}>
      <Stack direction="row" spacing={1}>
        <TextField label="First name" required fullWidth value={value.first_name} onChange={(e) => onChange({ ...value, first_name: e.target.value })} />
        <TextField label="Last name" fullWidth value={value.last_name ?? ''} onChange={(e) => onChange({ ...value, last_name: e.target.value })} />
      </Stack>
      <TextField label="Phone" value={value.phone ?? ''} onChange={(e) => onChange({ ...value, phone: e.target.value })} inputMode="tel" />
      <FormControlLabel
        control={<Checkbox checked={Boolean(value.id_checked)} onChange={(e) => onChange({ ...value, id_checked: e.target.checked, verified_18: e.target.checked ? value.verified_18 : false })} />}
        label="Checked a photo ID (the name matches)"
      />
      <FormControlLabel
        control={<Checkbox checked={Boolean(value.verified_18)} disabled={!value.id_checked} onChange={(e) => onChange({ ...value, verified_18: e.target.checked })} />}
        label="The ID shows 18 or older"
      />
      <Button component="label" variant="outlined" startIcon={<AddAPhotoOutlined />}>
        {value.photo ? `Photo: ${value.photo.name}` : 'Take or add a photo'}
        <input hidden type="file" accept="image/*" capture="user" onChange={(e) => onChange({ ...value, photo: e.target.files?.[0] ?? null })} />
      </Button>
      <TextField label="Scan a blank card" value={value.card_code ?? ''} onChange={(e) => onChange({ ...value, card_code: e.target.value })} helperText="Optional. Scan the card, or type its 12 digits." />
      <Typography variant="caption" color="text.secondary">
        Never scan or keep the ID itself: only the name, phone, photo and the 18+ flag are stored.
      </Typography>
    </Stack>
  );
}
