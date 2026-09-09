import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useUpdateWebListing } from '../../hooks/useWebStore';
import type { WebListing } from '../../api/webstore.api';

export type ListingForm = {
  title: string;
  sku: string;
  description: string;
  condition: string;
  price: string;
  compare_at_price: string;
  on_hand: string;
  category: string;
  featured: boolean;
  return_policy: string;
  fb_title: string;
  fb_body: string;
  fb_posted_url: string;
};

const AUTOSAVE_KEYS = [
  'title',
  'sku',
  'description',
  'condition',
  'price',
  'compare_at_price',
  'on_hand',
  'category',
  'featured',
  'return_policy',
  'fb_title',
  'fb_body',
] as const;

export type ListingSaveState = 'clean' | 'unsaved' | 'saving' | 'saved' | 'error';

export function listingToForm(listing: WebListing | null | undefined): ListingForm {
  return {
    title: listing?.title || '',
    sku: listing?.sku || '',
    description: listing?.description || '',
    condition: listing?.condition || 'good',
    price: listing?.price || '',
    compare_at_price: listing?.compare_at_price || '',
    on_hand: String(listing?.on_hand ?? 1),
    category: listing?.category != null ? String(listing.category) : '',
    featured: Boolean(listing?.featured),
    return_policy: listing?.return_policy || 'final_sale',
    fb_title: listing?.fb_title || '',
    fb_body: listing?.fb_body || '',
    fb_posted_url: listing?.fb_posted_url || '',
  };
}

function formToPatch(form: ListingForm, keys: string[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === 'title') data.title = form.title;
    if (key === 'sku') data.sku = form.sku;
    if (key === 'description') data.description = form.description;
    if (key === 'condition') data.condition = form.condition;
    if (key === 'price') data.price = form.price || '0';
    if (key === 'compare_at_price') data.compare_at_price = form.compare_at_price || null;
    if (key === 'on_hand') data.on_hand = Number(form.on_hand) || 1;
    if (key === 'category') data.category = form.category ? Number(form.category) : null;
    if (key === 'featured') data.featured = form.featured;
    if (key === 'return_policy') data.return_policy = form.return_policy;
    if (key === 'fb_title') data.fb_title = form.fb_title;
    if (key === 'fb_body') data.fb_body = form.fb_body;
  }
  return data;
}

export function useListingDraft(listing: WebListing | null | undefined) {
  const updateListing = useUpdateWebListing();
  const [form, setForm] = useState<ListingForm>(() => listingToForm(listing));
  const [saveState, setSaveState] = useState<ListingSaveState>('clean');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [dirtyVersion, setDirtyVersion] = useState(0);
  const dirtyRef = useRef<Set<string>>(new Set());
  const formRef = useRef(form);
  const listingIdRef = useRef<number | null>(listing?.id ?? null);
  const savingRef = useRef(false);

  formRef.current = form;

  useEffect(() => {
    if (!listing) return;
    const incoming = listingToForm(listing);
    if (listingIdRef.current !== listing.id) {
      listingIdRef.current = listing.id;
      dirtyRef.current = new Set();
      setForm(incoming);
      setDirtyVersion((v) => v + 1);
      setSaveState('clean');
      return;
    }
    setForm((prev) => {
      const next = { ...prev };
      (Object.keys(incoming) as (keyof ListingForm)[]).forEach((key) => {
        if (!dirtyRef.current.has(key)) {
          next[key] = incoming[key] as never;
        }
      });
      return next;
    });
  }, [listing]);

  const setField = useCallback((key: keyof ListingForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    dirtyRef.current.add(key);
    setDirtyVersion((v) => v + 1);
    setSaveState('unsaved');
  }, []);

  const replaceFields = useCallback(
    (patch: Partial<ListingForm>, opts?: { saved?: boolean }) => {
      setForm((prev) => ({ ...prev, ...patch }));
      if (opts?.saved) {
        Object.keys(patch).forEach((key) => dirtyRef.current.delete(key));
        setDirtyVersion((v) => v + 1);
      }
    },
    [],
  );

  const acceptPostedUrl = useCallback((url: string) => {
    dirtyRef.current.delete('fb_posted_url');
    setForm((prev) => ({ ...prev, fb_posted_url: url }));
    setDirtyVersion((v) => v + 1);
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (!listing || savingRef.current) return true;
    const keys = [...dirtyRef.current].filter((key) =>
      (AUTOSAVE_KEYS as readonly string[]).includes(key),
    );
    if (keys.length === 0) return true;
    savingRef.current = true;
    setSaveState('saving');
    try {
      await updateListing.mutateAsync({
        id: listing.id,
        data: formToPatch(formRef.current, keys),
      });
      keys.forEach((key) => dirtyRef.current.delete(key));
      setDirtyVersion((v) => v + 1);
      setLastSavedAt(new Date());
      setSaveState(dirtyRef.current.size > 0 ? 'unsaved' : 'saved');
      return true;
    } catch {
      setSaveState('error');
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [listing, updateListing]);

  const dirtyPayload = useMemo(() => {
    const keys = [...dirtyRef.current]
      .filter((key) => (AUTOSAVE_KEYS as readonly string[]).includes(key))
      .sort();
    const slice: Record<string, unknown> = {};
    const current = form;
    for (const key of keys) {
      slice[key] = current[key as keyof ListingForm];
    }
    return JSON.stringify(slice);
  }, [form, dirtyVersion]);

  const debounced = useDebouncedValue(dirtyPayload, 1500);

  useEffect(() => {
    if (debounced === '{}') return;
    void flush();
  }, [debounced, flush]);

  useEffect(() => {
    const dirty = () => dirtyRef.current.size > 0;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return {
    form,
    setField,
    replaceFields,
    acceptPostedUrl,
    flush,
    saveState,
    lastSavedAt,
    isDirty: dirtyRef.current.size > 0,
  };
}
