// One full-width table of the truck's lines: virtualised (1,155 lines stay smooth), sortable, selectable with
// shift-click ranges, cells editable in place (double-click, Enter saves, Esc cancels).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Checkbox, MenuItem, Select, TextField, Tooltip } from '@mui/material';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PrepLine } from '../../../api/prepSteps.api';
import { tone } from './tokens';

export type EditKind = 'text' | 'money' | 'int' | 'select';

export interface Column {
  key: string;
  label: string;
  /** px width; the one column with `grow` takes the rest */
  width: number;
  grow?: boolean;
  /** before / after colouring of the header */
  side?: 'before' | 'after';
  align?: 'left' | 'right' | 'center';
  value: (l: PrepLine) => string | number | null;
  render?: (l: PrepLine) => ReactNode;
  edit?: { field: string; kind: EditKind; options?: string[]; optionsFor?: (l: PrepLine) => { value: string; label: string }[] };
  /** the after value differs from before: tint it */
  changed?: (l: PrepLine) => boolean;
  title?: (l: PrepLine) => string;
}

export const ROW_H = 34;

interface Props {
  lines: PrepLine[];
  columns: Column[];
  selected: Set<number>;
  onSelect: (next: Set<number>) => void;
  onEdit: (line: PrepLine, field: string, value: string) => void;
  openIds: Set<number>;
  height: number;
  sort: { key: string; dir: 1 | -1 } | null;
  onSort: (s: { key: string; dir: 1 | -1 } | null) => void;
}

function compare(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0;
  if (a === null || a === '') return 1;
  if (b === null || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function sortLines(lines: PrepLine[], columns: Column[], sort: Props['sort']): PrepLine[] {
  if (!sort) return lines;
  const col = columns.find((c) => c.key === sort.key);
  if (!col) return lines;
  const out = [...lines];
  out.sort((x, y) => {
    const a = col.value(x);
    const b = col.value(y);
    if (a === null || a === '') return b === null || b === '' ? 0 : 1; // blanks last both ways
    if (b === null || b === '') return -1;
    return compare(a, b) * sort.dir || x.row_number - y.row_number;
  });
  return out;
}

function EditCell({ col, line, onDone }: { col: Column; line: PrepLine; onDone: (v: string | null) => void }) {
  const start = col.value(line);
  const [v, setV] = useState(col.edit?.optionsFor || start === null ? '' : String(start));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  if (col.edit?.kind === 'select') {
    return (
      <Select
        size="small"
        autoFocus
        defaultOpen
        value={v}
        onChange={(e) => onDone(String(e.target.value))}
        onClose={() => onDone(null)}
        sx={{ height: ROW_H - 6, fontSize: 13, width: '100%' }}
      >
        {(col.edit.optionsFor ? col.edit.optionsFor(line) : (col.edit.options || []).map((o) => ({ value: o, label: o || '(none)' }))).map((o) => (
          <MenuItem key={o.value} value={o.value} sx={{ fontSize: 13 }}>
            {o.label}
          </MenuItem>
        ))}
      </Select>
    );
  }
  return (
    <TextField
      inputRef={ref}
      size="small"
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(v);
        if (e.key === 'Escape') onDone(null);
      }}
      onBlur={() => onDone(v === (start === null ? '' : String(start)) ? null : v)}
      slotProps={{ htmlInput: { style: { fontSize: 13, padding: '4px 6px', textAlign: col.align === 'right' ? 'right' : 'left' } } }}
      sx={{ width: '100%' }}
    />
  );
}

