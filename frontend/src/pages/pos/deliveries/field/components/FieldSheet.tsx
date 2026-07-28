import { Box, Drawer, IconButton, Stack, Typography } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { ecoField } from '../ecoFieldTheme';

type Props = {
  open: boolean;
  title?: string;
  eyebrow?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Tighter chrome/padding for forms that should fit without scrolling. */
  compact?: boolean;
};

export function FieldSheet({ open, title, eyebrow, onClose, children, compact }: Props) {
  const hasHeaderCopy = Boolean(eyebrow || title);

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          maxWidth: 430,
          mx: 'auto',
          borderRadius: '26px 26px 0 0',
          px: compact ? 1.75 : 2,
          pt: compact ? 0.75 : 1,
          pb: `calc(${compact ? 12 : 20}px + env(safe-area-inset-bottom))`,
          maxHeight: '88dvh',
          boxShadow: ecoField.sheetShadow,
        },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 4,
          borderRadius: 99,
          bgcolor: '#DCE3DF',
          mx: 'auto',
          mb: compact ? 0.75 : 1.5,
        }}
      />
      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        spacing={1}
        sx={{ minHeight: hasHeaderCopy ? undefined : 40 }}
      >
        {hasHeaderCopy ? (
          <Box sx={{ minWidth: 0, flex: 1 }}>
            {eyebrow && (
              <Typography
                variant="caption"
                fontWeight={800}
                sx={{ color: ecoField.muted, letterSpacing: '.12em', textTransform: 'uppercase' }}
              >
                {eyebrow}
              </Typography>
            )}
            {title && (
              <Typography variant="h6" fontWeight={800}>
                {title}
              </Typography>
            )}
          </Box>
        ) : (
          <Box sx={{ flex: 1 }} />
        )}
        <IconButton onClick={onClose} aria-label="Close" size={compact ? 'small' : 'medium'}>
          <CloseRounded />
        </IconButton>
      </Stack>
      {/* pt keeps outlined TextField labels from clipping under overflow */}
      <Box
        sx={{
          overflowY: 'auto',
          mt: hasHeaderCopy ? (compact ? 0.5 : 1) : 0,
          pt: 1.25,
          mx: -0.25,
          px: 0.25,
        }}
      >
        {children}
      </Box>
    </Drawer>
  );
}
