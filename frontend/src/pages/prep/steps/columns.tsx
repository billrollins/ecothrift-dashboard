// The columns of each step: what the step changes, before (grey top line) beside after (green top line).
import { Box, Chip, Link } from '@mui/material';
import type { PrepLine, StepKey } from '../../../api/prepSteps.api';
import type { Column } from './LineTable';
import { money, pct, tone } from './tokens';

const num = (v: number | null | undefined) => (v === null || v === undefined ? null : v);

export function FlagChips({ line, step, text }: { line: PrepLine; step: StepKey; text: Record<string, string> }) {
  const fl = line.flags[step] || [];
  if (!fl.length) return null;
  const done = line.accepted.includes(step);
  return (
    <Box sx={{ display: 'flex', gap: 0.5, overflow: 'hidden' }}>
      {fl.map((f) => (
        <Chip
          key={f}
          size="small"
          label={text[f] || f}
          sx={{
            height: 20, fontSize: 11, bgcolor: done ? tone.goodSoft : tone.openSoft,
            color: done ? tone.good : '#8A5A0B', textDecoration: done ? 'line-through' : 'none',
          }}
        />
      ))}
    </Box>
  );
}

const KIND_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  is: { bg: tone.goodSoft, fg: tone.good, label: 'Is' },
  like: { bg: tone.openSoft, fg: '#8A5A0B', label: 'Like' },
  new: { bg: '#EEF1F6', fg: '#3B4A63', label: 'New' },
};

export function KindChip({ kind, conf }: { kind: string; conf: number | null }) {
  const t = KIND_TONE[kind];
  if (!t) return <Box component="span" sx={{ color: tone.inkFaint }}>-</Box>;
  return (
    <Chip
      size="small"
      label={kind === 'new' ? t.label : `${t.label} ${conf ?? ''}%`}
      sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: t.bg, color: t.fg, minWidth: 64 }}
    />
  );
}

const src = (l: PrepLine, f: string) => l.sources?.[f] || '';
const byAI = (l: PrepLine, f: string) => src(l, f).startsWith('ai:');

function Who({ l, f }: { l: PrepLine; f: string }) {
  const s = src(l, f);
  if (!s || s === 'manifest') return null;
  const label = s === 'staff' ? 'you' : s.startsWith('ai:') ? 'AI' : 'rule';
  const c = s === 'staff' ? tone.good : s.startsWith('ai:') ? tone.ai : tone.inkFaint;
  return (
    <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: c, ml: 0.5, flexShrink: 0 }}>
      {label}
    </Box>
  );
}

function withWho(text: React.ReactNode, l: PrepLine, f: string) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</Box>
      <Who l={l} f={f} />
    </Box>
  );
}

