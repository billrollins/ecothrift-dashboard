import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { StandardColumnDefinition } from '../../api/inventory.api';
import { preprocessingStep1 } from './preprocessing/preprocessingTokens';

interface StandardManifestPreviewProps {
  columns: StandardColumnDefinition[];
  rows: Record<string, unknown>[];
  rowCountInFile?: number;
  rowsSelected?: number;
  maxHeight?: number;
}

export function StandardManifestPreview({
  columns,
  rows,
  rowCountInFile,
  rowsSelected,
  maxHeight = 280,
}: StandardManifestPreviewProps) {
  if (!rows.length) {
    return (
      <Typography sx={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>
        No preview rows yet. Preview will appear when formulas are applied.
      </Typography>
    );
  }

  return (
    <Box sx={{ maxWidth: '100%' }}>
      <Typography sx={{ fontSize: 12, color: '#888', display: 'block', mb: 1 }}>
        Showing {rows.length} standardized row(s)
        {typeof rowsSelected === 'number' ? ` of ${rowsSelected} selected` : ''}
        {typeof rowCountInFile === 'number' ? ` (file total: ${rowCountInFile})` : ''}.
      </Typography>
      <TableContainer
        sx={{
          ...preprocessingStep1.tableWrapSx,
          border: '1px solid #DDD5C9',
          borderRadius: 1,
          maxHeight,
          overflowY: 'auto',
        }}
      >
        <Table size="small" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <TableHead sx={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <TableRow>
              <TableCell sx={{ ...preprocessingStep1.tableHeaderSmallSx, width: 40 }}>Row</TableCell>
              {columns.map((column) => (
                <TableCell key={column.key} sx={preprocessingStep1.tableHeaderSmallSx}>
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow
                key={`${String(row.row_number ?? index)}-${index}`}
                sx={{ bgcolor: index % 2 === 0 ? '#FAFAF6' : undefined }}
              >
                <TableCell sx={preprocessingStep1.tableBodySmallSx}>
                  {String(row.row_number ?? index + 1)}
                </TableCell>
                {columns.map((column) => (
                  <TableCell key={column.key} sx={preprocessingStep1.tableBodySmallSx}>
                    {String(row[column.key] ?? '')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
