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
      <Typography variant="caption" color="text.secondary">
        No preview rows yet. Preview will appear when formulas are applied.
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Showing {rows.length} standardized row(s)
        {typeof rowsSelected === 'number' ? ` of ${rowsSelected} selected` : ''}
        {typeof rowCountInFile === 'number' ? ` (file total: ${rowCountInFile})` : ''}.
      </Typography>
      <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 70 }}>Row</TableCell>
              {columns.map((column) => (
                <TableCell key={column.key} sx={{ whiteSpace: 'nowrap' }}>
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${String(row.row_number ?? index)}-${index}`}>
                <TableCell>{String(row.row_number ?? index + 1)}</TableCell>
                {columns.map((column) => (
                  <TableCell key={column.key}>
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

