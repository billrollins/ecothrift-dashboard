import { useState, type ReactNode, type KeyboardEvent, type MouseEvent } from 'react';
import {
  Box,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import LocalPhone from '@mui/icons-material/LocalPhone';
import Place from '@mui/icons-material/Place';
import Schedule from '@mui/icons-material/Schedule';
import { format, isValid, parseISO } from 'date-fns';
import type { DayBoardStage, DeliveryDayCardModel } from './dayBoardUtils';
import { formatMoney } from './dayBoardUtils';
import { formatPhone } from '../../../utils/formatPhone';
import { confirmationChip, telHref } from './driverWizardUtils';

function timeLabel(iso?: string | null): string {
  if (!iso) return '';
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'h:mm a') : '';
}

function statusChip(card: DeliveryDayCardModel, stage: DayBoardStage) {
  if (card.stop_state === 'rescheduled') return { label: 'Rescheduled', color: 'default' as const };
  if (card.job_status === 'cancelled') return { label: 'Cancelled', color: 'default' as const };
  if (card.stop_state === 'completed' || card.job_status === 'completed') {
    return { label: 'Completed', color: 'success' as const };
  }
  if (card.stop_state === 'failed') return { label: 'Failed', color: 'error' as const };
  if (card.stop_state === 'on_hold') return { label: 'On hold', color: 'warning' as const };
  if (card.is_next_up) return { label: 'Next up', color: 'primary' as const };
  if (stage !== 'initial' && card.stop) {
    return confirmationChip(card.stop);
  }
  if (card.job_status === 'needs_scheduling') return { label: 'Needs scheduling', color: 'warning' as const };
  return { label: card.job_status, color: 'info' as const };
}

type Props = {
  card: DeliveryDayCardModel;
  stage: DayBoardStage;
  indexLabel: string;
  emphasized?: boolean;
  phaseActions?: ReactNode;
  onOpen: () => void;
};

