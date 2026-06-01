import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  useArchiveBlogPost,
  useBlogPosts,
  useBlogSeriesList,
  useCreateBlogPost,
  useCreateBlogSeries,
  useDuplicateBlogPost,
  usePublishBlogPostNow,
  useScheduleBlogPost,
  useUpdateBlogPost,
  useUploadBlogImage,
} from '../../hooks/useBlogStudio';
import type { BlogPost, BlogStatus } from '../../api/blog.api';
import { editorExtensions, EditorToolbar } from './StudioEditor';
import { cleanPastedHtml } from './blogTiptapExtensions';
import './blogStudio.css';

type Segment = 'draft' | 'scheduled' | 'published';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Form {
  title: string;
  excerpt: string;
  heroAlt: string;
  seriesId: string; // '' = none
  scheduleDate: string; // yyyy-MM-dd
  scheduleTime: string; // HH:mm
}

const EMPTY_FORM: Form = {
  title: '',
  excerpt: '',
  heroAlt: '',
  seriesId: '',
  scheduleDate: '',
  scheduleTime: '09:00',
};

const STATUS_DOT: Record<BlogStatus, string> = {
  draft: 'd',
  scheduled: 's',
  published: 'p',
  archived: 'a',
};

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: 'draft', label: 'Drafts' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
];

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function clientSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  );
}

function isTipTapDoc(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && 'content' in (value as Record<string, unknown>);
}

/** Build the PATCH payload. One function for both autosave + the saved-baseline so the
 *  serialized strings line up exactly (no spurious save right after loading a post). */
function buildPayload(v: {
  title: string;
  excerpt: string;
  heroAlt: string;
  seriesId: string;
  heroImageId: number | null;
  bodyHtml: string;
  bodyJson: Record<string, unknown>;
  status: BlogStatus;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: v.title.trim() || 'Untitled post',
    excerpt: v.excerpt,
    hero_alt: v.heroAlt,
    series: v.seriesId === '' ? null : Number(v.seriesId),
    hero_image: v.heroImageId,
    body_html: v.bodyHtml,
    body_json: v.bodyJson,
  };
  // While a post is still a draft we keep the slug tracking the title; once published the
  // backend locks it, so we stop sending slug.
  if (v.status === 'draft') payload.slug = '';
  return payload;
}

function listMeta(post: BlogPost): string {
  if (post.status === 'scheduled' && post.scheduled_for) {
    return `${format(new Date(post.scheduled_for), 'MMM d, h:mmaaa')}`;
  }
  if (post.status === 'published' && post.published_at) {
    return format(new Date(post.published_at), 'MMM d');
  }
  return `edited ${formatDistanceToNowStrict(new Date(post.updated_at), { addSuffix: true })}`;
}

function selectLinkCardFromEvent(view: EditorView, event: MouseEvent): boolean {
  const rawTarget = event.target;
  const target =
    rawTarget instanceof Element
      ? rawTarget
      : rawTarget instanceof Node
        ? rawTarget.parentElement
        : null;
  const card = target?.closest('a.bt-linkcard');
  if (!card || !view.dom.contains(card)) return false;

  event.preventDefault();
  event.stopPropagation();

  try {
    const rawPos = view.posAtDOM(card, 0);
    const resolved = view.state.doc.resolve(rawPos);
    const pos =
      resolved.nodeAfter?.type.name === 'linkCard'
        ? rawPos
        : resolved.nodeBefore?.type.name === 'linkCard'
          ? rawPos - resolved.nodeBefore.nodeSize
          : null;

    if (pos != null) {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
      view.focus();
    }
  } catch {
    // If ProseMirror cannot map the DOM position, still block navigation in the editor.
  }

  return true;
}

