import AddAPhotoOutlined from '@mui/icons-material/AddAPhotoOutlined';
import { Box, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { fetchEmailWording } from '../../api/thriftplus.api';
import type { ConsentKind, NewMember } from '../../types/thriftplus.types';

const FIELD: Record<ConsentKind, 'emails_thriftplus' | 'emails_news'> = { thriftplus: 'emails_thriftplus', news: 'emails_news' };

/** A plausible email address (the server makes the final check). */
export function looksLikeEmail(email: string | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email ?? '').trim());
}

/**
 * The two email boxes (T73, email-first): separate, never pre-ticked, the exact words shown, and neither
 * needed to join. The words come from the server, which records the same version.
 */
function EmailBoxes({ value, onChange }: { value: NewMember; onChange: (v: NewMember) => void }) {
  const wording = useQuery({ queryKey: ['thriftplus', 'email-wording'], queryFn: fetchEmailWording, staleTime: Infinity });
  const usable = looksLikeEmail(value.email);
  if (!wording.data) return null;
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
      <Typography variant="subtitle2">Emails (ask; read the words or turn the screen to them)</Typography>
      {wording.data.kinds.map((k) => (
        <FormControlLabel
          key={k.kind}
          sx={{ alignItems: 'flex-start', mt: 0.75, mr: 0 }}
          control={(
            <Checkbox
              sx={{ pt: 0.25 }}
              checked={Boolean(value[FIELD[k.kind]]) && usable}
              disabled={!usable}
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
        {usable ? wording.data.not_required : 'Add an email to offer these.'}
      </Typography>
    </Box>
  );
}

/**
 * A Thrift+ person's signup fields (Dash member service and the register): name, phone, an optional email and
 * its two choices, the ID check and the 18+ flag it allows, a photo, and a blank card. The ID itself is never kept.
 */
export default function PersonFields({ value, onChange }: { value: NewMember; onChange: (v: NewMember) => void }) {
  return (
    <Stack spacing={1.25} sx={{ mt: 1 }}>
      <Stack direction="row" spacing={1}>
        <TextField label="First name" required fullWidth value={value.first_name} onChange={(e) => onChange({ ...value, first_name: e.target.value })} />
        <TextField label="Last name" fullWidth value={value.last_name ?? ''} onChange={(e) => onChange({ ...value, last_name: e.target.value })} />
      </Stack>
      <TextField label="Phone" value={value.phone ?? ''} onChange={(e) => onChange({ ...value, phone: e.target.value })} slotProps={{ htmlInput: { inputMode: 'tel' } }} />
      <TextField
        label="Email (optional)"
        type="email"
        value={value.email ?? ''}
        helperText="For receipts, and the emails they choose below."
        onChange={(e) => {
          const email = e.target.value;
          // A box ticked for an address that no longer looks right is not consent: clear it.
          onChange({ ...value, email, ...(looksLikeEmail(email) ? {} : { emails_thriftplus: false, emails_news: false }) });
        }}
      />
      <EmailBoxes value={value} onChange={onChange} />
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
        Never scan or keep the ID itself: only the name, phone, email, photo and the 18+ flag are stored.
      </Typography>
    </Stack>
  );
}