export function DeliveryDayCard({
  card,
  stage,
  indexLabel,
  emphasized,
  phaseActions,
  onOpen,
}: Props) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const chip = statusChip(card, stage);
  const eta = timeLabel(card.eta_arrive_at);
  const etaEnd = timeLabel(card.eta_window_end_at);
  const phoneLabel = formatPhone(card.phone) || card.phone || '—';

  const openFromKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  const stopProp = (e: MouseEvent) => {
    e.stopPropagation();
  };

  const phoneLink = (
    <Box
      component="a"
      href={telHref(card.phone)}
      onClick={stopProp}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.6,
        color: 'primary.main',
        textDecoration: 'none',
        minHeight: 36,
        fontWeight: 700,
        fontSize: '0.95rem',
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        '&:hover': { textDecoration: 'underline' },
      }}
    >
      <LocalPhone sx={{ fontSize: 18 }} />
      {phoneLabel}
    </Box>
  );

  const metaChips = (
    <Stack
      direction="row"
      spacing={0.75}
      useFlexGap
      flexWrap="wrap"
      alignItems="center"
      justifyContent={{ md: 'flex-end' }}
    >
      {eta && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35, whiteSpace: 'nowrap' }}
        >
          <Schedule sx={{ fontSize: 14 }} />
          ETA {eta}
          {etaEnd ? `–${etaEnd}` : ''}
        </Typography>
      )}
      {card.fee ? <Chip size="small" variant="outlined" label={formatMoney(card.fee)} /> : null}
      {card.loaded && <Chip size="small" color="success" variant="outlined" label="Loaded" />}
      {card.secured && <Chip size="small" color="success" variant="outlined" label="Secured" />}
    </Stack>
  );

  return (
    <Paper
      variant="outlined"
      role="button"
      tabIndex={0}
      aria-label={`Open delivery for ${card.customer_name}`}
      onClick={onOpen}
      onKeyDown={openFromKey}
      sx={{
        overflow: 'hidden',
        cursor: 'pointer',
        borderWidth: emphasized ? 2 : 1,
        borderColor: emphasized ? 'primary.main' : 'divider',
        bgcolor: emphasized ? 'action.selected' : 'background.paper',
        opacity: card.group === 'completed' || card.group === 'rescheduled' ? 0.88 : 1,
        '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <Box sx={{ p: { xs: 1.5, md: 2 } }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 1, md: 2 }}
          justifyContent="space-between"
          alignItems={{ md: 'stretch' }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.35, minWidth: 0 }}>
              <Chip size="small" label={indexLabel} sx={{ flexShrink: 0 }} />
              <Typography
                variant="subtitle1"
                fontWeight={800}
                noWrap
                sx={{ flex: 1, minWidth: 0 }}
              >
                {card.customer_name}
              </Typography>
              <Chip size="small" color={chip.color} label={chip.label} sx={{ flexShrink: 0 }} />
            </Stack>

            <Stack spacing={0.15} sx={{ mb: 0.25 }}>
              {(card.line_items.length > 0
                ? card.line_items
                : [
                    {
                      line_id: null,
                      description: card.items_delivered,
                      sku: '',
                      quantity: 1,
                      scannable: false,
                    },
                  ]
              ).map((it, idx) => (
                <Typography
                  key={`${it.line_id ?? 'd'}-${idx}`}
                  variant="body2"
                  fontWeight={700}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
                >
                  {it.scan_verified ? (
                    <CheckCircle color="success" sx={{ fontSize: 16, flexShrink: 0 }} />
                  ) : null}
                  <Box component="span" sx={{ minWidth: 0 }}>
                    {it.quantity > 1 ? `${it.quantity}× ` : ''}
                    {it.description}
                    {it.sku ? (
                      <Typography component="span" variant="caption" color="text.secondary">
                        {' '}
                        · {it.sku}
                      </Typography>
                    ) : null}
                  </Box>
                </Typography>
              ))}
            </Stack>

            <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ mt: 0.35, minWidth: 0 }}>
              <Place sx={{ fontSize: 16, color: 'text.secondary', mt: 0.25, flexShrink: 0 }} />
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  minWidth: 0,
                  flex: 1,
                  whiteSpace: { xs: 'nowrap', md: 'normal' },
                  overflow: { xs: 'hidden', md: 'visible' },
                  textOverflow: { xs: 'ellipsis', md: 'clip' },
                }}
              >
                {card.address || '—'}
              </Typography>
              {card.address_corrected && (
                <Chip size="small" color="warning" variant="outlined" label="Corrected" sx={{ flexShrink: 0 }} />
              )}
            </Stack>

            {/* Mobile: phone on its own row so it isn't squeezed beside fee chips */}
            <Stack
              direction="row"
              spacing={1.25}
              alignItems="center"
              useFlexGap
              flexWrap="wrap"
              sx={{ mt: 0.75, display: { xs: 'flex', md: 'none' } }}
            >
              {phoneLink}
              {metaChips}
            </Stack>

            {card.notes ? (
              <Typography
                component="button"
                type="button"
                variant="caption"
                color="text.secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  setNotesExpanded((v) => !v);
                }}
                sx={{
                  mt: 0.5,
                  p: 0,
                  border: 0,
                  background: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: '-webkit-box',
                  WebkitLineClamp: notesExpanded ? 'unset' : 1,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  width: '100%',
                  font: 'inherit',
                  color: 'text.secondary',
                }}
              >
                Notes: {card.notes}
                {!notesExpanded && card.notes.length > 48 ? ' · tap' : ''}
              </Typography>
            ) : null}
          </Box>

          {/* Desktop: contact / fee column uses the empty right side */}
          <Stack
            spacing={0.75}
            alignItems="flex-end"
            justifyContent="flex-start"
            sx={{
              display: { xs: 'none', md: 'flex' },
              flexShrink: 0,
              minWidth: 188,
              maxWidth: 240,
              pl: 1.5,
              borderLeft: 1,
              borderColor: 'divider',
            }}
          >
            {phoneLink}
            {metaChips}
          </Stack>
        </Stack>
      </Box>

      {phaseActions ? (
        <Box
          onClick={stopProp}
          onKeyDown={(e) => e.stopPropagation()}
          sx={{
            px: { xs: 1.5, md: 2 },
            pb: 1.5,
            pt: 0,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover',
          }}
        >
          {phaseActions}
        </Box>
      ) : null}
    </Paper>
  );
}
