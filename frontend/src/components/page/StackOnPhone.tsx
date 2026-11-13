/**
 * Tables on a phone: every table inside this wrapper becomes a list of cards below 600px, so
 * nothing has to be scrolled sideways. The shell wraps every page in it (phase 2: components/layout/MainLayout.tsx; phase 1: the Design Lab demos).
 *
 * How a row becomes a card:
 *   - the header row is hidden;
 *   - the first cell is the card's title;
 *   - every other cell is one line: the column's heading on the left, the value on the right
 *     (the heading is copied from the header row into `data-label` by the effect below);
 *   - a cell with no heading (an actions column) keeps its buttons, right-aligned;
 *   - an empty cell is dropped; a full-width cell (colSpan: "No requests yet") stays as it is.
 *
 * Per table or per column, in the page's own markup:
 *   <Table className="eco-no-stack">          keep this table as a table (it scrolls sideways)
 *   <TableCell data-phone="hide">Unit</...>  on a header cell: leave this column out on a phone
 *   A column the page already hides at phone width (display: { xs: 'none' }) is left out too;
 *   data-phone="show" on its header cell brings it back in the card.
 *
 * Desktop and tablet are untouched.
 */
import { Box, type BoxProps } from '@mui/material';
import { useEffect, useRef } from 'react';

function labelTables(root: HTMLElement) {
  root.querySelectorAll<HTMLTableElement>('table:not(.eco-no-stack)').forEach((table) => {
    const heads = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead tr:last-child > *'));
    // Column index -> heading, allowing for header cells that span several columns.
    const columns: { label: string; hide: boolean }[] = [];
    heads.forEach((th) => {
      for (let i = 0; i < (th.colSpan || 1); i += 1) {
        // Left out on a phone: marked so by the page, or already hidden by the page at this width.
        const hide = th.dataset.phone === 'hide' || (th.dataset.phone !== 'show' && getComputedStyle(th).display === 'none');
        const text = (th.textContent ?? '').trim();
        // "Actions" says nothing on a card: the buttons speak for themselves.
        columns.push({ label: /^actions?$/i.test(text) ? '' : text, hide });
      }
    });
    table.querySelectorAll<HTMLTableRowElement>('tbody > tr').forEach((row) => {
      let column = 0;
      Array.from(row.children).forEach((cell) => {
        const td = cell as HTMLTableCellElement;
        const span = td.colSpan || 1;
        if (span === 1) {
          const info = columns[column];
          const label = info?.label ?? '';
          if (td.dataset.label !== label) td.dataset.label = label;
          const mark = info?.hide ? 'hide' : '';
          if ((td.dataset.phone ?? '') !== mark) td.dataset.phone = mark;
        }
        column += span;
      });
    });
  });
}

export default function StackOnPhone({ sx, ...props }: BoxProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    labelTables(root);
    // Rows arrive and change as data loads; label them as they come. Only child changes are watched,
    // so setting the label attributes here never re-triggers the observer.
    const observer = new MutationObserver(() => labelTables(root));
    observer.observe(root, { childList: true, subtree: true });
    // Which columns a page hides depends on the width, so look again when it changes (a phone turned sideways).
    const onResize = () => labelTables(root);
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <Box
      ref={ref}
      {...props}
      sx={[
        (theme) => ({
          [theme.breakpoints.down('sm')]: {
            // A long word with nowhere to break (a file name with underscores) wraps instead of widening the page.
            overflowWrap: 'break-word',
            '& .MuiTableContainer-root:not(:has(table.eco-no-stack))': { overflowX: 'visible' },
            '& table:not(.eco-no-stack)': {
              display: 'block',
              minWidth: '0 !important',
              '& > thead': { display: 'none' },
              '& > tbody': { display: 'block' },
              '& > tbody > tr': {
                display: 'block',
                padding: '10px 14px',
                borderBottom: `1px solid ${theme.palette.divider}`,
                '&:last-of-type': { borderBottom: 0 },
              },
              '& > tbody > tr > *': {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                // Strings, not numbers: in `sx` a bare number on gap or padding means theme spacing units.
                gap: '12px',
                flexDirection: 'row',
                padding: '3px 0',
                border: 0,
                textAlign: 'right',
                minHeight: 26,
                position: 'static',
                backgroundColor: 'transparent',
                width: 'auto',
                maxWidth: 'none',
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
                '& > *': { minWidth: 0, maxWidth: '100%' },
                '&::before': {
                  content: 'attr(data-label)',
                  flexShrink: 0,
                  textAlign: 'left',
                  color: theme.palette.text.secondary,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                },
                '& .MuiTypography-noWrap': { whiteSpace: 'normal' },
              },
              // The first cell is the card's title.
              '& > tbody > tr > *:first-of-type': {
                display: 'block',
                textAlign: 'left',
                fontWeight: 600,
                fontSize: '0.9375rem',
                paddingBottom: '6px',
                '&::before': { content: 'none' },
              },
              // A column without a heading (actions): no label, buttons to the right.
              '& > tbody > tr > *[data-label=""]': { justifyContent: 'flex-end', '&::before': { content: 'none' } },
              '& > tbody > tr > *:not([data-label])::before': { content: 'none' },
              '& > tbody > tr > *[data-label=""]:first-of-type': { justifyContent: 'flex-start' },
              // A lone menu or icon button at the end of the row sits in the card's top-right corner instead of taking a line.
              '& > tbody > tr:has(> *[data-label=""]:last-child > .MuiIconButton-root:only-child)': { position: 'relative', paddingRight: '48px' },
              '& > tbody > tr > *[data-label=""]:last-child:has(> .MuiIconButton-root:only-child)': {
                position: 'absolute',
                top: '4px',
                right: '4px',
                padding: 0,
                minHeight: 0,
              },
              '& > tbody > tr > *:empty, & > tbody > tr > *[data-phone="hide"]': { display: 'none' },
              // A full-width cell ("No requests yet", a group heading) stays one block.
              '& > tbody > tr > *[colspan]:not([colspan="1"])': {
                display: 'block',
                textAlign: 'center',
                fontWeight: 400,
                '&::before': { content: 'none' },
              },
            },
          },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
