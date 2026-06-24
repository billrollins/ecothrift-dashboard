import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TARS_EXECUTE_VERBS, TARS_SOURCE_COLORS, TARS_VERB_META } from './tarsConstants';
import { fmtUsd } from './tarsProfit';
import { useTarsMock } from './TarsMockStore';
import { TarsEvaluationSection } from './TarsEvaluationSection';
import type { TarsExecuteVerb, TarsItem } from './tarsTypes';

function SourceChip({ source }: { source: TarsItem['source'] }) {
  return (
    <Chip
      label={source}
      size="small"
      sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: TARS_SOURCE_COLORS[source], color: '#fff' }}
    />
  );
}

export function TarsExecutePanel() {
  const navigate = useNavigate();
  const { executingItems, completeJob, focusEvaluationItem } = useTarsMock();
  const [verbTab, setVerbTab] = useState<TarsExecuteVerb>('Repair');

  const filtered = useMemo(
    () => executingItems.filter((i) => i.chosen?.verb === verbTab),
    [executingItems, verbTab],
  );

  const counts = useMemo(() => {
    const map: Record<TarsExecuteVerb, number> = { Test: 0, Assemble: 0, Repair: 0, Salvage: 0 };
    for (const it of executingItems) {
      const v = it.chosen?.verb;
      if (v && v in map) map[v as TarsExecuteVerb] += 1;
    }
    return map;
  }, [executingItems]);

  useEffect(() => {
    const verb = focusEvaluationItem?.chosen?.verb;
    if (verb && TARS_EXECUTE_VERBS.includes(verb as TarsExecuteVerb)) {
      setVerbTab(verb as TarsExecuteVerb);
    }
  }, [focusEvaluationItem?.sku, focusEvaluationItem?.chosen?.verb]);

  const evalSku =
    focusEvaluationItem?.stage === 'executing' || focusEvaluationItem?.stage === 'workstation'
      ? focusEvaluationItem.sku
      : null;

  return (
    <Box>
      <Card variant="outlined" sx={{ mb: 3, borderColor: 'primary.light' }}>
        <CardContent>
          {focusEvaluationItem ? (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" mb={2}>
              <Typography variant="overline" fontWeight={700} color="text.secondary">
                Active item
              </Typography>
              <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                {focusEvaluationItem.sku}
              </Typography>
              <SourceChip source={focusEvaluationItem.source} />
              <Typography variant="body2" fontWeight={600}>
                {focusEvaluationItem.name}
              </Typography>
              {focusEvaluationItem.chosen && (
                <Chip
                  label={`${focusEvaluationItem.chosen.verb} → ${focusEvaluationItem.chosen.grade}`}
                  size="small"
                  color="primary"
                />
              )}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary" mb={2}>
              Perform a path on Check-In & Evaluate to start TARS work.
            </Typography>
          )}
          <TarsEvaluationSection sku={evalSku} showPerform={focusEvaluationItem?.stage === 'workstation'} />
        </CardContent>
      </Card>

      <Typography variant="subtitle2" fontWeight={750} mb={1}>
        TARS work queues
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Verb tabs below — update evaluation above as you learn more; profit and recommendation refresh.
      </Typography>

      <Tabs
        value={verbTab}
        onChange={(_, v) => setVerbTab(v as TarsExecuteVerb)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {TARS_EXECUTE_VERBS.map((verb) => {
          const meta = TARS_VERB_META[verb];
          return (
            <Tab
              key={verb}
              value={verb}
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>{verb}</span>
                  <Chip label={counts[verb]} size="small" sx={{ height: 20, minWidth: 24 }} />
                </Stack>
              }
              sx={{
                fontWeight: 650,
                '&.Mui-selected': { color: meta.color },
              }}
            />
          );
        })}
      </Tabs>

      <Typography variant="body2" color="text.secondary" mb={2}>
        {TARS_VERB_META[verbTab].description}
      </Typography>

      {filtered.length === 0 ? (
        <Card variant="outlined">
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <Typography color="text.secondary" mb={2}>
              No <strong>{verbTab}</strong> jobs in this queue.
            </Typography>
            <Button variant="outlined" onClick={() => navigate('/restoration/queue')}>
              Go to Queue
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {filtered.map((item) => (
            <Card key={item.sku} variant="outlined">
              <CardContent>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  alignItems={{ sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                      <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                        {item.sku}
                      </Typography>
                      <SourceChip source={item.source} />
                      <Chip
                        label={`${item.chosen?.verb} → ${item.chosen?.grade}`}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </Stack>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {item.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.category}
                    </Typography>
                    {item.values[item.chosen?.grade ?? ''] != null && (
                      <Typography variant="body2" mt={1} fontFamily="monospace">
                        Target value: {fmtUsd(item.values[item.chosen!.grade])}
                      </Typography>
                    )}
                  </Box>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CheckCircle />}
                    onClick={() => completeJob(item.sku)}
                  >
                    Mark complete
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}
