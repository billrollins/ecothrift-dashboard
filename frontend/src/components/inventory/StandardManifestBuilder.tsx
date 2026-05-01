import { useEffect, useState } from 'react';
import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import type {
  ManifestFieldBucketMetadata,
  StandardColumnDefinition,
} from '../../api/inventory.api';
import { prepS1 } from '../../utils/preprocessingStep1Diag';
import { BucketFieldEditor } from './BucketFieldEditor';
import { prettifyJsonTooltip, truncateJsonOneLine } from './preprocessing/bucketPreviewDisplay';
import {
  bucketMappedFieldCount,
  manifestBucketSampleKey,
  MANIFEST_BUCKET_ORDER,
} from './preprocessing/formulaPreviewSnapshot';
import { ManifestFormulaInput } from './preprocessing/ManifestFormulaInput';
import { preprocessingFonts, preprocessingStep1 } from './preprocessing/preprocessingTokens';

interface StandardManifestBuilderProps {
  headers: string[];
  columns: StandardColumnDefinition[];
  formulas: Record<string, string>;
  onFormulaChange: (target: string, expression: string) => void;
  formulaErrors?: Record<string, string>;
  aiReasonings?: Record<string, string>;
  /** Live-evaluated sample cell per standard field (Step 1 preprocessing). */
  formulaSamples?: Record<string, string>;
  formulaSampleErrors?: Record<string, string>;
  buckets?: Record<string, ManifestFieldBucketMetadata> | null;
  /** Subset/order of `MANIFEST_BUCKET_ORDER` present in manifest-fields metadata. */
  bucketOrder?: readonly string[];
  replaceBucketFormulas?: (
    bucketPrefix: string,
    pairs: Array<{ target: string; formula: string }>,
  ) => void;
  /** Overlay bucket dotted targets for live Sample Result while BucketFieldEditor is open. */
  onBucketDraftChange?: (
    bucketId: string,
    pairs: Array<{ target: string; formula: string }>,
  ) => void;
  /** Clear draft overlay keys for `${bucketId}.*` when modal closes / after Save. */
  onBucketDraftDismiss?: (bucketId: string) => void;
}

