import { Box, Button, Stack, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import type { StepCompletionControl } from '../fieldStepSurface';
import { ecoField, ecoFieldPrimaryButtonSx, ecoFieldSecondaryOutlineSx } from '../ecoFieldTheme';

type Props = {
  /** Compact counts / title line above the list. */
  header?: React.ReactNode;
  children: React.ReactNode;
  /**
   * Preferred completion control: action (transition), reopen (local), or locked label.
   * Legacy primaryLabel/onPrimary still work when `completion` is omitted.
   */
  completion?: StepCompletionControl;
  onCompletionAction?: () => void;
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  showChevron?: boolean;
  /** Compact secondary only for domain actions (e.g. truck photos), never Edit. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
  secondaryIcon?: React.ReactNode;
  /** Extra controls above the primary footer (e.g. truck photo thumbs). */
  footerExtra?: React.ReactNode;
};

/**
 * Shared summary layout: scrollable card list + optional sticky transition control.
 * No instructional banners. Summary-only Edit / Open Cards footers are not supported.
 */
export function FieldStepSummaryShell({
  header,
  children,
  completion,
  onCompletionAction,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryBusy,
  showChevron = true,
  secondaryLabel,
  onSecondary,
  secondaryDisabled,
  secondaryIcon,
  footerExtra,
}: Props) {
  const mode = completion?.mode ?? 'action';
  const label = completion?.label ?? primaryLabel;
  const actionHandler = onCompletionAction ?? onPrimary;
  const showActionButton = Boolean(label && actionHandler && mode !== 'locked');
  const showLockedLabel = Boolean(label && mode === 'locked');
  const showFooter =
    Boolean(footerExtra) ||
    Boolean(secondaryLabel && onSecondary) ||
    showActionButton ||
    showLockedLabel;

  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <Box sx={{ px: 2, pt: 2, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {header != null && (
          <Box sx={{ mb: 1.5 }}>
            {typeof header === 'string' ? (
              <Typography variant="body2" fontWeight={800}>
                {header}
              </Typography>
            ) : (
              header
            )}
          </Box>
        )}
        {children}
      </Box>
      {showFooter && (
        <Box
          sx={{
            px: 2,
            pt: 1.25,
            // Safe-area lives on FieldStepRail (bottom-most chrome).
            pb: 1,
            borderTop: `1px solid ${ecoField.line}`,
            bgcolor: 'rgba(255,255,255,.98)',
            flexShrink: 0,
          }}
        >
          <Stack spacing={1}>
            {footerExtra}
            {secondaryLabel && onSecondary && (
              <Button
                fullWidth
                variant="outlined"
                disabled={secondaryDisabled || primaryBusy}
                startIcon={secondaryIcon}
                onClick={onSecondary}
                sx={{ ...ecoFieldSecondaryOutlineSx, minHeight: 48 }}
              >
                {secondaryLabel}
              </Button>
            )}
            {showLockedLabel && (
              <Box
                sx={{
                  minHeight: 48,
                  borderRadius: 2,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: ecoField.tint,
                  border: `1.5px solid ${ecoField.green}`,
                  color: ecoField.greenDeep,
                  fontWeight: 800,
                }}
              >
                {label}
              </Box>
            )}
            {showActionButton && (
              <Button
                fullWidth
                variant={mode === 'reopen' ? 'outlined' : 'contained'}
                disabled={primaryDisabled || primaryBusy}
                onClick={actionHandler}
                sx={
                  mode === 'reopen'
                    ? { ...ecoFieldSecondaryOutlineSx, minHeight: 48 }
                    : ecoFieldPrimaryButtonSx
                }
              >
                {label}
                {mode === 'action' && showChevron ? <ChevronRightRounded /> : null}
              </Button>
            )}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
