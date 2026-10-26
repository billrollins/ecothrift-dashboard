/**
 * One supply list (owner, 2026-10-26). Everyone sees it; managers and the owner add, edit and remove items, rename or
 * archive the list, and import a CSV (template to download). Add item can start from a pasted link: the AI fills the
 * name, pack and (from page text the person pastes) the price, and the person checks it before saving. The server
 * never opens the vendor's page. Desk: a table. Phone: one card per item.
 */
import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip,
  Typography, useMediaQuery, useTheme, Paper,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  addSupplyItem, aiFillSupply, downloadSupplyTemplate, getSupplyList, importSupplyCsv, removeSupplyItem,
  updateSupplyItem, updateSupplyList, type ImportResult, type SupplyItem, type SupplyItemInput,
} from '../../api/supplies.api';
import { PageHeader } from '../../components/common/PageHeader';
import { ECO_ICONS } from '../../icons/ecoIcons';
import { formatCurrency } from '../../utils/format';
import { apiError, deadlineText, OutLink, packText, whenText } from './supplyBits';

type Draft = {
  name: string; description: string; vendor: string; vendor_url: string; url: string; vendor_item_id: string;
  pack_size: string; unit: string; min_qty: string; max_qty: string; price: string;
};

const EMPTY: Draft = {
  name: '', description: '', vendor: '', vendor_url: '', url: '', vendor_item_id: '', pack_size: '1', unit: 'each',
  min_qty: '0', max_qty: '0', price: '',
};

function toDraft(item: SupplyItem): Draft {
  return {
    name: item.name, description: item.description, vendor: item.vendor, vendor_url: item.vendor_url, url: item.url,
    vendor_item_id: item.vendor_item_id, pack_size: String(item.pack_size), unit: item.unit,
    min_qty: String(item.min_qty), max_qty: String(item.max_qty), price: item.price ?? '',
  };
}

function toInput(d: Draft): SupplyItemInput {
  return {
    name: d.name.trim(), description: d.description.trim(), vendor: d.vendor.trim(), vendor_url: d.vendor_url.trim(),
    url: d.url.trim(), vendor_item_id: d.vendor_item_id.trim(), pack_size: Number(d.pack_size) || 1,
    unit: d.unit.trim() || 'each', min_qty: Number(d.min_qty) || 0, max_qty: Number(d.max_qty) || 0,
    price: d.price.trim() ? d.price.trim().replace('$', '') : null,
  };
}