export default function LineTable({ lines, columns, selected, onSelect, onEdit, openIds, height, sort, onSort }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastClick = useRef<number | null>(null);
  const [editing, setEditing] = useState<{ id: number; key: string } | null>(null);
  const template = useMemo(
    () => ['36px', ...columns.map((c) => (c.grow ? `minmax(${c.width}px, 1fr)` : `${c.width}px`))].join(' '),
    [columns],
  );
  const minWidth = useMemo(() => 36 + columns.reduce((s, c) => s + c.width, 0), [columns]);
  const rv = useVirtualizer({ count: lines.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12 });
  const allSelected = lines.length > 0 && lines.every((l) => selected.has(l.id));
  const someSelected = !allSelected && lines.some((l) => selected.has(l.id));

  const toggle = (index: number, shift: boolean) => {
    const next = new Set(selected);
    const id = lines[index].id;
    const on = !selected.has(id);
    if (shift && lastClick.current !== null) {
      const [a, b] = [Math.min(lastClick.current, index), Math.max(lastClick.current, index)];
      for (let i = a; i <= b; i += 1) {
        if (on) next.add(lines[i].id);
        else next.delete(lines[i].id);
      }
    } else if (on) next.add(id);
    else next.delete(id);
    lastClick.current = index;
    onSelect(next);
  };

  const header = (
    <Box
      sx={{
        display: 'grid', gridTemplateColumns: template, position: 'sticky', top: 0, zIndex: 2, minWidth,
        bgcolor: tone.head, borderBottom: `1px solid ${tone.line}`, height: 34, alignItems: 'center',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox
          size="small"
          checked={allSelected}
          indeterminate={someSelected}
          onChange={() => {
            const next = new Set(selected);
            if (allSelected) lines.forEach((l) => next.delete(l.id));
            else lines.forEach((l) => next.add(l.id));
            onSelect(next);
          }}
          sx={{ p: 0.25 }}
          slotProps={{ input: { 'aria-label': 'Select all shown lines' } }}
        />
      </Box>
      {columns.map((c) => {
        const active = sort?.key === c.key;
        return (
          <Box
            key={c.key}
            role="columnheader"
            onClick={() => onSort(active ? (sort!.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })}
            sx={{
              px: 0.75, fontSize: 12, fontWeight: 700, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 0.25, height: '100%',
              justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start',
              color: c.side === 'before' ? tone.inkSoft : c.side === 'after' ? tone.after : tone.ink,
              borderTop: c.side === 'after' ? `3px solid ${tone.after}` : c.side === 'before' ? `3px solid ${tone.before}` : '3px solid transparent',
            }}
          >
            {c.label}
            <Box component="span" sx={{ width: 18, display: 'inline-flex' }}>
              {active && (sort!.dir === 1 ? <ArrowDropUpIcon fontSize="small" /> : <ArrowDropDownIcon fontSize="small" />)}
            </Box>
          </Box>
        );
      })}
    </Box>
  );

  return (
    <Box
      ref={scrollRef}
      data-testid="line-table"
      sx={{ height, overflow: 'auto', border: `1px solid ${tone.line}`, borderRadius: 1, bgcolor: '#fff', position: 'relative' }}
    >
      {header}
      <Box sx={{ height: rv.getTotalSize(), position: 'relative', minWidth }}>
        {rv.getVirtualItems().map((vi) => {
          const l = lines[vi.index];
          const sel = selected.has(l.id);
          const open = openIds.has(l.id);
          return (
            <Box
              key={l.id}
              data-line={l.row_number}
              sx={{
                display: 'grid', gridTemplateColumns: template, position: 'absolute', top: 0, left: 0, right: 0,
                transform: `translateY(${vi.start}px)`, height: ROW_H, alignItems: 'center', fontSize: 13,
                borderBottom: `1px solid ${tone.lineSoft}`, bgcolor: sel ? tone.sel : vi.index % 2 ? tone.zebra : '#fff',
                boxShadow: open ? `inset 3px 0 0 ${tone.open}` : 'none',
                '&:hover': { bgcolor: sel ? tone.sel : tone.hover },
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Checkbox
                  size="small"
                  checked={sel}
                  onClick={(e) => toggle(vi.index, (e as React.MouseEvent).shiftKey)}
                  sx={{ p: 0.25 }}
                  slotProps={{ input: { 'aria-label': `Select line ${l.row_number}` } }}
                />
              </Box>
              {columns.map((c) => {
                const isEditing = editing?.id === l.id && editing.key === c.key;
                const changed = c.changed?.(l);
                const content = c.render ? c.render(l) : c.value(l);
                const title = c.title ? c.title(l) : typeof content === 'string' ? content : '';
                return (
                  <Box
                    key={c.key}
                    onDoubleClick={() => c.edit && setEditing({ id: l.id, key: c.key })}
                    sx={{
                      px: 0.75, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start',
                      color: c.side === 'before' ? tone.inkSoft : tone.ink,
                      bgcolor: changed ? tone.changed : undefined,
                      cursor: c.edit ? 'text' : 'default', fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {isEditing ? (
                      <EditCell
                        col={c}
                        line={l}
                        onDone={(v) => {
                          setEditing(null);
                          if (v !== null && c.edit) onEdit(l, c.edit.field, v);
                        }}
                      />
                    ) : title ? (
                      <Tooltip title={title} placement="bottom-start" enterDelay={600} disableInteractive>
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                          {content}
                        </Box>
                      </Tooltip>
                    ) : (
                      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                        {content}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>
      {lines.length === 0 && (
        <Box sx={{ p: 4, textAlign: 'center', color: tone.inkSoft, fontSize: 14 }}>No lines match.</Box>
      )}
    </Box>
  );
}
