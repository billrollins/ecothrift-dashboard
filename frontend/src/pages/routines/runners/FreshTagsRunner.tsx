import { Box, Button, TextField, Typography } from '@mui/material';
import type { FreshTagItem, FreshTagsResponses } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { useAuth } from '../../../hooks/useAuth';
import { t, type AppLanguage } from '../../../i18n/routines';
import { RunnerBand, RunnerBody, RunnerCard, RunnerHead, runnerFieldSx } from './runnerParts';
import {
  answerFreshItem,
  freshItemMisses,
  freshTagMisses,
  freshTagsChecked,
  hasTagRetail,
  isFreshItemChecked,
} from './freshTags';

type Tone = 'pass' | 'fail' | 'na';
type Option<V extends string> = { value: V; label: string; tone: Tone };

const money = (v: string | null | undefined) => (v == null || v === '' ? '-' : `$${Number(v).toFixed(2)}`);

/** "Tue, Oct 20" in the runner's language; '' when the day is unknown. */
export function freshDayLabel(day: string | null | undefined, lang: AppLanguage): string {
  if (!day) return '';
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "4 of 10 checked · 2 to PR Fix-it". */
export function freshProgressLabel(responses: FreshTagsResponses, lang: AppLanguage): string {
  const total = responses.items.length;
  const base = t('freshProgress', lang)
    .replace('{done}', String(freshTagsChecked(responses)))
    .replace('{total}', String(total));
  const misses = freshTagMisses(responses);
  return misses ? `${base} · ${misses} ${t('freshToFixit', lang)}` : base;
}

/**
 * The daily fresh-tag check: ten items tagged on the last processing day, drawn by the
 * server. Find each one, then say whether the tag is this item, the retail is believable,
 * and the price is right. Submitting turns every miss into a bad tag on PR Fix-it.
 */
export function FreshTagsRunner({
  title,
  subject,
  responses,
  onChange,
  readOnly,
}: {
  title: string;
  subject: string;
  responses: FreshTagsResponses;
  onChange?: (next: FreshTagsResponses) => void;
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const lang: AppLanguage = user?.language === 'es' ? 'es' : 'en';
  const items = responses.items ?? [];
  const safe: FreshTagsResponses = { ...responses, items };
  const day = freshDayLabel(responses.checked_in_day, lang);
  const checked = freshTagsChecked(safe);

  function answer(itemId: number, patch: Parameters<typeof answerFreshItem>[2]) {
    onChange?.(answerFreshItem(safe, itemId, patch));
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: dutyColors.paper }}>
      <RunnerHead
        title={title}
        subject={day ? t('freshTaggedOn', lang).replace('{day}', day) : subject}
        progress={items.length ? checked / items.length : 1}
        progressLabel={items.length ? freshProgressLabel(safe, lang) : t('freshNothing', lang)}
      />
      <RunnerBody>
        <RunnerBand title={t('freshBand', lang)} hint={t('freshBandHint', lang)} />
        {items.length ? items.map((row) => (
          <FreshItemCard
            key={row.item_id}
            row={row}
            lang={lang}
            readOnly={readOnly}
            onAnswer={(patch) => answer(row.item_id, patch)}
          />
        )) : (
          <RunnerCard>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: dutyColors.ink }}>
              {t('freshNothing', lang)}
            </Typography>
            <Typography sx={{ fontSize: 13, color: dutyColors.ink60, mt: 0.5 }}>
              {t('freshNothingHint', lang)}
            </Typography>
          </RunnerCard>
        )}
      </RunnerBody>
    </Box>
  );
}

