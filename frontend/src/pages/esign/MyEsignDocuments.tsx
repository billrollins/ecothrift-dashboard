/**
 * HR > Requests, "Documents to sign" (Dash Updates #62; adapted from Dark Horse's My Docs list, D22): what is mine to
 * sign now, what waits on others, and what is signed, with the signed copy. Everyone sees their own; nothing shows
 * until something has been sent to them. English and Spanish, like the rest of the tab (the signing screens
 * themselves are the shared package's, in English).
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Stack, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { downloadSignedPdf, errText, listMine, type MyDocument } from '@/esign/api';
import { useLanguage } from '../../i18n/useLanguage';

const COPY = {
  title: { en: 'Documents to sign', es: 'Documentos para firmar' },
  toSign: { en: 'To sign', es: 'Por firmar' },
  waiting: { en: 'Waiting on others', es: 'Esperando a otros' },
  signed: { en: 'Signed', es: 'Firmados' },
  readSign: { en: 'Read and sign', es: 'Leer y firmar' },
  copy: { en: 'Signed copy', es: 'Copia firmada' },
  sent: { en: 'Sent', es: 'Enviado' },
  allSigned: { en: 'Everyone signed', es: 'Todos firmaron' },
  youSigned: { en: 'You signed', es: 'Firmaste' },
  waitingOn: { en: 'waiting on', es: 'esperando a' },
  first: { en: 'first', es: 'primero' },
  others: { en: 'others', es: 'otros' },
  loadFailed: { en: 'Your documents did not load.', es: 'Tus documentos no cargaron.' },
} satisfies Record<string, { en: string; es: string }>;

export const MY_ESIGN_KEY = ['esign', 'mine'] as const;

export default function MyEsignDocuments() {
  const lang = useLanguage();
  const t = (key: keyof typeof COPY) => COPY[key][lang];
  const day = (iso: string | null) => (iso ? format(parseISO(iso), 'MMM d, yyyy', lang === 'es' ? { locale: esLocale } : undefined) : '');
  const navigate = useNavigate();
  const mine = useQuery({ queryKey: MY_ESIGN_KEY, queryFn: listMine });
  const docs = mine.data ?? [];
  if (mine.isError) return <Alert severity="warning">{errText(mine.error, t('loadFailed'))}</Alert>;
  if (!docs.length) return null;

  const line = (d: MyDocument) => {
    const on = d.waiting_on ?? t('others');
    if (d.my_turn) return `${t('sent')} ${day(d.sent_at)}`;
    if (d.status === 'signed' || d.status === 'ended') return `${t('allSigned')} ${day(d.completed_at)}`;
    if (d.my_status === 'signed') return `${t('youSigned')} ${day(d.signed_at)} · ${t('waitingOn')} ${on}`;
    return `${t('waitingOn')} ${on} ${t('first')}`.replace(/^./, (c) => c.toUpperCase());
  };
  const groups: [string, MyDocument[]][] = [
    [t('toSign'), docs.filter((d) => d.my_turn)],
    [t('waiting'), docs.filter((d) => !d.my_turn && d.status === 'out')],
    [t('signed'), docs.filter((d) => d.status === 'signed' || d.status === 'ended')],
  ];
  const toSign = groups[0][1].length;

  return (
    <Card variant="outlined" data-testid="my-esign">
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
          {toSign ? `${t('title')} (${toSign})` : t('title')}
        </Typography>
        {groups.filter(([, rows]) => rows.length).map(([title, rows]) => (
          <Box key={title} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="overline" color="text.secondary">{title}</Typography>
              <Chip size="small" label={rows.length} />
            </Stack>
            {rows.map((d, i) => (
              <Box key={d.party} data-testid={`esign-${d.party}`}>
                {i ? <Divider /> : null}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={700}>{d.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{line(d)}</Typography>
                  </Box>
                  {d.my_turn ? <Button variant="contained" onClick={() => navigate(`/hr/sign/${d.party}`)}>{t('readSign')}</Button> : null}
                  {!d.my_turn && d.has_pdf ? (
                    <Button onClick={() => void downloadSignedPdf(d.envelope, `${d.title}.pdf`)}>{t('copy')}</Button>
                  ) : null}
                </Stack>
              </Box>
            ))}
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}