export function StandardManifestBuilder({
  headers,
  columns,
  formulas,
  onFormulaChange,
  formulaErrors,
  aiReasonings,
  formulaSamples,
  formulaSampleErrors,
  buckets,
  bucketOrder,
  replaceBucketFormulas,
  onBucketDraftChange,
  onBucketDraftDismiss,
}: StandardManifestBuilderProps) {
  const [bucketModalId, setBucketModalId] = useState<string | null>(null);

  const closeBucketModal = () => {
    if (bucketModalId) onBucketDraftDismiss?.(bucketModalId);
    setBucketModalId(null);
  };
  const resolvedBucketOrder = bucketOrder?.length
    ? bucketOrder
    : (MANIFEST_BUCKET_ORDER as readonly string[]);
  const showBuckets = Boolean(buckets && replaceBucketFormulas);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const entries = formulaSamples ? Object.entries(formulaSamples) : [];
    const nonEmptyDisplay = entries.filter(([, v]) => v != null && String(v).trim() !== '').length;
    prepS1('StandardManifestBuilder formulaSamples (eval OK vs display)', {
      headersLen: headers.length,
      columnsLen: columns.length,
      sampleEvalOkFieldCount: entries.length,
      sampleNonEmptyDisplayCount: nonEmptyDisplay,
      formulaSampleErrorsFields: formulaSampleErrors ? Object.keys(formulaSampleErrors) : [],
      samplePreviewPairs: entries.slice(0, 12).map(([k, v]) => ({
        k,
        len: String(v ?? '').length,
        head: String(v ?? '').slice(0, 48),
      })),
    });
  }, [headers.length, columns.length, formulaSamples, formulaSampleErrors]);

  return (
    <>
      <TableContainer
        sx={{ ...preprocessingStep1.tableHorizontalScrollSx, borderRadius: 1 }}
      >
        <Table
          size="small"
          stickyHeader
          sx={{
            width: 'max-content',
            minWidth: '100%',
            tableLayout: 'auto',
            borderCollapse: 'collapse',
            fontSize: 13,
            '& .MuiTableCell-root': { borderColor: '#EDE8E0' },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...preprocessingStep1.tableHeaderCellSx, width: 150 }}>
                Standard Field
              </TableCell>
              <TableCell sx={{ ...preprocessingStep1.tableHeaderCellSx }}>Formula Expression</TableCell>
              <TableCell sx={{ ...preprocessingStep1.tableHeaderCellSx, width: 220 }}>
                Sample Result (Row 1)
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {columns.map((column, rowIdx) => {
              const formula = formulas[column.key] ?? '';
              const error = formulaErrors?.[column.key];
              const sampleVal = formulaSamples?.[column.key];
              const sampleErr = formulaSampleErrors?.[column.key];
              const reasoning = aiReasonings?.[column.key];

              return (
                <TableRow
                  key={column.key}
                  sx={{ bgcolor: rowIdx % 2 === 0 ? '#FAFAF6' : undefined }}
                >
                  <TableCell sx={{ ...preprocessingStep1.tableBodyCellSx, verticalAlign: 'top' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                        <Typography sx={preprocessingStep1.standardFieldLabelSx} component="span">
                          {column.label}
                          {column.required ? ' *' : ''}
                        </Typography>
                        {reasoning && (
                          <Tooltip title={reasoning} arrow>
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: 18,
                                px: 0.75,
                                borderRadius: '9px',
                                fontSize: 10,
                                fontWeight: 600,
                                letterSpacing: '0.02em',
                                color: '#1565C0',
                                bgcolor: 'rgba(21, 101, 192, 0.08)',
                                border: '1px solid rgba(21, 101, 192, 0.2)',
                                cursor: 'help',
                                flexShrink: 0,
                                lineHeight: 1,
                              }}
                            >
                              AI
                            </Box>
                          </Tooltip>
                        )}
                      </Box>
                      <Typography sx={preprocessingStep1.fieldKeyCaptionSx}>{column.key}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ ...preprocessingStep1.tableBodyCellSx, minWidth: 0, verticalAlign: 'top' }}>
                    <ManifestFormulaInput
                      headers={headers}
                      value={formula}
                      error={error}
                      onChange={(v) => onFormulaChange(column.key, v)}
                    />
                  </TableCell>
                  <TableCell sx={preprocessingStep1.tableBodyCellSx}>
                    {sampleErr ? (
                      <Typography sx={{ fontSize: 12, color: 'error.main', wordBreak: 'break-word' }}>
                        {sampleErr}
                      </Typography>
                    ) : sampleVal ? (
                      <Typography sx={preprocessingStep1.sampleCellSx}>{sampleVal}</Typography>
                    ) : (
                      <Typography sx={{ fontSize: 12, color: '#ccc', fontStyle: 'italic' }}>--</Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}

            {showBuckets &&
              resolvedBucketOrder
                .filter((bid) => buckets![bid])
                .map((bucketId, idx) => {
                  const meta = buckets![bucketId];
                  const sk = manifestBucketSampleKey(bucketId);
                  const cnt = bucketMappedFieldCount(formulas, bucketId);
                  const sampleVal = formulaSamples?.[sk];
                  const sampleErr = formulaSampleErrors?.[sk];
                  const rowStriped = (columns.length + idx) % 2 === 0;

                  return (
                    <TableRow
                      key={`bucket-${bucketId}`}
                      hover
                      onClick={() => setBucketModalId(bucketId)}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: rowStriped ? '#FAFAF6' : undefined,
                        '& td': { verticalAlign: 'top' },
                      }}
                    >
                      <TableCell sx={preprocessingStep1.tableBodyCellSx}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                          <Typography sx={preprocessingStep1.standardFieldLabelSx}>{meta.label}</Typography>
                          <Typography sx={preprocessingStep1.fieldKeyCaptionSx}>{bucketId}.*</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={preprocessingStep1.tableBodyCellSx}>
                        <Chip
                          label={cnt ? `${cnt} Field${cnt === 1 ? '' : 's'}` : 'No Fields'}
                          size="small"
                          variant="outlined"
                          sx={{
                            fontWeight: 600,
                            borderColor: cnt ? '#2D6A4F' : '#ccc',
                            color: cnt ? '#1B4332' : '#888',
                            bgcolor: cnt ? 'rgba(45, 106, 79, 0.06)' : 'transparent',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={preprocessingStep1.tableBodyCellSx}>
                        {sampleErr ? (
                          <Typography sx={{ fontSize: 12, color: 'error.main', wordBreak: 'break-word' }}>
                            {sampleErr}
                          </Typography>
                        ) : sampleVal ? (
                          <Tooltip
                            title={
                              <Box
                                component="pre"
                                sx={{
                                  m: 0,
                                  maxHeight: 320,
                                  overflow: 'auto',
                                  fontFamily: preprocessingFonts.mono,
                                  fontSize: 11,
                                  whiteSpace: 'pre-wrap',
                                }}
                              >
                                {prettifyJsonTooltip(sampleVal)}
                              </Box>
                            }
                          >
                            <Typography
                              component="span"
                              sx={{
                                ...preprocessingStep1.sampleCellSx,
                                display: 'inline-block',
                                maxWidth: '100%',
                              }}
                            >
                              {truncateJsonOneLine(sampleVal)}
                            </Typography>
                          </Tooltip>
                        ) : (
                          <Typography sx={{ fontSize: 12, color: '#ccc', fontStyle: 'italic' }}>--</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </TableContainer>

      {showBuckets && replaceBucketFormulas && (
        <BucketFieldEditor
          open={bucketModalId != null}
          bucketId={bucketModalId ?? ''}
          bucketMeta={bucketModalId ? buckets![bucketModalId] ?? null : null}
          headers={headers}
          formulas={formulas}
          onClose={closeBucketModal}
          onDraftChange={onBucketDraftChange}
          onSave={(pairs) => {
            if (bucketModalId) replaceBucketFormulas(bucketModalId, pairs);
          }}
        />
      )}
    </>
  );
}
