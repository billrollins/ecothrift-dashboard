import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import type { StandardColumnDefinition } from '../../api/inventory.api';
import { prepS1 } from '../../utils/preprocessingStep1Diag';
import { preprocessingFonts, preprocessingStep1 } from './preprocessing/preprocessingTokens';

const FUNCTION_HINTS = [
  'UPPER(expr)',
  'LOWER(expr)',
  'TITLE(expr)',
  'TRIM(expr)',
  'REPLACE(expr, "find", "replace")',
  'CONCAT(expr, expr, ...)',
  'LEFT(expr, n)',
  'RIGHT(expr, n)',
];

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
}: StandardManifestBuilderProps) {
  const [activeField, setActiveField] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const entries = formulaSamples ? Object.entries(formulaSamples) : [];
    const nonEmptyDisplay = entries.filter(([, v]) => v != null && String(v).trim() !== '').length;
    prepS1('StandardManifestBuilder formulaSamples (eval OK vs display)', {
      headersLen: headers.length,
      columnsLen: columns.length,
      /** Keys present in snapshot = formula ran OK for row 1 */
      sampleEvalOkFieldCount: entries.length,
      sampleNonEmptyDisplayCount: nonEmptyDisplay,
      formulaSampleErrorsFields: formulaSampleErrors ? Object.keys(formulaSampleErrors) : [],
      samplePreviewPairs: entries.slice(0, 8).map(([k, v]) => ({
        k,
        len: String(v ?? '').length,
        head: String(v ?? '').slice(0, 40),
      })),
    });
  }, [headers.length, columns.length, formulaSamples, formulaSampleErrors]);

  const getSuggestions = useCallback(
    (value: string): string[] => {
      const suggestions: string[] = [];
      const cursorPos = value.length;
      const textBefore = value.slice(0, cursorPos);
      const lastBracketOpen = textBefore.lastIndexOf('[');
      const lastBracketClose = textBefore.lastIndexOf(']');

      if (lastBracketOpen > lastBracketClose) {
        const partial = textBefore.slice(lastBracketOpen + 1).toLowerCase();
        for (const h of headers) {
          if (h.toLowerCase().includes(partial)) {
            suggestions.push(`[${h}]`);
          }
        }
      } else {
        const lastWord = textBefore.split(/[\s(+,]/).pop()?.toUpperCase() ?? '';
        if (lastWord) {
          for (const hint of FUNCTION_HINTS) {
            if (hint.toUpperCase().startsWith(lastWord)) {
              suggestions.push(hint);
            }
          }
        }
      }
      return suggestions;
    },
    [headers],
  );

  return (
    <TableContainer sx={preprocessingStep1.tableWrapSx}>
      <Table
        size="small"
        stickyHeader
        sx={{
          width: '100%',
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
          fontSize: 13,
          '& .MuiTableCell-root': { borderColor: '#EDE8E0' },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...preprocessingStep1.tableHeaderCellSx, width: 150 }}>Standard Field</TableCell>
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
                  <Box sx={{ position: 'relative', minWidth: 0 }}>
                    <Box
                      component="input"
                      placeholder={`e.g. TITLE([${headers[0] || 'Column'}])`}
                      value={formula}
                      onChange={(e) => onFormulaChange(column.key, e.target.value)}
                      onFocus={() => {
                        setActiveField(column.key);
                        setShowSuggestions(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowSuggestions(false), 200);
                      }}
                      ref={(el: HTMLInputElement | null) => {
                        inputRefs.current[column.key] = el;
                      }}
                      sx={{
                        width: '100%',
                        p: '7px 10px',
                        border: `1px solid ${error ? '#c0392b' : '#DDD5C9'}`,
                        borderRadius: '4px',
                        fontSize: 13,
                        lineHeight: 1.35,
                        fontFamily: preprocessingFonts.mono,
                        color: '#1B4332',
                        outline: 'none',
                        bgcolor: '#fff',
                        boxSizing: 'border-box',
                      }}
                    />
                    {error && (
                      <Typography sx={{ fontSize: 11, color: 'error.main', mt: 0.25 }}>
                        {error}
                      </Typography>
                    )}
                    {activeField === column.key && showSuggestions && formula && (
                      <SuggestionsList
                        suggestions={getSuggestions(formula)}
                        onSelect={(suggestion) => {
                          const isColRef = suggestion.startsWith('[');
                          if (isColRef) {
                            const lastOpen = formula.lastIndexOf('[');
                            const newFormula = formula.slice(0, lastOpen) + suggestion;
                            onFormulaChange(column.key, newFormula);
                          } else {
                            const parts = formula.split(/[\s(+,]/);
                            const lastPart = parts[parts.length - 1];
                            const newFormula = formula.slice(0, formula.length - lastPart.length) + suggestion;
                            onFormulaChange(column.key, newFormula);
                          }
                          inputRefs.current[column.key]?.focus();
                        }}
                      />
                    )}
                  </Box>
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
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function SuggestionsList({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}) {
  if (!suggestions.length) return null;

  return (
    <Box
      sx={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 10,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        maxHeight: 200,
        overflow: 'auto',
        boxShadow: 2,
      }}
    >
      {suggestions.slice(0, 10).map((s) => (
        <Box
          key={s}
          sx={{
            px: '10px',
            py: '6px',
            cursor: 'pointer',
            fontFamily: preprocessingFonts.mono,
            fontSize: 12,
            '&:hover': { bgcolor: 'action.hover' },
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(s);
          }}
        >
          {s}
        </Box>
      ))}
    </Box>
  );
}