function ItemDialog({ listId, item, open, onClose }: {
  listId: number; item: SupplyItem | null; open: boolean; onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(item ? toDraft(item) : EMPTY);
  const [link, setLink] = useState('');
  const [pageText, setPageText] = useState('');
  const [aiNote, setAiNote] = useState('');
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value });

  const fill = useMutation({
    mutationFn: () => aiFillSupply({ url: link.trim(), page_text: pageText }),
    onSuccess: (r) => {
      setDraft({
        ...draft, name: r.name || draft.name, description: r.description || draft.description,
        vendor: r.vendor || draft.vendor, vendor_url: r.vendor_url || draft.vendor_url, url: r.url || draft.url,
        vendor_item_id: r.vendor_item_id || draft.vendor_item_id, pack_size: String(r.pack_size || 1),
        unit: r.unit || draft.unit, price: r.price ?? draft.price,
      });
      setAiNote(r.price_found
        ? 'Filled in. Check every field before you save.'
        : 'Filled in, but no price: paste the page text (select all on the page, copy, paste) and fill again, or type it.');
    },
    onError: (err) => enqueueSnackbar(apiError(err, 'The AI could not fill it.'), { variant: 'error' }),
  });

  const save = useMutation({
    mutationFn: () => (item ? updateSupplyItem(item.id, toInput(draft)) : addSupplyItem(listId, toInput(draft))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplies'] });
      enqueueSnackbar(item ? 'Item saved' : 'Item added', { variant: 'success' });
      onClose();
    },
    onError: (err) => enqueueSnackbar(apiError(err, 'Could not save the item.'), { variant: 'error' }),
  });

  const min = Number(draft.min_qty);
  const max = Number(draft.max_qty);
  const rangeBad = Number.isFinite(min) && Number.isFinite(max) && max < min;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle>{item ? 'Edit item' : 'Add item'}</DialogTitle>
      <DialogContent>
        {!item && (
          <Paper variant="outlined" sx={{ p: 2, mt: 1, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Start from a link (Amazon or any vendor)</Typography>
            <Stack spacing={1.5}>
              <TextField size="small" label="Paste the item's link" value={link} onChange={(e) => setLink(e.target.value)} />
              <TextField
                size="small" label="Page text, for the price (optional)" value={pageText}
                onChange={(e) => setPageText(e.target.value)} multiline minRows={2} maxRows={6}
                helperText="On the item's page: select all, copy, paste here. We never open the vendor's site."
              />
              <Box>
                <Button variant="outlined" disabled={!link.trim() || fill.isPending} onClick={() => fill.mutate()}>
                  {fill.isPending ? 'Filling…' : 'Fill with AI'}
                </Button>
              </Box>
              {aiNote && <Alert severity={aiNote.startsWith('Filled in.') ? 'success' : 'warning'}>{aiNote}</Alert>}
            </Stack>
          </Paper>
        )}
        <Box sx={{ display: 'grid', gap: 2, mt: item ? 1 : 0, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          <TextField label="Name" value={draft.name} onChange={set('name')} required sx={{ gridColumn: { sm: '1 / -1' } }} />
          <TextField label="Description" value={draft.description} onChange={set('description')} sx={{ gridColumn: { sm: '1 / -1' } }} />
          <TextField label="Vendor" value={draft.vendor} onChange={set('vendor')} />
          <TextField label="Vendor's site" value={draft.vendor_url} onChange={set('vendor_url')} placeholder="https://" />
          <TextField label="Item link" value={draft.url} onChange={set('url')} placeholder="https://" sx={{ gridColumn: { sm: '1 / -1' } }} />
          <TextField label="Vendor id (Amazon ASIN)" value={draft.vendor_item_id} onChange={set('vendor_item_id')} />
          <TextField label="Unit (what staff count)" value={draft.unit} onChange={set('unit')} helperText="roll, box, bag, each" />
          <TextField label="Pack size" type="number" value={draft.pack_size} onChange={set('pack_size')}
            helperText="Units in one pack you buy" slotProps={{ htmlInput: { min: 1 } }} />
          <TextField label="Price of one pack" value={draft.price} onChange={set('price')} placeholder="0.00" />
          <TextField label="Min" type="number" value={draft.min_qty} onChange={set('min_qty')}
            helperText="At or under this, order" slotProps={{ htmlInput: { min: 0 } }} />
          <TextField label="Max" type="number" value={draft.max_qty} onChange={set('max_qty')} error={rangeBad}
            helperText={rangeBad ? 'Max is below min' : 'Order back up to this'} slotProps={{ htmlInput: { min: 0 } }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!draft.name.trim() || rangeBad || save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ImportButton({ listId }: { listId: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const run = useMutation({
    mutationFn: (file: File) => importSupplyCsv(listId, file),
    onSuccess: (r) => {
      setResult(r);
      if (!r.errors.length) {
        queryClient.invalidateQueries({ queryKey: ['supplies'] });
        enqueueSnackbar(`Imported: ${r.added} added, ${r.updated} updated`, { variant: 'success' });
      }
    },
    onError: (err) => enqueueSnackbar(apiError(err, 'Could not import the file.'), { variant: 'error' }),
  });
  const template = async () => {
    const blob = await downloadSupplyTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'supply-list-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <Button variant="outlined" onClick={() => input.current?.click()} disabled={run.isPending}>Import CSV</Button>
      <Button onClick={template}>Template</Button>
      <input
        ref={input} type="file" accept=".csv,text/csv" hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) run.mutate(file);
          e.target.value = '';
        }}
      />
      <Dialog open={!!result?.errors.length} onClose={() => setResult(null)} fullWidth maxWidth="sm">
        <DialogTitle>Nothing imported: fix these rows</DialogTitle>
        <DialogContent>
          {result?.errors.map((e) => (
            <Typography key={`${e.row}-${e.error}`} variant="body2">Row {e.row}: {e.error}</Typography>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={() => setResult(null)}>OK</Button></DialogActions>
      </Dialog>
    </>
  );
}

function RenameDialog({ id, name, open, onClose }: { id: number; name: string; open: boolean; onClose: () => void }) {
  const [value, setValue] = useState(name);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => updateSupplyList(id, { name: value.trim() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['supplies'] }); onClose(); },
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Rename list</DialogTitle>
      <DialogContent><TextField fullWidth sx={{ mt: 1 }} value={value} onChange={(e) => setValue(e.target.value)} /></DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!value.trim()} onClick={() => save.mutate()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

function ItemActions({ item, onEdit, onRemove }: { item: SupplyItem; onEdit: () => void; onRemove: () => void }) {
  const Edit = ECO_ICONS.edit;
  const Remove = ECO_ICONS.delete;
  return (
    <Stack direction="row" spacing={0.5}>
      <Tooltip title="Edit"><IconButton size="small" onClick={onEdit} aria-label={`Edit ${item.name}`}><Edit fontSize="small" /></IconButton></Tooltip>
      <Tooltip title="Take off the list"><IconButton size="small" onClick={onRemove} aria-label={`Remove ${item.name}`}><Remove fontSize="small" /></IconButton></Tooltip>
    </Stack>
  );
}

export default function SupplyListPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [editing, setEditing] = useState<SupplyItem | 'new' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['supplies', 'list', id], queryFn: () => getSupplyList(id) });

  const remove = useMutation({
    mutationFn: (item: SupplyItem) => removeSupplyItem(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplies'] }),
    onError: (err) => enqueueSnackbar(apiError(err, 'Could not remove it.'), { variant: 'error' }),
  });
  const archive = useMutation({
    mutationFn: (active: boolean) => updateSupplyList(id, { is_active: active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplies'] }),
  });
  const askRemove = (item: SupplyItem) => {
    if (window.confirm(`Take ${item.name} off the list? Past counts and orders keep it.`)) remove.mutate(item);
  };

  const canEdit = !!data?.can_edit;
  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <PageHeader
        title={data?.name ?? 'Supply list'}
        subtitle={data ? `${data.department_name || 'Named list'} · ${data.items.length} items · count due ${deadlineText(data.cycle.deadline)}` : undefined}
        action={(
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Button onClick={() => navigate('/supplies')}>All lists</Button>
            {data?.is_active && (
              <Button variant="contained" onClick={() => navigate(`/supplies/count/${id}`)} disabled={!data.items.length}>
                Count
              </Button>
            )}
            {canEdit && <Button variant="outlined" onClick={() => setEditing('new')}>Add item</Button>}
            {canEdit && <ImportButton listId={id} />}
            {canEdit && <Button onClick={() => setRenaming(true)}>Rename</Button>}
            {canEdit && data && (
              <Button color={data.is_active ? 'warning' : 'primary'} onClick={() => archive.mutate(!data.is_active)}>
                {data.is_active ? 'Archive list' : 'Bring back'}
              </Button>
            )}
          </Stack>
        )}
      />
      {isLoading && <LinearProgress />}
      {error && <Alert severity="error">{apiError(error, 'Could not load the list.')}</Alert>}
      {data && !data.is_active && <Alert severity="warning" sx={{ mb: 2 }}>This list is archived: nobody counts it and it is not ordered.</Alert>}
      {data?.count && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Counted this week by {data.count.counted_by}, {whenText(data.count.submitted_at)}.
        </Alert>
      )}
      {data && data.items.length === 0 && (
        <Typography color="text.secondary">No items yet.{canEdit ? ' Add one, or import a CSV.' : ''}</Typography>
      )}
      {data && data.items.length > 0 && phone && (
        <Stack spacing={1.5}>
          {data.items.map((item) => (
            <Card key={item.id} variant="outlined">
              <CardContent sx={{ pb: '12px !important' }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }}><OutLink href={item.url}>{item.name}</OutLink></Typography>
                    {item.description && <Typography variant="body2" color="text.secondary">{item.description}</Typography>}
                  </Box>
                  {canEdit && <ItemActions item={item} onEdit={() => setEditing(item)} onRemove={() => askRemove(item)} />}
                </Stack>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  <OutLink href={item.vendor_url}>{item.vendor || 'No vendor'}</OutLink>
                  {item.vendor_item_id && ` · ${item.vendor_item_id}`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Min {item.min_qty} · Max {item.max_qty} · {packText(item.pack_size, item.unit)} · {item.price ? formatCurrency(item.price) : 'no price'}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
      {data && data.items.length > 0 && !phone && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell>Vendor</TableCell>
                <TableCell>Vendor id</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell align="right">Pack</TableCell>
                <TableCell align="right">Min</TableCell>
                <TableCell align="right">Max</TableCell>
                <TableCell align="right">Price / pack</TableCell>
                {canEdit && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <OutLink href={item.url}>{item.name}</OutLink>
                    {item.description && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{item.description}</Typography>}
                  </TableCell>
                  <TableCell><OutLink href={item.vendor_url}>{item.vendor || '-'}</OutLink></TableCell>
                  <TableCell>{item.vendor_item_id || '-'}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell align="right">{item.pack_size}</TableCell>
                  <TableCell align="right">{item.min_qty}</TableCell>
                  <TableCell align="right">{item.max_qty}</TableCell>
                  <TableCell align="right">{item.price ? formatCurrency(item.price) : '-'}</TableCell>
                  {canEdit && (
                    <TableCell align="right" sx={{ width: 90 }}>
                      <ItemActions item={item} onEdit={() => setEditing(item)} onRemove={() => askRemove(item)} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {editing && (
        <ItemDialog
          key={editing === 'new' ? 'new' : editing.id}
          listId={id}
          item={editing === 'new' ? null : editing}
          open
          onClose={() => setEditing(null)}
        />
      )}
      {renaming && data && <RenameDialog id={id} name={data.name} open onClose={() => setRenaming(false)} />}
    </Box>
  );
}
