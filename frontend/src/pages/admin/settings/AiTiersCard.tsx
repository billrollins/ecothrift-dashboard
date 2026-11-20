import {
  Box,
  Card,
  CardContent,
  ListSubheader,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
  AI_EFFORTS,
  EFFORT_LABEL,
  PROVIDER_LABEL,
  type AiActionRow,
  type AiCatalogModel,
  type AiEffort,
  type AiTier,
} from '../../../api/aiSettings.api';
import { useUpdateAiTier } from '../../../hooks/useAiSettings';
import { formatApiError } from '../labelStudio/labelStudioUtils';
import { plain, usd } from './aiFormat';

// Model | Perf | Cost per task | price per 1M (in / out)
const GRID = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 56px 76px 110px', columnGap: 1.5, alignItems: 'baseline', width: '100%' };

/** Best first: Artificial Analysis Intelligence Index high to low, models without a score last (by name). */
export function byPerf(a: AiCatalogModel, b: AiCatalogModel): number {
  const pa = a.aa_intelligence == null ? -1 : Number(a.aa_intelligence);
  const pb = b.aa_intelligence == null ? -1 : Number(b.aa_intelligence);
  return pb - pa || (a.label || a.slug).localeCompare(b.label || b.slug);
}

function price(m: AiCatalogModel): string {
  if (m.modality === 'image') return m.image_price != null ? `${usd(m.image_price)} / image` : '—';
  return m.input_price != null && m.output_price != null ? `${usd(m.input_price)} / ${usd(m.output_price)}` : '—';
}

function ModelLine({ m }: { m: AiCatalogModel }) {
  return (
    <Box sx={GRID}>
      <Typography variant="body2" noWrap>
        {m.label || m.slug}{' '}
        <Typography component="span" variant="caption" color="text.secondary">{PROVIDER_LABEL[m.provider]}</Typography>
      </Typography>
      <Typography variant="body2" align="right" sx={{ fontWeight: 600 }}>{plain(m.aa_intelligence)}</Typography>
      <Typography variant="body2" align="right">{m.aa_task_cost != null ? usd(m.aa_task_cost) : '—'}</Typography>
      <Typography variant="caption" align="right" color="text.secondary">{price(m)}</Typography>
    </Box>
  );
}

/** The tier map: Fast, Standard, Best (text) and Image, each one model and one effort. */
export function AiTiersCard({ tiers, models, actions }: { tiers: AiTier[]; models: AiCatalogModel[]; actions: AiActionRow[] }) {
  const { enqueueSnackbar } = useSnackbar();
  const update = useUpdateAiTier();

  const save = async (tier: AiTier, data: { model?: number | null; effort?: AiEffort }) => {
    try {
      await update.mutateAsync({ key: tier.key, data });
      enqueueSnackbar(`Saved ${tier.label}`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(formatApiError(err, 'Could not save.'), { variant: 'error' });
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>Tiers</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 110 }}>Tier</TableCell>
              <TableCell>Model</TableCell>
              <TableCell sx={{ width: 190 }}>Effort</TableCell>
              <TableCell align="right" sx={{ width: 90 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tiers.map((tier) => {
              const options = models.filter((m) => m.status === 'active' && m.modality === tier.modality).sort(byPerf);
              const used = actions.filter((a) => a.tier === tier.key).length;
              const byId = new Map(options.map((m) => [String(m.id), m]));
              return (
                <TableRow key={tier.key}>
                  <TableCell sx={{ fontWeight: 600 }}>{tier.label}</TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      value={tier.model == null ? '' : String(tier.model)}
                      error={tier.model == null}
                      disabled={update.isPending}
                      inputProps={{ 'aria-label': `${tier.label} model` }}
                      SelectProps={{
                        displayEmpty: true,
                        renderValue: (v) => {
                          const m = byId.get(String(v));
                          return m ? <ModelLine m={m} /> : `Not set: uses ${tier.env_model}`;
                        },
                        MenuProps: { PaperProps: { sx: { maxHeight: 480 } } },
                      }}
                      onChange={(e) => void save(tier, { model: e.target.value === '' ? null : Number(e.target.value) })}
                    >
                      {tier.modality === 'text' && (
                        <ListSubheader sx={{ lineHeight: 2.5 }}>
                          <Box sx={GRID}>
                            <span>Model</span>
                            <Box component="span" sx={{ textAlign: 'right' }}>Perf</Box>
                            <Box component="span" sx={{ textAlign: 'right' }}>Cost/task</Box>
                            <Box component="span" sx={{ textAlign: 'right' }}>$ per 1M in / out</Box>
                          </Box>
                        </ListSubheader>
                      )}
                      <MenuItem value="">Not set: uses {tier.env_model}</MenuItem>
                      {options.map((m) => (
                        <MenuItem key={m.id} value={String(m.id)}>
                          <ModelLine m={m} />
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      value={tier.effort}
                      disabled={tier.modality === 'image' || update.isPending}
                      inputProps={{ 'aria-label': `${tier.label} effort` }}
                      onChange={(e) => void save(tier, { effort: e.target.value as AiEffort })}
                    >
                      {AI_EFFORTS.map((eff) => (
                        <MenuItem key={eff} value={eff}>{EFFORT_LABEL[eff]}</MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell align="right">{used}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
