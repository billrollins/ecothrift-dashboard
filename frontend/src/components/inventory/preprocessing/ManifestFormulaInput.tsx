import { useCallback, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { preprocessingFonts } from './preprocessingTokens';

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

export interface ManifestFormulaInputProps {
  headers: string[];
  value: string;
  placeholder?: string;
  error?: string | null;
  onChange: (next: string) => void;
}

export function ManifestFormulaInput({
  headers,
  value,
  placeholder,
  error,
  onChange,
}: ManifestFormulaInputProps) {
  const [active, setActive] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const getSuggestions = useCallback(
    (formula: string): string[] => {
      const suggestions: string[] = [];
      const cursorPos = formula.length;
      const textBefore = formula.slice(0, cursorPos);
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
    <Box sx={{ position: 'relative', minWidth: 0 }}>
      <Box
        component="input"
        placeholder={placeholder ?? `e.g. TITLE([${headers[0] || 'Column'}])`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          setActive(true);
          setShowSuggestions(true);
        }}
        onBlur={() => {
          setTimeout(() => setShowSuggestions(false), 200);
        }}
        ref={(el: HTMLInputElement | null) => {
          inputRef.current = el;
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
      {active && showSuggestions && value && (
        <SuggestionsList
          suggestions={getSuggestions(value)}
          onSelect={(suggestion) => {
            const isColRef = suggestion.startsWith('[');
            if (isColRef) {
              const lastOpen = value.lastIndexOf('[');
              const newFormula = value.slice(0, lastOpen) + suggestion;
              onChange(newFormula);
            } else {
              const parts = value.split(/[\s(+,]/);
              const lastPart = parts[parts.length - 1];
              const newFormula = value.slice(0, value.length - lastPart.length) + suggestion;
              onChange(newFormula);
            }
            inputRef.current?.focus();
          }}
        />
      )}
    </Box>
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
