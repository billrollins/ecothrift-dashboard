import AddAPhotoOutlined from '@mui/icons-material/AddAPhotoOutlined';
import { Box, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { fetchTextWording } from '../../api/thriftplus.api';
import type { NewMember, TextKind } from '../../types/thriftplus.types';

const FIELD: Record<TextKind, 'texts_thriftplus' | 'texts_news'> = { thriftplus: 'texts_thriftplus', news: 'texts_news' };

/** A 10-digit US number, as the server checks it. */
export function isTextableNumber(phone: string | undefined): boolean {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.length === 10;
}

/**
 * The two text-consent boxes (T59, house texting standard): separate, never pre-ticked, the exact words
 * shown, and neither needed to join. The words come from the server, which records the same version.
 */
function TextBoxes({ value, onChange }: { value: NewMember; onChange: (v: NewMember) => void }) {
  const wording = useQuery({ queryKey: ['thriftplus', 'text-wording'], queryFn: fetchTextWording, staleTime: Infinity });
  const textable = isTextableNumber(value.phone);
  if (!wording.data) return null;
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
      <Typography variant="subtitle2">Texts (ask; read the words or turn the screen to them)</Typography>
      {wording.data.kinds.map((k) => (
        <FormControlLabel
          key={k.kind}
          sx={{ alignItems: 'flex-start', mt: 0.75, mr: 0 }}
          control={(
            <Checkbox
              sx={{ pt: 0.25 }}
              checked={Boolean(value[FIELD[k.kind]]) && textable}
              disabled={!textable}
              onChange={(e) => onChange({ ...value, [FIELD[k.kind]]: e.target.checked })}
              inputProps={{ 'aria-label': k.label }}
            />
          )}
          label={(
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{k.label}</Typography>
              <Typography variant="caption" color="text.secondary">{k.text}</Typography>
            </Box>
          )}
        />
      ))}
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
        {textable ? wording.data.not_required : 'Add a 10-digit mobile number to offer texts.'}
      </Typography>
    </Box>
  );
}

/**
 * A Thrift+ person's signup fields (Dash member service and the register): name, phone and its two
 * text choices, the ID check and the 18+ flag it allows, a photo, and a blank card. The ID itself is never kept.
 */
export default function PersonFields({ value, onChange }: { value: NewMember; onChange: (v: NewMember) => void }) {
  return (
    <Stack spacing={1.25} sx={{ mt: 1 }}>
      <Stack direction="row" spacing={1}>
        <TextField label="First name" required fullWidth value={value.first_name} onChange={(e) => onChange({ ...value, first_name: e.target.value })} />
        <TextField label="Last name" fullWidth value={value.last_name ?? ''} onChange={(e) => onChange({ ...value, last_name: e.target.value })} />
      </Stack>
      <TextField
        label="Phone"
        value={value.phone ?? ''}
        inputMode="tel"
        onChange={(e) => {
          const phone = e.target.value;
          // A box ticked for a number that is no longer a mobile number is not consent: clear it.
          onChange({ ...value, phone, ...(isTextableNumber(phone) ? {} : { texts_thriftplus: false, texts_news: false }) });
        }}
      />
      <TextBoxes value={value} onChange={onChange} />
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
