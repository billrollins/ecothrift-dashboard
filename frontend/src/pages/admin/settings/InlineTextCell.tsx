import { Box, InputBase, Typography } from '@mui/material';
import { useState } from 'react';
import { IconEdit as EditOutlined } from '../../../icons/ecoIcons';

/**
 * Click-to-edit text in a table cell (Settings > AI): plain text with a dotted underline until clicked, then a small
 * borderless input. Saves on blur or Enter (only when changed); Escape cancels. ``onSave`` rejects to undo.
 */
export function InlineTextCell({
  value,
  onSave,
  label,
  placeholder = 'set',
  mono = false,
  caption = false,
}: {
  value: string;
  onSave: (next: string) => Promise<unknown>;
  label: string;
  placeholder?: string;
  mono?: boolean;
  caption?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const font = { fontFamily: mono ? 'monospace' : undefined, fontSize: caption ? 12 : mono ? 13 : 14 };

  const save = async () => {
    setEditing(false);
    const next = draft.trim();
    if (next === value) return;
    try {
      await onSave(next);
    } catch {
      setDraft(value);
    }
  };

  if (editing) {
    return (
      <InputBase
        autoFocus
        fullWidth
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        inputProps={{ 'aria-label': label, style: { padding: 0, ...font } }}
        sx={{ borderBottom: 1, borderColor: 'primary.main' }}
      />
    );
  }

  return (
    <Box
      component="button"
      type="button"
      aria-label={`Edit ${label}`}
      onClick={() => { setDraft(value); setEditing(true); }}
      sx={{
        all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.5, maxWidth: '100%',
        borderBottom: '1px dashed', borderColor: 'divider', lineHeight: 1.4,
        '& .pencil': { opacity: 0 }, '&:hover .pencil, &:focus-visible .pencil': { opacity: 0.6 },
        '&:hover, &:focus-visible': { borderColor: 'primary.main' },
      }}
    >
      <Typography component="span" color={value ? (caption ? 'text.secondary' : 'text.primary') : 'text.disabled'}
        sx={{ ...font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || placeholder}
      </Typography>
      <EditOutlined className="pencil" sx={{ fontSize: 14 }} />
    </Box>
  );
}
