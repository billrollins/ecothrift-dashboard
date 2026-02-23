import { useCallback, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { StandardColumnDefinition } from '../../api/inventory.api';

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
}

export function StandardManifestBuilder({
  headers,
  columns,
  formulas,
  onFormulaChange,
  formulaErrors,
  aiReasonings,
}: StandardManifestBuilderProps) {
  const [activeField, setActiveField] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
    <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 180 }}>Standard Field</TableCell>
            <TableCell>Formula Expression</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {columns.map((column) => {
            const formula = formulas[column.key] ?? '';
            const error = formulaErrors?.[column.key];
            const reasoning = aiReasonings?.[column.key];

            return (
              <TableRow key={column.key}>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    {column.label}
                    {column.required ? ' *' : ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {column.key}
                  </Typography>
                  {reasoning && (
                    <Tooltip title={reasoning} arrow>
                      <Chip label="AI" size="small" color="info" sx={{ ml: 1, cursor: 'help' }} />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>
                  <Box sx={{ position: 'relative' }}>
                    <TextField
                      fullWidth
                      size="small"
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
                      error={!!error}
                      helperText={error || undefined}
                      inputRef={(el: HTMLInputElement | null) => {
                        inputRefs.current[column.key] = el;
                      }}
                      sx={{
                        '& .MuiInputBase-input': {
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                        },
                      }}
                    />
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
            px: 1.5,
            py: 0.5,
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
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
