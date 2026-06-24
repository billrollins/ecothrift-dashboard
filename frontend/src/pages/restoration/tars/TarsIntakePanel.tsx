import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  InputAdornment,
  List,
  ListItemButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import Send from '@mui/icons-material/Send';
import WarningAmber from '@mui/icons-material/WarningAmber';
import { useMemo } from 'react';
import { TARS_GRADE_DOT_COLORS, TARS_SOURCE_COLORS } from './tarsConstants';
import { useTarsMock } from './TarsMockStore';
import { canSendItem, gradesForScale } from './tarsProfit';
import type { TarsItem } from './tarsTypes';

function SourceDot({ source }: { source: TarsItem['source'] }) {
  return (
    <Box
      component="span"
      sx={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        bgcolor: TARS_SOURCE_COLORS[source],
        flexShrink: 0,
      }}
    />
  );
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function gradeCompletion(item: TarsItem, scales: Record<string, string[]>) {
  const grades = gradesForScale(item.scale, scales);
  const complete = grades.filter((grade) => (item.values[grade] ?? 0) > 0).length;
  const values = grades.map((grade) => item.values[grade] ?? 0);
  return {
    complete,
    total: grades.length,
    percent: grades.length > 0 ? Math.round((complete / grades.length) * 100) : 0,
    maxValue: values.length > 0 ? Math.max(...values) : 0,
    totalValue: values.reduce((sum, value) => sum + value, 0),
  };
}