export default function BlogStudioPage() {
  const { enqueueSnackbar } = useSnackbar();

  const { data: posts, isLoading: postsLoading } = useBlogPosts();
  const { data: series } = useBlogSeriesList();

  const updateMutation = useUpdateBlogPost();
  const createMutation = useCreateBlogPost();
  const publishMutation = usePublishBlogPostNow();
  const scheduleMutation = useScheduleBlogPost();
  const archiveMutation = useArchiveBlogPost();
  const duplicateMutation = useDuplicateBlogPost();
  const uploadMutation = useUploadBlogImage();
  const createSeriesMutation = useCreateBlogSeries();

  const [segment, setSegment] = useState<Segment>('draft');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [serverPost, setServerPost] = useState<BlogPost | null>(null);

  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [heroImageId, setHeroImageId] = useState<number | null>(null);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [body, setBody] = useState<{ html: string; json: Record<string, unknown> }>({
    html: '',
    json: {},
  });
  const [words, setWords] = useState(0);
  const [chars, setChars] = useState(0);
  const [selectionWords, setSelectionWords] = useState(0);
  const [preview, setPreview] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const heroInputRef = useRef<HTMLInputElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const loadedIdRef = useRef<number | null>(null);
  const lastSavedRef = useRef<string>('');
  const payloadRef = useRef<Record<string, unknown>>({});
  const serializedRef = useRef<string>('');
  const selectedIdRef = useRef<number | null>(null);

  const currentStatus: BlogStatus = serverPost?.status ?? 'draft';

  const insertInlineImageRef = useRef<(file: File) => Promise<void>>(async () => {});

  const editor = useEditor({
    extensions: editorExtensions('Tell the story…'),
    content: '',
    editable: false,
    onUpdate: ({ editor: ed }) => {
      setBody({ html: ed.getHTML(), json: ed.getJSON() as Record<string, unknown> });
      const text = ed.getText();
      setWords(countWords(text));
      setChars(text.length);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to, empty } = ed.state.selection;
      setSelectionWords(empty ? 0 : countWords(ed.state.doc.textBetween(from, to, ' ')));
    },
    editorProps: {
      transformPastedHTML: (html) => cleanPastedHtml(html),
      handleDOMEvents: {
        mousedown: selectLinkCardFromEvent,
        click: selectLinkCardFromEvent,
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved || !event.dataTransfer?.files?.length) return false;
        const file = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith('image/'));
        if (!file) return false;
        event.preventDefault();
        void insertInlineImageRef.current(file);
        return true;
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.items ?? [])
          .map((item) => (item.type.startsWith('image/') ? item.getAsFile() : null))
          .find(Boolean);
        if (!file) return false;
        event.preventDefault();
        void insertInlineImageRef.current(file);
        return true;
      },
    },
  });

  insertInlineImageRef.current = async (file: File) => {
    if (!editor) return;
    try {
      const img = await uploadMutation.mutateAsync({ file });
      editor.chain().focus().setImage({ src: img.url, alt: img.alt || '' }).run();
    } catch {
      enqueueSnackbar('Image upload failed.', { variant: 'error' });
    }
  };

  // ── Load a post into the workspace ─────────────────────────────────────────
  const loadPost = useCallback(
    (post: BlogPost) => {
      if (!editor) return;
      const content = isTipTapDoc(post.body_json) ? post.body_json : post.body_html || '<p></p>';
      editor.commands.setContent(content, false);
      editor.setEditable(true);
      const html = editor.getHTML();
      const json = editor.getJSON() as Record<string, unknown>;

      const nextForm: Form = {
        title: post.title,
        excerpt: post.excerpt,
        heroAlt: post.hero_alt,
        seriesId: post.series == null ? '' : String(post.series),
        scheduleDate: post.scheduled_for ? format(new Date(post.scheduled_for), 'yyyy-MM-dd') : '',
        scheduleTime: post.scheduled_for ? format(new Date(post.scheduled_for), 'HH:mm') : '09:00',
      };

      setForm(nextForm);
      setHeroImageId(post.hero_image);
      setHeroUrl(post.hero?.url ?? null);
      setBody({ html, json });
      const text = editor.getText();
      setWords(countWords(text));
      setChars(text.length);
      setSelectionWords(0);
      setPreview(false);
      setServerPost(post);
      setSaveState('idle');
      setLastSavedAt(post.updated_at ? new Date(post.updated_at) : null);

      lastSavedRef.current = JSON.stringify(
        buildPayload({
          title: post.title,
          excerpt: post.excerpt,
          heroAlt: post.hero_alt,
          seriesId: nextForm.seriesId,
          heroImageId: post.hero_image,
          bodyHtml: html,
          bodyJson: json,
          status: post.status,
        }),
      );
      loadedIdRef.current = post.id;
    },
    [editor],
  );

  // Load selected post from the library list once it's available.
  useEffect(() => {
    if (!editor || selectedId == null) return;
    if (loadedIdRef.current === selectedId) return;
    const post = posts?.find((p) => p.id === selectedId);
    if (post) loadPost(post);
  }, [editor, selectedId, posts, loadPost]);

  // Auto-select the most recently edited post on first load.
  useEffect(() => {
    if (selectedId == null && posts && posts.length > 0) {
      const first = posts[0];
      if (first.status !== 'archived') setSegment(first.status as Segment);
      setSelectedId(first.id);
    }
  }, [posts, selectedId]);

  // ── Autosave plumbing ───────────────────────────────────────────────────────
  const payload = useMemo(
    () =>
      buildPayload({
        title: form.title,
        excerpt: form.excerpt,
        heroAlt: form.heroAlt,
        seriesId: form.seriesId,
        heroImageId,
        bodyHtml: body.html,
        bodyJson: body.json,
        status: currentStatus,
      }),
    [form.title, form.excerpt, form.heroAlt, form.seriesId, heroImageId, body, currentStatus],
  );
  const serialized = useMemo(() => JSON.stringify(payload), [payload]);
  const debounced = useDebouncedValue(serialized, 1200);

  // Keep refs in sync during render (not in useEffect) so explicit saves right after
  // a hero upload never read a stale payload.
  payloadRef.current = payload;
  serializedRef.current = serialized;
  selectedIdRef.current = selectedId;

  const doSave = useCallback(async (opts?: { force?: boolean }): Promise<boolean> => {
    const id = selectedIdRef.current;
    if (id == null) return true;
    const data = payloadRef.current;
    const snapshot = JSON.stringify(data);
    if (!opts?.force && snapshot === lastSavedRef.current) return true;
    setSaveState('saving');
    try {
      const updated = await updateMutation.mutateAsync({ id, data });
      lastSavedRef.current = snapshot;
      setServerPost(updated);
      setLastSavedAt(new Date());
      setSaveState('saved');
      return true;
    } catch {
      setSaveState('error');
      enqueueSnackbar('Could not save changes — will retry on next edit.', { variant: 'error' });
      return false;
    }
  }, [updateMutation, enqueueSnackbar]);

  useEffect(() => {
    if (selectedId == null) return;
    if (debounced === lastSavedRef.current) return;
    void doSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // ── Selection + actions ─────────────────────────────────────────────────────
  const selectPost = useCallback(
    async (id: number) => {
      if (id === selectedId) return;
      await doSave();
      setSelectedId(id);
    },
    [selectedId, doSave],
  );

  const handleNewPost = useCallback(async () => {
    await doSave();
    try {
      const created = await createMutation.mutateAsync({ title: 'Untitled post', status: 'draft' });
      setSegment('draft');
      setSelectedId(created.id);
      loadPost(created);
      enqueueSnackbar('New draft created.', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not create a new post.', { variant: 'error' });
    }
  }, [doSave, createMutation, loadPost, enqueueSnackbar]);

  const handlePublishNow = useCallback(async () => {
    if (selectedId == null) return;
    const ok = await doSave({ force: true });
    if (!ok) return;

    // Already live — only PATCH saves content (hero, body, excerpt). publish-now does not.
    if (serverPost?.status === 'published') {
      enqueueSnackbar('Changes saved — live on ecothrift.us.', { variant: 'success' });
      return;
    }

    try {
      const updated = await publishMutation.mutateAsync(selectedId);
      setServerPost(updated);
      setSegment('published');
      enqueueSnackbar('Published. It is live on ecothrift.us now.', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not publish this post.', { variant: 'error' });
    }
  }, [selectedId, serverPost?.status, doSave, publishMutation, enqueueSnackbar]);

  const handleSchedule = useCallback(async () => {
    if (selectedId == null) return;
    if (!form.scheduleDate) {
      enqueueSnackbar('Pick a date to schedule.', { variant: 'warning' });
      return;
    }
    const ok = await doSave({ force: true });
    if (!ok) return;
    const local = new Date(`${form.scheduleDate}T${form.scheduleTime || '09:00'}`);
    if (Number.isNaN(local.getTime())) {
      enqueueSnackbar('That schedule date looks invalid.', { variant: 'warning' });
      return;
    }
    try {
      const updated = await scheduleMutation.mutateAsync({
        id: selectedId,
        scheduledFor: local.toISOString(),
      });
      setServerPost(updated);
      setSegment('scheduled');
      enqueueSnackbar(`Scheduled for ${format(local, 'MMM d, h:mmaaa')}.`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not schedule this post.', { variant: 'error' });
    }
  }, [selectedId, form.scheduleDate, form.scheduleTime, doSave, scheduleMutation, enqueueSnackbar]);

  const handleSaveDraft = useCallback(async () => {
    const ok = await doSave({ force: true });
    if (ok) enqueueSnackbar('Draft saved.', { variant: 'success' });
  }, [doSave, enqueueSnackbar]);

  const handleArchive = useCallback(async () => {
    if (selectedId == null) return;
    if (!window.confirm('Archive this post? It will be removed from the public blog.')) return;
    try {
      const updated = await archiveMutation.mutateAsync(selectedId);
      setServerPost(updated);
      enqueueSnackbar('Post archived.', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not archive this post.', { variant: 'error' });
    }
  }, [selectedId, archiveMutation, enqueueSnackbar]);

  const handleDuplicate = useCallback(async () => {
    if (selectedId == null) return;
    await doSave();
    try {
      const copy = await duplicateMutation.mutateAsync(selectedId);
      setSegment('draft');
      setSelectedId(copy.id);
      loadPost(copy);
      enqueueSnackbar('Duplicated as a new draft.', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not duplicate this post.', { variant: 'error' });
    }
  }, [selectedId, doSave, duplicateMutation, loadPost, enqueueSnackbar]);

  const handleRevisionInfo = useCallback(() => {
    const n = serverPost?.revision_count ?? 0;
    enqueueSnackbar(`Every save is versioned — ${n} revision${n === 1 ? '' : 's'} kept.`, {
      variant: 'info',
    });
  }, [serverPost, enqueueSnackbar]);

  // ── Image uploads ────────────────────────────────────────────────────────────
  const onHeroFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const postId = selectedIdRef.current;
    try {
      const img = await uploadMutation.mutateAsync({ file, alt: form.heroAlt });
      setHeroImageId(img.id);
      setHeroUrl(img.url);

      // Persist immediately — autosave is debounced 1.2s, so "Update published post"
      // right after upload used to run before the hero was saved.
      if (postId != null) {
        const data = buildPayload({
          title: form.title,
          excerpt: form.excerpt,
          heroAlt: form.heroAlt,
          seriesId: form.seriesId,
          heroImageId: img.id,
          bodyHtml: body.html,
          bodyJson: body.json,
          status: serverPost?.status ?? 'draft',
        });
        setSaveState('saving');
        try {
          const updated = await updateMutation.mutateAsync({ id: postId, data });
          lastSavedRef.current = JSON.stringify(data);
          setServerPost(updated);
          setLastSavedAt(new Date());
          setSaveState('saved');
          enqueueSnackbar('Hero image saved.', { variant: 'success' });
        } catch {
          setSaveState('error');
          enqueueSnackbar(
            'Hero uploaded but could not attach to this post — use Save draft or Update published post.',
            { variant: 'warning' },
          );
        }
      } else {
        enqueueSnackbar('Hero image uploaded.', { variant: 'success' });
      }
    } catch {
      enqueueSnackbar('Image upload failed.', { variant: 'error' });
    }
  };

  const onInlineFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    try {
      const img = await uploadMutation.mutateAsync({ file });
      editor.chain().focus().setImage({ src: img.url, alt: img.alt || '' }).run();
    } catch {
      enqueueSnackbar('Image upload failed.', { variant: 'error' });
    }
  };

  const onSeriesChange = async (value: string) => {
    if (value === '__new__') {
      const name = window.prompt('New series name');
      if (!name || !name.trim()) return;
      try {
        const created = await createSeriesMutation.mutateAsync({ name: name.trim() });
        setForm((f) => ({ ...f, seriesId: String(created.id) }));
        enqueueSnackbar(`Series "${created.name}" created.`, { variant: 'success' });
      } catch {
        enqueueSnackbar('Could not create that series.', { variant: 'error' });
      }
      return;
    }
    setForm((f) => ({ ...f, seriesId: value }));
  };

  // ── Derived view data ──────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { draft: 0, scheduled: 0, published: 0 };
    (posts ?? []).forEach((p) => {
      if (p.status === 'draft') c.draft += 1;
      else if (p.status === 'scheduled') c.scheduled += 1;
      else if (p.status === 'published') c.published += 1;
    });
    return c;
  }, [posts]);

  const visiblePosts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (posts ?? [])
      .filter((p) => p.status === segment)
      .filter((p) => !q || p.title.toLowerCase().includes(q));
  }, [posts, segment, search]);

  const slug = serverPost?.slug || clientSlug(form.title);
  const seriesName =
    series?.find((s) => String(s.id) === form.seriesId)?.name || serverPost?.series_name || null;
  const readMinutes = Math.max(words > 0 ? 1 : 0, Math.round(words / 200));
  const busy =
    publishMutation.isPending ||
    scheduleMutation.isPending ||
    archiveMutation.isPending ||
    createMutation.isPending;

  const savedLabel = (() => {
    if (saveState === 'saving') return 'Saving…';
    if (saveState === 'error') return 'Save failed — will retry';
    const d = lastSavedAt;
    if (!d) return 'Saved';
    const secs = (Date.now() - d.getTime()) / 1000;
    if (secs < 10) return 'Saved · just now';
    return `Saved · ${formatDistanceToNowStrict(d, { addSuffix: true })}`;
  })();

  const hasSelection = selectedId != null && serverPost != null;

  return (
    <div className="blog-studio">
      <input
        ref={heroInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onHeroFile}
      />
      <input
        ref={inlineInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onInlineFile}
      />

      <div className="app">
        <header>
          <div className="brand">
            <div className="mark">E</div>
            <div>
              <h1>Blog Studio</h1>
              <div className="sub">EcoThrift · Notes from Bill</div>
            </div>
          </div>
          <div className="summary">
            <div className="stat">
              <b>{counts.draft}</b>
              <span>Drafts</span>
            </div>
            <div className="stat clay">
              <b>{counts.scheduled}</b>
              <span>Scheduled</span>
            </div>
            <div className="stat">
              <b>{counts.published}</b>
              <span>Published</span>
            </div>
            <div className="divv" />
            <button className="btn go head-new" onClick={handleNewPost} disabled={busy}>
              New post
            </button>
          </div>
        </header>

        <div className="studio">
          {/* LEFT — library */}
          <div className="col bl">
            <div className="ch">
              <h2>Library</h2>
              <span className="n">{posts?.length ?? 0} posts</span>
            </div>
            <div className="seek">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                placeholder="Search posts"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="seg">
              {SEGMENTS.map((s) => (
                <button
                  key={s.id}
                  className={`sg${segment === s.id ? ' on' : ''}`}
                  onClick={() => setSegment(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="list">
              {postsLoading && <div className="empty">Loading…</div>}
              {!postsLoading && visiblePosts.length === 0 && (
                <div className="empty">No {segment} posts yet.</div>
              )}
              {visiblePosts.map((p) => (
                <div
                  key={p.id}
                  className={`item${p.id === selectedId ? ' on' : ''}`}
                  onClick={() => void selectPost(p.id)}
                >
                  <h3>{p.title}</h3>
                  <div className="row">
                    <span className="st">
                      <span className={`sdot ${STATUS_DOT[p.status]}`} />
                      {p.status_display}
                    </span>{' '}
                    · {listMeta(p)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CENTER — writing desk */}
          <div className="col desk">
            {hasSelection ? (
              <div className="desk-wrap">
                <div className="desk-top">
                  <div className="kick">
                    {(seriesName || 'No series') + ' · ' + currentStatus}
                  </div>
                  <input
                    className="title"
                    placeholder="Untitled post"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                  <div className="slug">
                    ecothrift.us/blog/ <code>{slug}</code>
                  </div>
                  <div className="desk-modes" role="tablist" aria-label="Editor mode">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!preview}
                      className={`dm${preview ? '' : ' on'}`}
                      onClick={() => setPreview(false)}
                    >
                      Write
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={preview}
                      className={`dm${preview ? ' on' : ''}`}
                      onClick={() => setPreview(true)}
                    >
                      Preview
                    </button>
                  </div>
                  {!preview && (
                    <EditorToolbar
                      editor={editor}
                      onImageClick={() => inlineInputRef.current?.click()}
                    />
                  )}
                </div>
                {preview ? (
                  <div
                    className="write preview-body"
                    dangerouslySetInnerHTML={{ __html: body.html }}
                  />
                ) : (
                  <EditorContent editor={editor} className="write" />
                )}
                <div className="foot">
                  <div className="ok">
                    <span
                      className={`d${saveState === 'saving' ? ' saving' : ''}${
                        saveState === 'error' ? ' err' : ''
                      }`}
                    />{' '}
                    {savedLabel}
                  </div>
                  <div>
                    {selectionWords > 0
                      ? `${selectionWords} of ${words} words selected`
                      : `${words} words · ${chars.toLocaleString()} chars · ~${readMinutes} min read`}{' '}
                    · rev {serverPost?.revision_count ?? 0}
                  </div>
                </div>
              </div>
            ) : (
              <div className="desk-empty">
                <div className="serif">Notes from Bill</div>
                {!postsLoading && (posts?.length ?? 0) === 0 ? (
                  <>
                    <div>Your blog is a blank page.</div>
                    <button className="btn go head-new" onClick={handleNewPost}>
                      Write your first post
                    </button>
                  </>
                ) : (
                  <div>Opening the studio…</div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — publish cabinet */}
          <div className="col cab">
            <div className="ch">
              <h2>Publish</h2>
              <span className="n">{seriesName || '—'}</span>
            </div>

            <div
              className={`hero ${heroUrl ? 'has-img' : 'empty-hero'}`}
              onClick={() => hasSelection && heroInputRef.current?.click()}
            >
              {heroUrl && <img className="hero-img" src={heroUrl} alt={form.heroAlt || 'Hero image'} />}
              <span className="b">{heroUrl ? 'Replace hero' : 'Add hero image'}</span>
            </div>

            <div className="f">
              <label>Hero alt text</label>
              <input
                value={form.heroAlt}
                placeholder="Describe the hero image"
                disabled={!hasSelection}
                onChange={(e) => setForm((f) => ({ ...f, heroAlt: e.target.value }))}
              />
            </div>

            <div className="f">
              <label>Excerpt</label>
              <textarea
                rows={3}
                value={form.excerpt}
                placeholder="A one-line summary for cards and search."
                disabled={!hasSelection}
                onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
              />
            </div>

            <div className="f">
              <label>Series</label>
              <select
                value={form.seriesId}
                disabled={!hasSelection}
                onChange={(e) => void onSeriesChange(e.target.value)}
              >
                <option value="">No series</option>
                {(series ?? []).map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
                <option value="__new__">+ Create new series…</option>
              </select>
            </div>

            <div className="preview">
              <div className="lbl">Social preview</div>
              <div className="gt">{(form.title || 'Untitled post').slice(0, 60)}</div>
              <div className="gu">ecothrift.us › blog › {slug}</div>
              <div className="gd">{form.excerpt || 'Add an excerpt to shape how this looks when shared.'}</div>
            </div>

            <div className="two">
              <div className="f">
                <label>Schedule</label>
                <input
                  type="date"
                  value={form.scheduleDate}
                  disabled={!hasSelection}
                  onChange={(e) => setForm((f) => ({ ...f, scheduleDate: e.target.value }))}
                />
              </div>
              <div className="f">
                <label>Time</label>
                <input
                  type="time"
                  value={form.scheduleTime}
                  disabled={!hasSelection}
                  onChange={(e) => setForm((f) => ({ ...f, scheduleTime: e.target.value }))}
                />
              </div>
            </div>

            <div className="acts">
              <button className="btn go" onClick={handlePublishNow} disabled={!hasSelection || busy}>
                {currentStatus === 'published' ? 'Update published post' : 'Publish now'}
              </button>
              <button className="btn out" onClick={handleSchedule} disabled={!hasSelection || busy}>
                {form.scheduleDate
                  ? `Schedule for ${format(new Date(`${form.scheduleDate}T00:00`), 'MMM d')}`
                  : 'Schedule'}
              </button>
              <button className="btn out" onClick={handleSaveDraft} disabled={!hasSelection}>
                Save draft
              </button>
              <button className="btn lnk" onClick={handleRevisionInfo} disabled={!hasSelection}>
                Revision history · {serverPost?.revision_count ?? 0} saved
              </button>
              <button className="btn lnk m" onClick={handleDuplicate} disabled={!hasSelection}>
                Duplicate this post
              </button>
              <button className="btn lnk m" onClick={handleArchive} disabled={!hasSelection}>
                Archive this post
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
