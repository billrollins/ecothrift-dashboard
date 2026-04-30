import { Box, IconButton, Typography } from '@mui/material';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import type { StandardColumnDefinition } from '../../../api/inventory.api';
import { preprocessingFonts, preprocessingStep1 } from './preprocessingTokens';

export interface FormulaPreviewRow {
  row_number: number;
  cells: Record<string, string>;
}

interface FormulaPreviewProps {
  expanded: boolean;
  onToggle: () => void;
  /** Recomputes snapshot in parent (current formulas + sample rows). */
  onRefresh: () => void;
  previewTargets: string[];
  previewRows: FormulaPreviewRow[];
  columns: StandardColumnDefinition[];
}

export function FormulaPreview({
  expanded,
  onToggle,
  onRefresh,
  previewTargets,
  previewRows,
  columns,
}: FormulaPreviewProps) {
  return (
    <Box sx={preprocessingStep1.cardSurfaceSx}>
      <Box
        sx={{
          ...preprocessingStep1.cardHeaderRowSx,
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Box
          component="button"
          type="button"
          onClick={onToggle}
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            p: 0,
            font: 'inherit',
          }}
        >
          <Typography sx={{ ...preprocessingStep1.cardTitleSx, fontSize: 14 }}>
            {expanded ? '▾' : '▸'} Formula Preview
          </Typography>
        </Box>
        <IconButton
          size="small"
          aria-label="Refresh formula preview"
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          sx={{ color: '#555' }}
        >
          <RefreshOutlined fontSize="small" />
        </IconButton>
        <Typography component="span" sx={preprocessingStep1.badgeMutedSx}>
          {previewRows.length} sample rows
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 12, color: '#888', mb: expanded ? 1 : 0 }}>
        Snapshot from the manifest sample — refresh or expand to update after editing formulas.
      </Typography>
      {expanded && previewTargets.length > 0 && (
        <Box sx={{ ...preprocessingStep1.tableWrapSx, overflowX: 'auto', border: '1px solid #DDD5C9', borderRadius: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: preprocessingFonts.sans }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#1B4332', borderBottom: '2px solid #DDD5C9', backgroundColor: '#FAFAF6' }}>#</th>
                {previewTargets.map((t) => {
                  const label = columns.find((c) => c.key === t)?.label ?? t;
                  return (
                    <th key={t} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#1B4332', borderBottom: '2px solid #DDD5C9', backgroundColor: '#FAFAF6', whiteSpace: 'nowrap' }}>{label}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, ri) => (
                <tr key={row.row_number} style={{ backgroundColor: ri % 2 === 0 ? '#FAFAF6' : '#fff' }}>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #EDE8E0' }}>{row.row_number}</td>
                  {previewTargets.map((t) => (
                    <td key={t} style={{ padding: '10px 12px', borderBottom: '1px solid #EDE8E0', fontFamily: preprocessingFonts.mono, fontSize: 12 }}>
                      <Box sx={preprocessingStep1.sampleCellSx}>{row.cells[t] || ''}</Box>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}
      {expanded && previewTargets.length === 0 && (
        <Typography sx={{ fontSize: 13, color: '#888', fontStyle: 'italic' }}>No formulas yet — add expressions above, then refresh.</Typography>
      )}
    </Box>
  );
}