export function TarsIntakePanel() {
  const {
    intakeItems,
    selectedIntakeSku,
    setSelectedIntakeSku,
    scales,
    setScale,
    setRetail,
    sendToRestoration,
    intakeScanInput,
    setIntakeScanInput,
    scanToAddQueue,
    itemNeedsSetup,
  } = useTarsMock();

  const activeItem = useMemo(() => {
    const picked = intakeItems.find((i) => i.sku === selectedIntakeSku);
    return picked ?? intakeItems[0] ?? null;
  }, [intakeItems, selectedIntakeSku]);

  const grades = activeItem ? gradesForScale(activeItem.scale, scales) : [];
  const canSend = activeItem ? canSendItem(activeItem, scales) : false;
  const activeCompletion = activeItem ? gradeCompletion(activeItem, scales) : null;

  return (
    <Box
      sx={{
        height: 'calc(100vh - 172px)',
        minHeight: 520,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Typography variant="h5" fontWeight={600} gutterBottom>
        Send to Restoration
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Scan items in, pick a grade scale, and set a value for each grade.
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(440px, 0.95fr) 1.05fr' },
          gap: 2.5,
          alignItems: 'start',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            overflow: 'hidden',
            minHeight: 0,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderColor: '#cbd5e1',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.25,
              py: 0.85,
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: '#f8fafc',
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                minWidth: 0,
                height: 34,
                px: 1.25,
                gap: 1,
                border: '1px solid',
                borderColor: '#cbd5e1',
                borderRadius: 1.25,
                bgcolor: 'background.paper',
                transition: (theme) => theme.transitions.create(['border-color', 'box-shadow']),
                '&:focus-within': {
                  borderColor: 'success.main',
                  boxShadow: '0 0 0 3px rgba(46, 125, 50, 0.14)',
                },
              }}
            >
              <QrCodeScanner sx={{ color: 'text.secondary', fontSize: 19, flexShrink: 0 }} />
              <TextField
                fullWidth
                size="small"
                variant="standard"
                placeholder="Scan SKU to add…"
                value={intakeScanInput}
                onChange={(e) => setIntakeScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') scanToAddQueue();
                }}
                slotProps={{
                  input: {
                    disableUnderline: true,
                    sx: { fontFamily: 'monospace', fontSize: 14 },
                  },
                }}
              />
            </Box>
            <Button variant="contained" size="small" onClick={scanToAddQueue} sx={{ flexShrink: 0, height: 34 }}>
              Add
            </Button>
          </Box>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ px: 1.5, py: 1, bgcolor: 'background.paper', flexShrink: 0 }}
          >
            <Box>
              <Typography variant="subtitle2" fontWeight={750}>
                Queue
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Click an item to tune grade scale and values.
              </Typography>
            </Box>
            <Chip
              label={`${intakeItems.length} item${intakeItems.length === 1 ? '' : 's'}`}
              size="small"
              sx={{ fontWeight: 700, bgcolor: '#eef2f7' }}
            />
          </Stack>
          <Divider />
          {intakeItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={5} px={2}>
              Nothing queued yet.
            </Typography>
          ) : (
            <List
              disablePadding
              sx={{
                p: 1,
                bgcolor: '#f8fafc',
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overscrollBehavior: 'contain',
              }}
            >
              {intakeItems.map((item) => {
                const selected = activeItem?.sku === item.sku;
                const needsSetup = itemNeedsSetup(item);
                const completion = gradeCompletion(item, scales);
                return (
                  <ListItemButton
                    key={item.sku}
                    selected={selected}
                    onClick={() => setSelectedIntakeSku(item.sku)}
                    sx={{
                      display: 'block',
                      mb: 0.75,
                      p: 1.1,
                      borderRadius: 1.5,
                      border: '1px solid',
                      borderColor: selected ? 'success.main' : needsSetup ? '#f59e0b' : '#e2e8f0',
                      bgcolor: selected ? '#e8f5e9' : 'background.paper',
                      boxShadow: selected ? '0 8px 18px rgba(46, 125, 50, 0.16)' : '0 4px 12px rgba(15, 23, 42, 0.04)',
                      '&.Mui-selected': { bgcolor: '#e8f5e9' },
                      '&:hover': {
                        bgcolor: selected ? '#e8f5e9' : '#ffffff',
                        borderColor: selected ? 'success.main' : '#cbd5e1',
                      },
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(180px, 1fr) auto',
                          gap: 1,
                          alignItems: 'center',
                          mb: 0.65,
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1} minWidth={0}>
                          <SourceDot source={item.source} />
                          <Typography variant="caption" fontFamily="monospace" fontWeight={850}>
                            {item.sku}
                          </Typography>
                          <Typography variant="body2" fontWeight={800} lineHeight={1.15} noWrap title={item.name}>
                            {item.name}
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Chip
                            label={item.source}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: 10,
                              fontWeight: 800,
                              color: '#fff',
                              bgcolor: TARS_SOURCE_COLORS[item.source],
                            }}
                          />
                          <Chip
                            icon={needsSetup ? <WarningAmber sx={{ fontSize: 14 }} /> : <CheckCircle sx={{ fontSize: 14 }} />}
                            label={needsSetup ? 'Needs values' : 'Ready'}
                            size="small"
                            color={needsSetup ? 'warning' : 'success'}
                            variant={needsSetup ? 'outlined' : 'filled'}
                            sx={{ height: 20, fontSize: 10, fontWeight: 750 }}
                          />
                        </Stack>
                      </Box>

                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: {
                            xs: '1fr 1fr',
                            lg: '1.15fr 0.72fr 0.6fr 0.62fr 0.7fr 0.9fr',
                          },
                          gap: 0.75,
                          alignItems: 'center',
                        }}
                      >
                        {[
                          ['Category', item.category],
                          ['Scale', item.scale || 'No scale'],
                          ['Retail', item.retail ? formatUsd(item.retail) : '—'],
                          ['Price', item.price ? formatUsd(item.price) : '—'],
                          ['Values', `${completion.complete}/${completion.total || '—'}`],
                          ['ID', item.upc || item.productNumber || item.model || item.brand || '—'],
                        ].map(([label, value]) => (
                          <Box
                            key={label}
                            sx={{
                              minWidth: 0,
                              px: 0.75,
                              py: 0.45,
                              borderRadius: 1,
                              bgcolor: '#fff',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1 }}>
                              {label}
                            </Typography>
                            <Typography
                              variant="caption"
                              fontWeight={850}
                              fontFamily={label === 'ID' || label === 'Values' ? 'monospace' : undefined}
                              noWrap
                              title={value}
                              sx={{ display: 'block', lineHeight: 1.25 }}
                            >
                              {value}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            overflow: 'hidden',
            minHeight: 320,
            height: '100%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            borderColor: '#cbd5e1',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.06)',
          }}
        >
          {!activeItem ? (
            <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 280 }} spacing={1}>
              <Typography variant="body2" color="text.secondary">
                Select a queued item to set its grade scale and values.
              </Typography>
            </Stack>
          ) : (
            <>
              <Box
                sx={{
                  position: 'relative',
                  px: 2.5,
                  py: 2,
                  borderBottom: 1,
                  borderColor: 'divider',
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 58%, #e8f5e9 100%)',
                  flexShrink: 0,
                }}
              >
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between">
                  <Box minWidth={0}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap mb={0.75}>
                      <Chip
                        label={activeItem.sku}
                        size="small"
                        sx={{ fontFamily: 'monospace', fontWeight: 800, bgcolor: '#0f172a', color: '#fff' }}
                      />
                      <Chip
                        label={activeItem.source}
                        size="small"
                        sx={{ fontWeight: 800, color: '#fff', bgcolor: TARS_SOURCE_COLORS[activeItem.source] }}
                      />
                      <Chip label={activeItem.category} size="small" variant="outlined" />
                      {activeItem.condition && (
                        <Chip label={activeItem.condition.replace('_', ' ')} size="small" variant="outlined" />
                      )}
                    </Stack>
                    <Typography variant="h5" fontWeight={750} lineHeight={1.15}>
                      {activeItem.name}
                    </Typography>
                    <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap mt={1}>
                      {activeItem.brand && (
                        <Typography variant="caption" color="text.secondary">
                          Brand: <strong>{activeItem.brand}</strong>
                        </Typography>
                      )}
                      {activeItem.model && (
                        <Typography variant="caption" color="text.secondary">
                          Model: <strong>{activeItem.model}</strong>
                        </Typography>
                      )}
                      {activeItem.productNumber && (
                        <Typography variant="caption" color="text.secondary">
                          Product #: <strong>{activeItem.productNumber}</strong>
                        </Typography>
                      )}
                      {activeItem.upc && (
                        <Typography variant="caption" color="text.secondary">
                          UPC: <strong>{activeItem.upc}</strong>
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={1} flexShrink={0}>
                    <Box sx={{ minWidth: 96, p: 1, borderRadius: 1.5, bgcolor: '#fff', border: '1px solid #e2e8f0' }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={700}>
                        Values
                      </Typography>
                      <Typography variant="h6" fontWeight={800} fontFamily="monospace">
                        {activeCompletion?.complete ?? 0}/{activeCompletion?.total || '—'}
                      </Typography>
                    </Box>
                    <Box sx={{ minWidth: 112, p: 1, borderRadius: 1.5, bgcolor: '#fff', border: '1px solid #e2e8f0' }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={700}>
                        Retail
                      </Typography>
                      <Typography variant="h6" fontWeight={800} fontFamily="monospace">
                        {formatUsd(activeItem.retail ?? activeCompletion?.maxValue ?? 0)}
                      </Typography>
                    </Box>
                    <Box sx={{ minWidth: 112, p: 1, borderRadius: 1.5, bgcolor: '#fff', border: '1px solid #e2e8f0' }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={700}>
                        Price
                      </Typography>
                      <Typography variant="h6" fontWeight={800} fontFamily="monospace">
                        {formatUsd(activeItem.price ?? 0)}
                      </Typography>
                    </Box>
                  </Stack>
                </Stack>
                {!canSend && (
                  <Alert
                    severity="warning"
                    variant="outlined"
                    sx={{
                      position: 'absolute',
                      right: 16,
                      bottom: 10,
                      maxWidth: 390,
                      py: 0,
                      px: 1,
                      bgcolor: 'rgba(255, 255, 255, 0.94)',
                      boxShadow: '0 6px 18px rgba(15, 23, 42, 0.12)',
                      pointerEvents: 'none',
                      '& .MuiAlert-icon': { py: 0.35, mr: 0.75 },
                      '& .MuiAlert-message': {
                        py: 0.35,
                        fontSize: 12,
                        fontWeight: 750,
                      },
                    }}
                  >
                    Select a scale and enter a value for every grade before sending.
                  </Alert>
                )}
              </Box>

              <Box
                sx={{
                  p: 2.5,
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                }}
              >
                <Typography variant="overline" color="text.secondary" fontWeight={800} display="block" mb={1}>
                  Grade scale
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.9} mb={2.5}>
                  {Object.keys(scales).map((name) => {
                    const selected = activeItem.scale === name;
                    return (
                      <Chip
                        key={name}
                        label={`${name} · ${scales[name].length}`}
                        size="small"
                        onClick={() => setScale(activeItem.sku, name)}
                        color={selected ? 'success' : 'default'}
                        variant={selected ? 'filled' : 'outlined'}
                        sx={{
                          height: 28,
                          fontWeight: 750,
                          borderRadius: 1.5,
                          bgcolor: selected ? undefined : '#fff',
                        }}
                      />
                    );
                  })}
                </Stack>

              {grades.length === 0 ? (
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Choose a scale to enter values.
                </Typography>
              ) : (
                <Stack
                  spacing={1}
                  sx={{
                    mb: 2.5,
                  }}
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ px: 0.5 }}
                  >
                    <Typography variant="caption" color="text.secondary" fontWeight={800}>
                      Grade
                    </Typography>
                    <Typography variant="caption" color="text.secondary" fontWeight={800}>
                      Price · % retail
                    </Typography>
                  </Stack>
                  {grades.map((grade, i) => {
                    const value = activeItem.values[grade] ?? 0;
                    const filled = value > 0;
                    const percentBase = activeItem.retail ?? activeCompletion?.maxValue ?? 0;
                    const retailPct =
                      filled && percentBase > 0
                        ? Math.round((value / percentBase) * 100)
                        : null;
                    return (
                      <Box
                        key={grade}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', sm: 'minmax(180px, 1fr) 240px' },
                          gap: 1.5,
                          alignItems: 'center',
                          p: 1.25,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: filled ? '#a5d6a7' : '#fbbf24',
                          bgcolor: filled ? '#f0f7f0' : '#fff7ed',
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1.25} minWidth={0}>
                          <Box
                            sx={{
                              width: 34,
                              height: 34,
                              borderRadius: '50%',
                              bgcolor: '#fff',
                              border: '1px solid #e2e8f0',
                              display: 'grid',
                              placeItems: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Box
                              sx={{
                                width: 11,
                                height: 11,
                                borderRadius: '50%',
                                bgcolor: TARS_GRADE_DOT_COLORS[i % TARS_GRADE_DOT_COLORS.length],
                              }}
                            />
                          </Box>
                          <Box minWidth={0}>
                            <Typography variant="body2" fontWeight={800}>
                              {grade}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Retail value if this is the final grade
                            </Typography>
                          </Box>
                        </Stack>
                        <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={1}>
                          <TextField
                            size="small"
                            type="number"
                            hiddenLabel
                            value={value ? String(value) : ''}
                            onChange={(e) =>
                              setRetail(activeItem.sku, grade, parseFloat(e.target.value))
                            }
                            placeholder="—"
                            error={!filled}
                            slotProps={{
                              input: {
                                startAdornment: (
                                  <InputAdornment position="start">$</InputAdornment>
                                ),
                                sx: { fontFamily: 'monospace', width: 154, bgcolor: '#fff' },
                              },
                            }}
                          />
                          <Box
                            sx={{
                              minWidth: 58,
                              px: 1,
                              py: 0.65,
                              borderRadius: 1.25,
                              textAlign: 'center',
                              bgcolor: filled ? '#ffffff' : 'rgba(255,255,255,0.6)',
                              border: '1px solid',
                              borderColor: filled ? '#cbd5e1' : '#fed7aa',
                            }}
                          >
                            <Typography
                              variant="caption"
                              fontFamily="monospace"
                              fontWeight={850}
                              color={filled ? 'text.primary' : 'text.disabled'}
                            >
                              {retailPct != null ? `${retailPct}%` : '—'}
                            </Typography>
                          </Box>
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              )}

              <Button
                fullWidth
                variant="contained"
                disabled={!canSend}
                startIcon={<Send />}
                onClick={() => sendToRestoration(activeItem.sku)}
              >
                Send to Restoration
              </Button>
              </Box>
            </>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
