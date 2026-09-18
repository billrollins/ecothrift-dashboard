import { Box, Typography } from '@mui/material';
import { useState } from 'react';
import { ccTokens } from '../../theme';

const STORAGE_KEY = 'retail-qa.grade-scale-open';

export interface GradeScaleRow {
  letter: string;
  min: number;
}

export interface GradeScaleRangeRow {
  letter: string;
  min: number | null;
  range: string;
}

export function gradeScaleRanges(rows: GradeScaleRow[]): GradeScaleRangeRow[] {
  const out: GradeScaleRangeRow[] = rows.map((row, index) => {
    const ceiling = index === 0 ? 100 : rows[index - 1].min - 1;
    const range = ceiling <= row.min ? String(row.min) : `${row.min} to ${ceiling}`;
    return { letter: row.letter, min: row.min, range };
  });
  const last = rows[rows.length - 1];
  if (last) {
    out.push({ letter: 'F', min: null, range: `below ${last.min}` });
  }
  return out;
}

function readOpen(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeOpen(next: boolean) {
  try {
    sessionStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function GradeScaleTable({
  scale,
  currentLetter,
}: {
  scale: GradeScaleRow[];
  currentLetter?: string | null;
}) {
  const [open, setOpen] = useState(readOpen);
  const rows = gradeScaleRanges(scale);
  const current = (currentLetter || '').trim().toUpperCase();

  return (
    <Box data-testid="retail-grade-scale">
      <Typography
        component="button"
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          writeOpen(next);
        }}
        sx={{
          border: 0,
          p: 0,
          bgcolor: 'transparent',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          color: ccTokens.ink3,
          textAlign: 'left',
        }}
      >
        Grade scale{open ? ' ▴' : ' ▾'}
      </Typography>
      {open ? (
        <Box
          component="table"
          sx={{
            mt: 0.75,
            borderCollapse: 'collapse',
            fontSize: 12,
            color: ccTokens.ink3,
            width: '100%',
            maxWidth: 280,
          }}
        >
          <Box component="thead">
            <Box component="tr">
              <Box component="th" sx={{ textAlign: 'left', fontWeight: 600, pb: 0.4, pr: 1.5 }}>Letter</Box>
              <Box component="th" sx={{ textAlign: 'right', fontWeight: 600, pb: 0.4, pr: 1.5 }}>Min</Box>
              <Box component="th" sx={{ textAlign: 'left', fontWeight: 600, pb: 0.4 }}>Range</Box>
            </Box>
          </Box>
          <Box component="tbody">
            {rows.map((row) => {
              const active = row.letter === current;
              return (
                <Box
                  component="tr"
                  key={row.letter}
                  data-letter={row.letter}
                  data-current={active ? 'true' : 'false'}
                  sx={{
                    bgcolor: active ? 'rgba(47, 122, 72, 0.12)' : 'transparent',
                    fontWeight: active ? 700 : 400,
                    color: active ? ccTokens.ink : ccTokens.ink3,
                  }}
                >
                  <Box component="td" sx={{ py: 0.15, pr: 1.5 }}>{row.letter}</Box>
                  <Box component="td" sx={{ py: 0.15, pr: 1.5, textAlign: 'right' }}>{row.min ?? '—'}</Box>
                  <Box component="td" sx={{ py: 0.15 }}>{row.range}</Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