function FreshItemCard({
  row,
  lang,
  readOnly,
  onAnswer,
}: {
  row: FreshTagItem;
  lang: AppLanguage;
  readOnly?: boolean;
  onAnswer: (patch: Parameters<typeof answerFreshItem>[2]) => void;
}) {
  const found = row.found === 'yes';
  const retail = hasTagRetail(row);
  const misses = freshItemMisses(row).length;
  const tone = misses ? 'warn' : isFreshItemChecked(row) && found ? 'good' : 'plain';
  const asked = !readOnly && found;

  return (
    <RunnerCard tone={tone}>
      <Box sx={{ opacity: row.found === 'no' ? 0.62 : 1 }}>
        <Typography
          noWrap
          sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: dutyColors.ink40 }}
        >
          {row.location || t('freshNoLocation', lang)} · {row.sku}
        </Typography>
        <Typography
          sx={{
            fontSize: 15.5,
            fontWeight: 500,
            lineHeight: 1.3,
            color: dutyColors.ink,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: '2.6em',
          }}
        >
          {row.title}
        </Typography>
        <Typography noWrap sx={{ fontSize: 12.5, color: dutyColors.ink60, minHeight: 18 }}>
          {row.brand || ' '}
        </Typography>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: dutyColors.ink, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
          {t('freshTag', lang)}: {money(row.price)}
          <Box component="span" sx={{ fontWeight: 500, color: dutyColors.ink60 }}>
            {' · '}
            {retail ? `${t('freshRetailWord', lang)} ${money(row.tag_retail)}` : t('freshNoRetail', lang)}
          </Box>
        </Typography>
      </Box>

      <AnswerButtons
        label={t('freshFoundQuestion', lang)}
        value={row.found}
        disabled={readOnly}
        options={[
          { value: 'yes', label: t('freshFound', lang), tone: 'pass' },
          { value: 'no', label: t('freshNotFound', lang), tone: 'na' },
        ]}
        onChange={(value) => onAnswer({ found: value })}
      />
      {/* Always drawn, dimmed until "Found it", so a tap never pushes the next card down. */}
      <Box sx={{ opacity: found ? 1 : 0.45 }} aria-disabled={!found}>
        <AnswerButtons
          label={t('freshMatch', lang)}
          value={row.match}
          disabled={!asked}
          options={[
            { value: 'pass', label: t('freshYes', lang), tone: 'pass' },
            { value: 'fail', label: t('freshNo', lang), tone: 'fail' },
          ]}
          onChange={(value) => onAnswer({ match: value })}
        />
        <AnswerButtons
          label={t('freshRetail', lang)}
          value={row.retail_ok}
          disabled={!asked}
          options={[
            { value: 'pass', label: t('freshYes', lang), tone: 'pass' },
            { value: 'fail', label: t('freshNo', lang), tone: 'fail' },
            { value: 'na', label: t('na', lang), tone: 'na' },
          ]}
          lockedTo={retail ? undefined : 'na'}
          onChange={(value) => onAnswer({ retail_ok: value })}
        />
        <AnswerButtons
          label={t('freshPrice', lang)}
          value={row.price_ok}
          disabled={!asked}
          options={[
            { value: 'pass', label: t('freshRight', lang), tone: 'pass' },
            { value: 'high', label: t('freshTooHigh', lang), tone: 'fail' },
            { value: 'low', label: t('freshTooLow', lang), tone: 'fail' },
          ]}
          onChange={(value) => onAnswer({ price_ok: value })}
        />
      </Box>
      <TextField
        value={row.note}
        onChange={(event) => onAnswer({ note: event.target.value.slice(0, 300) })}
        disabled={readOnly}
        placeholder={t('freshNote', lang)}
        size="small"
        fullWidth
        sx={{ ...runnerFieldSx, mt: 1.25 }}
        inputProps={{ 'aria-label': `${t('freshNote', lang)} ${row.sku}` }}
      />
    </RunnerCard>
  );
}

/** A labelled row of big answer buttons (the same look as Pass / Fail on a checklist). */
function AnswerButtons<V extends string>({
  label,
  value,
  options,
  disabled,
  lockedTo,
  onChange,
}: {
  label: string;
  value: V | '';
  options: Option<V>[];
  disabled?: boolean;
  /** Only this answer makes sense (no retail on the tag: n.a.). */
  lockedTo?: V;
  onChange: (next: V) => void;
}) {
  return (
    <Box sx={{ mt: 1.25 }} role="group" aria-label={label}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: dutyColors.ink60 }}>{label}</Typography>
      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
        {options.map((option) => {
          const active = value === option.value;
          const bg = !active
            ? '#fff'
            : option.tone === 'pass'
              ? dutyColors.green
              : option.tone === 'fail'
                ? dutyColors.red
                : dutyColors.ink15;
          const color = !active ? dutyColors.ink60 : option.tone === 'na' ? dutyColors.ink : '#fff';
          const off = disabled || (lockedTo != null && option.value !== lockedTo);
          return (
            <Button
              key={option.value}
              onClick={() => onChange(option.value)}
              disabled={off}
              aria-pressed={active}
              sx={{
                flex: 1,
                minWidth: 0,
                height: 44,
                px: 0.5,
                borderRadius: '10px',
                border: `1.5px solid ${active ? 'transparent' : dutyColors.ink15}`,
                bgcolor: bg,
                color,
                fontWeight: 700,
                fontSize: 14,
                lineHeight: 1.15,
                textTransform: 'none',
                boxShadow: active ? '0 2px 8px rgba(29,36,64,0.16)' : 'none',
                '&:hover': { bgcolor: bg, borderColor: active ? 'transparent' : dutyColors.ink40 },
                '&:disabled': { bgcolor: bg, color, opacity: active ? 0.85 : 0.6 },
              }}
            >
              {option.label}
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}