export function columnsFor(step: StepKey, opts: { flagText: Record<string, string>; categories: Record<string, string[]>; targetShare: number; band: number; onOpen?: (l: PrepLine) => void }): Column[] {
  const row: Column = {
    key: 'row', label: '#', width: 56, align: 'right', value: (l) => l.row_number, title: () => '',
    render: (l) => (
      <Link component="button" underline="hover" onClick={() => opts.onOpen?.(l)} sx={{ fontSize: 13 }} aria-label={`Open line ${l.row_number}`}>
        {l.row_number}
      </Link>
    ),
  };
  const flags: Column = {
    key: 'flags', label: 'Open', width: 220, value: (l) => (l.flags[step] || []).join(' '),
    render: (l) => <FlagChips line={l} step={step} text={opts.flagText} />, title: () => '',
  };
  const reason = (f: string, label = 'Why'): Column => ({
    key: `why_${f}`, label, width: 260, grow: true, value: (l) => l.reasons?.[f] || '',
  });
  const cats = ['', ...Object.keys(opts.categories)];

  switch (step) {
    case 'load':
      return [
        row,
        { key: 'src_title', label: 'Seller title', side: 'before', width: 300, grow: true, value: (l) => l.src_title },
        {
          key: 'title', label: 'Title now', side: 'after', width: 300, value: (l) => l.title, edit: { field: 'title', kind: 'text' },
          changed: (l) => l.title !== l.src_title, render: (l) => withWho(l.title, l, 'title'),
        },
        { key: 'src_brand', label: 'Brand', side: 'before', width: 120, value: (l) => l.src_brand },
        {
          key: 'brand', label: 'Brand now', side: 'after', width: 130, value: (l) => l.brand, edit: { field: 'brand', kind: 'text' },
          changed: (l) => l.brand !== l.src_brand, render: (l) => withWho(l.brand, l, 'brand'),
        },
        { key: 'src_model', label: 'Model', width: 110, value: (l) => l.src_model },
        { key: 'src_qty', label: 'Qty', width: 56, align: 'right', value: (l) => l.src_qty },
        { key: 'src_retail', label: 'Unit retail', width: 96, align: 'right', value: (l) => num(l.src_retail), render: (l) => money(l.src_retail) },
        { key: 'src_ext', label: 'Ext. retail', width: 100, align: 'right', value: (l) => num(l.src_ext_retail), render: (l) => money(l.src_ext_retail) },
        { key: 'src_category', label: 'Seller category', width: 170, value: (l) => l.src_category },
        { key: 'src_sub', label: 'Seller sub', width: 170, value: (l) => l.src_subcategory },
        { key: 'src_condition', label: 'Condition', width: 96, value: (l) => l.src_condition },
        { key: 'upc', label: 'UPC', width: 118, value: (l) => l.upc },
        { key: 'item', label: 'Item #', width: 110, value: (l) => l.item_number },
        flags,
      ];
    case 'clean':
      return [
        row,
        { key: 'src_title', label: 'Seller title', side: 'before', width: 320, grow: true, value: (l) => l.src_title },
        {
          key: 'title', label: 'Title', side: 'after', width: 300, value: (l) => l.title, edit: { field: 'title', kind: 'text' },
          changed: (l) => l.title !== l.src_title, render: (l) => withWho(l.title, l, 'title'),
        },
        { key: 'src_brand', label: 'Brand', side: 'before', width: 110, value: (l) => l.src_brand },
        {
          key: 'brand', label: 'Brand', side: 'after', width: 140, value: (l) => l.brand, edit: { field: 'brand', kind: 'text' },
          changed: (l) => l.brand !== l.src_brand, render: (l) => withWho(l.brand, l, 'brand'),
        },
        {
          key: 'model', label: 'Model', side: 'after', width: 110, value: (l) => l.model, edit: { field: 'model', kind: 'text' },
          changed: (l) => l.model !== l.src_model,
        },
        { key: 'qty', label: 'Qty', width: 56, align: 'right', value: (l) => l.qty, edit: { field: 'qty', kind: 'int' }, changed: (l) => l.qty !== l.src_qty },
        flags,
        reason('title'),
      ];
    case 'match':
      return [
        row,
        { key: 'title', label: 'Title', width: 280, grow: true, value: (l) => l.title },
        { key: 'brand', label: 'Brand', width: 120, value: (l) => l.brand },
        { key: 'retail', label: 'Retail', width: 84, align: 'right', value: (l) => num(l.src_retail), render: (l) => money(l.src_retail) },
        {
          key: 'kind', label: 'Match', side: 'after', width: 100, value: (l) => `${l.match_kind}${String(l.match_confidence ?? 0).padStart(3, '0')}`,
          render: (l) => <KindChip kind={l.match_kind} conf={l.match_confidence} />, title: (l) => l.reasons?.match_kind || '',
        },
        {
          key: 'product', label: 'Product', side: 'after', width: 300,
          edit: {
            field: 'match_pick', kind: 'select',
            optionsFor: (l) => [
              ...(l.match_candidates || []).map((c) => ({ value: String(c.product_id), label: `Is ${c.number} ${c.title} (${Math.round(c.sim * 100)})` })),
              ...(l.match_candidates || []).map((c) => ({ value: `like:${c.product_id}`, label: `Like ${c.number} ${c.title}` })),
              { value: 'new', label: 'New product' },
            ],
          },
          value: (l) => (l.match_product_id ? l.product?.title || l.match_candidates?.[0]?.title || String(l.match_product_id) : ''),
          render: (l) => {
            if (!l.match_product_id) return <Box component="span" sx={{ color: tone.inkFaint }}>{l.match_kind === 'new' ? 'Draft a new product' : ''}</Box>;
            const p = l.product || l.match_candidates.find((c) => c.product_id === l.match_product_id);
            return withWho(
              <>
                <Box component="span" sx={{ color: tone.inkSoft, mr: 0.75 }}>{p?.number}</Box>
                {p?.title}
              </>,
              l, 'match_product_id',
            );
          },
          changed: (l) => !!l.match_product_id,
        },
        {
          key: 'ours', label: 'Our retail / sold', width: 130, align: 'right',
          value: (l) => num(l.product?.retail_avg ?? null),
          render: (l) => (l.product ? `${money(l.product.retail_avg, false) || '-'} / ${l.product.sold}` : ''),
        },
        {
          key: 'cands', label: 'Other candidates', width: 300,
          value: (l) => (l.match_candidates || []).filter((c) => c.product_id !== l.match_product_id).map((c) => c.title).join(' | '),
          render: (l) => (l.match_candidates || [])
            .filter((c) => c.product_id !== l.match_product_id)
            .slice(0, 2)
            .map((c) => `${c.number} ${c.title} (${Math.round(c.sim * 100)})`)
            .join('  |  '),
        },
        flags,
        reason('match_kind'),
      ];
    case 'category':
      return [
        row,
        { key: 'title', label: 'Title', width: 300, grow: true, value: (l) => l.title },
        { key: 'src_sub', label: 'Seller category', side: 'before', width: 230, value: (l) => [l.src_category, l.src_subcategory].filter(Boolean).join(' / ') },
        {
          key: 'category', label: 'Category', side: 'after', width: 210, value: (l) => l.category,
          edit: { field: 'category', kind: 'select', options: cats }, render: (l) => withWho(l.category, l, 'category'),
          changed: (l) => !!l.category,
        },
        {
          key: 'subcategory', label: 'Subcategory', side: 'after', width: 170, value: (l) => l.subcategory,
          edit: { field: 'subcategory', kind: 'select', options: ['', ...Array.from(new Set(Object.values(opts.categories).flat()))] },
          changed: (l) => !!l.subcategory,
        },
        { key: 'kind', label: 'Match', width: 90, value: (l) => l.match_kind, render: (l) => <KindChip kind={l.match_kind} conf={l.match_confidence} /> },
        flags,
        reason('category'),
      ];
    case 'retail':
      return [
        row,
        { key: 'title', label: 'Title', width: 300, grow: true, value: (l) => l.title },
        { key: 'qty', label: 'Qty', width: 52, align: 'right', value: (l) => l.qty },
        { key: 'pack', label: 'Pack', width: 110, value: (l) => l.pack },
        { key: 'src_retail', label: 'Manifest', side: 'before', width: 104, align: 'right', value: (l) => num(l.src_retail), render: (l) => money(l.src_retail) },
        {
          key: 'retail', label: 'Retail', side: 'after', width: 128, align: 'right', value: (l) => num(l.retail),
          render: (l) => withWho(money(l.retail), l, 'retail'), edit: { field: 'retail', kind: 'money' },
          changed: (l) => l.retail !== l.src_retail,
        },
        {
          key: 'ours', label: 'Product retail', width: 130, align: 'right', value: (l) => num(l.product?.retail_avg ?? null),
          render: (l) => (l.product?.retail_avg ? `${l.match_kind === 'like' ? 'like ' : ''}${money(l.product.retail_avg)}` : ''),
        },
        {
          key: 'ratio', label: 'Manifest / ours', width: 120, align: 'right',
          value: (l) => (l.product?.retail_avg && l.src_retail ? l.src_retail / l.product.retail_avg : null),
          render: (l) => (l.product?.retail_avg && l.src_retail ? `${(l.src_retail / l.product.retail_avg).toFixed(1)}x` : ''),
        },
        { key: 'kind', label: 'Match', width: 90, value: (l) => l.match_kind, render: (l) => <KindChip kind={l.match_kind} conf={l.match_confidence} /> },
        flags,
        reason('retail'),
      ];
    case 'price': {
      const share = (l: PrepLine) => (l.price && l.retail ? l.price / l.retail : null);
      return [
        row,
        { key: 'title', label: 'Title', width: 240, grow: true, value: (l) => l.title },
        { key: 'category', label: 'Category', width: 150, value: (l) => l.category },
        { key: 'qty', label: 'Qty', width: 52, align: 'right', value: (l) => l.qty * Math.max(1, l.pieces || 1) },
        { key: 'retail', label: 'Retail', side: 'before', width: 92, align: 'right', value: (l) => num(l.retail), render: (l) => money(l.retail) },
        {
          key: 'price', label: 'Price', side: 'after', width: 92, align: 'right', value: (l) => num(l.price),
          render: (l) => withWho(money(l.price), l, 'price'), edit: { field: 'price', kind: 'money' }, changed: (l) => !!l.price,
        },
        {
          key: 'share', label: '% of retail', width: 96, align: 'right', value: (l) => share(l),
          render: (l) => {
            const s = share(l);
            if (s === null) return '';
            const off = !['S1', 'PL'].includes(l.price_class) && Math.abs(s - opts.targetShare) > opts.band;
            return <Box component="span" sx={{ fontWeight: off ? 800 : 400, color: off ? tone.bad : tone.ink }}>{pct(s)}</Box>;
          },
        },
        {
          key: 'class', label: 'Class', width: 92, value: (l) => l.price_class, edit: { field: 'price_class', kind: 'select', options: ['S1', 'PL', 'XMAS', 'TOY', 'HBA', 'TOOL', 'GEN', 'FURN', 'APP', 'HOLD', 'DEEP', 'UNK'] },
          render: (l) => withWho(l.price_class, l, 'price_class'),
        },
        {
          key: 'line_tag', label: 'Line tag', width: 96, align: 'right',
          value: (l) => (l.price ? l.price * l.qty * Math.max(1, l.pieces || 1) : null),
          render: (l) => money(l.price ? l.price * l.qty * Math.max(1, l.pieces || 1) : null, false),
        },
        {
          key: 'sold', label: 'Product sold at', width: 130, align: 'right', value: (l) => num(l.product?.avg_sold ?? null),
          render: (l) => (l.product?.sold ? `${l.match_kind === 'like' ? 'like ' : ''}${money(l.product.avg_sold)} x${l.product.sold}` : ''),
          title: (l) => (l.product?.sold ? `${l.match_kind === 'like' ? 'A similar product' : 'This product'} (${l.product.number}) sold ${l.product.sold} times` : ''),
        },
        { ...flags, width: 170 },
        reason('price'),
      ];
    }
    case 'packs':
      return [
        row,
        { key: 'src_title', label: 'Seller title', side: 'before', width: 340, grow: true, value: (l) => l.src_title },
        { key: 'qty', label: 'Qty', width: 52, align: 'right', value: (l) => l.qty },
        { key: 'pack', label: 'Pack', side: 'after', width: 160, value: (l) => l.pack, render: (l) => withWho(l.pack, l, 'pack_units') },
        { key: 'pack_units', label: 'Units', width: 64, align: 'right', value: (l) => l.pack_units, edit: { field: 'pack_units', kind: 'int' } },
        { key: 'unit_name', label: 'Unit', width: 80, value: (l) => l.unit_name, edit: { field: 'unit_name', kind: 'text' } },
        { key: 'unit_count', label: 'Count/unit', width: 86, align: 'right', value: (l) => l.unit_count, edit: { field: 'unit_count', kind: 'int' } },
        {
          key: 'sell_as', label: 'Sell as', side: 'after', width: 90, value: (l) => l.sell_as,
          render: (l) => (l.sell_as === 'units' ? 'By unit' : l.sell_as === 'whole' ? 'Whole' : ''),
          edit: { field: 'sell_as', kind: 'select', options: ['whole', 'units'] }, changed: (l) => !!l.sell_as,
        },
        { key: 'pieces', label: 'Tags', width: 60, align: 'right', value: (l) => l.qty * Math.max(1, l.pieces || 1), changed: (l) => (l.pieces || 1) > 1 },
        { key: 'retail', label: 'Retail/tag', width: 92, align: 'right', value: (l) => num(l.retail), render: (l) => money(l.retail) },
        { key: 'price', label: 'Price/tag', width: 92, align: 'right', value: (l) => num(l.price), render: (l) => money(l.price) },
        flags,
        reason('pack_units'),
      ];
    case 'send':
    default:
      return [
        row,
        { key: 'title', label: 'Title', width: 260, grow: true, value: (l) => l.title },
        {
          key: 'tags', label: 'search_tags', side: 'after', width: 260, value: (l) => (l.search_tags || []).join(' | '),
          render: (l) => withWho((l.search_tags || []).join('  |  '), l, 'search_tags'),
        },
        {
          key: 'match', label: 'product_match', side: 'after', width: 190, value: (l) => `${l.match_kind}${l.match_confidence ?? ''}`,
          render: (l) => (
            <Box component="span" sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'center' }}>
              <KindChip kind={l.match_kind} conf={l.match_confidence} />
              <span>{l.match_product_id ? l.product?.number || l.match_candidates.find((c) => c.product_id === l.match_product_id)?.number : ''}</span>
            </Box>
          ),
        },
        {
          key: 'draft', label: 'product_draft', side: 'after', width: 120, value: (l) => (l.match_kind !== 'is' ? 1 : 0),
          render: (l) => (l.match_kind !== 'is' ? (
            <Box component="span" sx={{ display: 'inline-flex', gap: 0.75 }}>
              Draft
              {l.image_url && <Link href={l.image_url} target="_blank" rel="noreferrer" underline="hover">photo</Link>}
            </Box>
          ) : ''),
        },
        { key: 'price', label: 'price', side: 'after', width: 84, align: 'right', value: (l) => num(l.price), render: (l) => money(l.price) },
        { key: 'retail', label: 'retail', side: 'after', width: 84, align: 'right', value: (l) => num(l.retail), render: (l) => money(l.retail) },
        { key: 'pieces', label: 'pieces', side: 'after', width: 64, align: 'right', value: (l) => l.qty * Math.max(1, l.pieces || 1) },
        { key: 'category', label: 'Category', width: 170, value: (l) => l.category },
        flags,
        { key: 'why', label: 'Why (price)', width: 220, value: (l) => l.reasons?.price || '' },
      ];
  }
}

export const AI_BY_FIELD = byAI;
