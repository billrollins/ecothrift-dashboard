import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { studio } from '../tars/studio/tarsStudioTheme';
import {
  ATTENTION_KEYS,
  ATTENTION_LABELS,
  type AttentionKey,
} from './partsBoard';
import { ATTENTION_COLOR, STRIP_HEIGHT } from './partsChrome';

export function PartsAttentionStrip({
  counts,
  active,
  onToggle,
}: {
  counts: Record<AttentionKey, number>;
  active: AttentionKey | '';
  onToggle: (key: AttentionKey) => void;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        minHeight: STRIP_HEIGHT,
        flexShrink: 0,
        bgcolor: studio.panel,
        border: `1.5px solid ${studio.panelBorder}`,
        borderRadius: `${studio.radius.lg}px`,
        boxShadow: studio.panelShadow,
        overflow: 'hidden',
      }}
    >
      {ATTENTION_KEYS.map((key, index) => {
        const count = counts[key];
        const selected = active === key;
        const hot = count > 0;
        const color = hot ? ATTENTION_COLOR[key] : studio.inkFaint;
        return (
          <ButtonBase
            key={key}
            onClick={() => onToggle(key)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'center',
              minHeight: STRIP_HEIGHT,
              minWidth: 0,
              px: 1.5,
              textAlign: 'left',
              borderLeft: index === 0 ? 0 : `1px solid ${studio.rule}`,
              bgcolor: selected ? `${color}12` : 'transparent',
              boxShadow: selected ? `inset 0 -3px 0 ${color}` : 'none',
            }}
          >
            <Typography
              sx={{
                fontSize: '0.62rem',
                fontWeight: 800,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                color,
                minHeight: 14,
              }}
            >
              {ATTENTION_LABELS[key]}
            </Typography>
            <Typography
              sx={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: '1.35rem',
                fontWeight: 800,
                lineHeight: 1.15,
                fontVariantNumeric: 'tabular-nums',
                color: hot ? studio.ink : studio.inkFaint,
                minHeight: 26,
              }}
            >
              {count}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
