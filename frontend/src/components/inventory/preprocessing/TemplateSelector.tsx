import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { Box, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import type { ManifestMatchingTemplate } from '../../../api/inventory.api';
import { preprocessingStep1 } from './preprocessingTokens';

export interface TemplateSaveAsNewProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  /** Shown on the info icon (replaces long inline helper copy). */
  infoTooltip: string;
}

interface TemplateSelectorProps {
  templates: ManifestMatchingTemplate[];
  selectedTemplateId: number | null | undefined;
  disabled?: boolean;
  onSelectTemplateId: (id: number) => void;
  /** When set, replaces the “Matches N templates” caption with an inline Save-as field. */
  saveAsNew?: TemplateSaveAsNewProps;
}

function formatTemplateSubtitle(t: ManifestMatchingTemplate): string {
  const parts: string[] = [];
  if (t.use_count > 0) parts.push(`${t.use_count} session${t.use_count === 1 ? '' : 's'}`);
  if (t.last_used_at) {
    try {
      const d = new Date(t.last_used_at);
      parts.push(`Last used ${d.toLocaleDateString()}`);
    } catch {
      parts.push('Last used');
    }
  } else if (t.use_count === 0) {
    parts.push('Never used');
  }
  return parts.join(' · ');
}

export function TemplateSelector({
  templates,
  selectedTemplateId,
  disabled,
  onSelectTemplateId,
  saveAsNew,
}: TemplateSelectorProps) {
  const selected = templates.find((t) => t.id === selectedTemplateId) ?? templates[0] ?? null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        minWidth: 0,
        flex: '1 1 auto',
        flexWrap: 'wrap',
      }}
    >
      <Typography sx={{ fontSize: 13, color: '#555', fontWeight: 500, flexShrink: 0 }}>
        Template:
      </Typography>
      <Box
        component="select"
        disabled={disabled || !templates.length}
        value={selected?.id != null ? String(selected.id) : ''}
        onChange={(e) => {
          if (e.target.value) onSelectTemplateId(Number(e.target.value));
        }}
        sx={{
          ...preprocessingStep1.templateDropdownBtnSx,
          appearance: 'auto',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 600,
          maxWidth: '100%',
          '&:disabled': {
            color: '#888',
            cursor: 'default',
            opacity: 1,
          },
        }}
      >
        {templates.length ? (
          templates.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
              {t.is_default ? ' (default)' : ''}
              {formatTemplateSubtitle(t) ? ` · ${formatTemplateSubtitle(t)}` : ''}
            </option>
          ))
        ) : (
          <option value="">No matching templates</option>
        )}
      </Box>

      {saveAsNew ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            flexWrap: 'wrap',
            minWidth: 0,
            ml: { xs: 0, md: 'auto' },
          }}
        >
          <Typography sx={{ fontSize: 12, color: '#666', fontWeight: 500, flexShrink: 0 }}>
            Save as:
          </Typography>
          <TextField
            hiddenLabel
            size="small"
            placeholder="Template name"
            value={saveAsNew.value}
            onChange={(e) => saveAsNew.onChange(e.target.value)}
            disabled={saveAsNew.disabled}
            error={saveAsNew.error}
            inputProps={{ 'aria-label': 'New template name' }}
            sx={{
              width: 200,
              maxWidth: 'min(200px, 40vw)',
              '& .MuiOutlinedInput-root': {
                bgcolor: '#fff',
                height: 30,
                fontSize: 13,
              },
              '& .MuiOutlinedInput-input': { py: '6px', px: '10px' },
            }}
          />
          <Tooltip title={saveAsNew.infoTooltip} arrow placement="top">
            <IconButton
              size="small"
              aria-label="About saving as a new template"
              sx={{ color: '#888', p: 0.35 }}
            >
              <InfoOutlined sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
        <Typography sx={{ fontSize: 10, color: '#888', display: { xs: 'none', sm: 'block' }, ml: { md: 'auto' } }}>
          {templates.length
            ? `Matches ${templates.length} template${templates.length === 1 ? '' : 's'}`
            : 'No saved template match'}
        </Typography>
      )}
    </Box>
  );
}
