import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { Box, MenuItem, Popover, Select, TextField, Tooltip, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { createBlogEditorExtensions } from './blogTiptapExtensions';
import {
  CALLOUT_TONES,
  FONT_SIZE_STEPS,
  HIGHLIGHTS,
  TEXT_COLORS,
  type FontSizeStep,
} from './blogEditorConstants';

export { createBlogEditorExtensions as editorExtensions };

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const MOD = IS_MAC ? '\u2318' : 'Ctrl';
const SHIFT = IS_MAC ? '\u21e7' : 'Shift';
const ALT = IS_MAC ? '\u2325' : 'Alt';

const SHORTCUTS: { label: string; keys: string }[] = [
  { label: 'Bold', keys: `${MOD} B` },
  { label: 'Italic', keys: `${MOD} I` },
  { label: 'Underline', keys: `${MOD} U` },
  { label: 'Strikethrough', keys: `${MOD} ${SHIFT} S` },
  { label: 'Inline code', keys: `${MOD} E` },
  { label: 'Heading 2', keys: `${MOD} ${ALT} 2` },
  { label: 'Heading 3', keys: `${MOD} ${ALT} 3` },
  { label: 'Bullet list', keys: `${MOD} ${SHIFT} 8` },
  { label: 'Numbered list', keys: `${MOD} ${SHIFT} 7` },
  { label: 'Quote', keys: `${MOD} ${SHIFT} B` },
  { label: 'Code block', keys: `${MOD} ${ALT} C` },
  { label: 'Line break', keys: `${SHIFT} Enter` },
  { label: 'Undo', keys: `${MOD} Z` },
  { label: 'Redo', keys: `${MOD} ${SHIFT} Z` },
];

function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m ? m[1] : null;
}

function useEditorTick(editor: Editor | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick((t) => (t + 1) % 1_000_000);
    editor.on('transaction', bump);
    editor.on('selectionUpdate', bump);
    return () => {
      editor.off('transaction', bump);
      editor.off('selectionUpdate', bump);
    };
  }, [editor]);
}

function currentFontSize(editor: Editor): FontSizeStep {
  const size = editor.getAttributes('fontSize').size as string | null | undefined;
  if (size && FONT_SIZE_STEPS.includes(size as FontSizeStep)) return size as FontSizeStep;
  return 'normal';
}

function stepFontSize(current: FontSizeStep, dir: 1 | -1): FontSizeStep {
  const idx = FONT_SIZE_STEPS.indexOf(current);
  const next = Math.max(0, Math.min(FONT_SIZE_STEPS.length - 1, idx + dir));
  return FONT_SIZE_STEPS[next];
}

interface ToolbarProps {
  editor: Editor | null;
  onImageClick: () => void;
}

export function EditorToolbar({ editor, onImageClick }: ToolbarProps) {
  useEditorTick(editor);
  const disabled = !editor || !editor.isEditable;

  const [linkAnchor, setLinkAnchor] = useState<HTMLElement | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [highlightAnchor, setHighlightAnchor] = useState<HTMLElement | null>(null);
  const [hintsAnchor, setHintsAnchor] = useState<HTMLElement | null>(null);
  const [calloutAnchor, setCalloutAnchor] = useState<HTMLElement | null>(null);
  const [tableAnchor, setTableAnchor] = useState<HTMLElement | null>(null);
  const [cardAnchor, setCardAnchor] = useState<HTMLElement | null>(null);
  const [cardForm, setCardForm] = useState({ href: '', title: '', description: '' });
  const cardUrlRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const cls = (active: boolean, extra = '') =>
    `t${extra ? ` ${extra}` : ''}${active ? ' on' : ''}`;

  const openLinkEditor = (e: React.MouseEvent<HTMLElement>) => {
    if (!editor) return;
    setLinkUrl((editor.getAttributes('link').href as string) || '');
    setLinkAnchor(e.currentTarget);
    setTimeout(() => linkInputRef.current?.focus(), 50);
  };

  const applyLink = () => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    setLinkAnchor(null);
  };

  const insertCard = () => {
    if (!editor) return;
    const href = cardForm.href.trim();
    if (!href) return;
    const ytId = youtubeId(href);
    const thumbnail = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '';
    let host = '';
    try {
      host = new URL(href).hostname.replace(/^www\./, '');
    } catch {
      host = '';
    }
    const title = cardForm.title.trim() || (ytId ? 'Watch on YouTube' : host || href);
    editor
      .chain()
      .focus()
      .insertLinkCard({ href, title, description: cardForm.description.trim(), thumbnail })
      .run();
    setCardAnchor(null);
  };

  const removeSelectedLinkCard = () => {
    if (!editor) return;
    const { state, view } = editor;
    const { selection } = state;
    if (selection instanceof NodeSelection && selection.node.type.name === 'linkCard') {
      view.dispatch(state.tr.delete(selection.from, selection.to).scrollIntoView());
      view.focus();
      return;
    }
    editor.chain().focus().deleteNode('linkCard').run();
  };

  const styleValue = () => {
    if (!editor) return 'paragraph';
    if (editor.isActive('heading', { level: 2 })) return 'h2';
    if (editor.isActive('heading', { level: 3 })) return 'h3';
    return 'paragraph';
  };

  const setStyle = (value: string) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (value === 'h2') chain.toggleHeading({ level: 2 }).run();
    else if (value === 'h3') chain.toggleHeading({ level: 3 }).run();
    else chain.setParagraph().run();
  };

  return (
    <>
      <div className="tools tools--wide" role="toolbar" aria-label="Formatting">
        <Select
          size="small"
          value={styleValue()}
          disabled={disabled}
          onChange={(e) => setStyle(e.target.value)}
          className="tool-select"
          variant="standard"
          disableUnderline
        >
          <MenuItem value="paragraph">Paragraph</MenuItem>
          <MenuItem value="h2">Heading 2</MenuItem>
          <MenuItem value="h3">Heading 3</MenuItem>
        </Select>

        <span className="v" />

        <Tooltip title="Grow font">
          <span>
            <button
              type="button"
              className={cls(false)}
              disabled={disabled}
              onClick={() =>
                editor?.chain().focus().setFontSize(stepFontSize(currentFontSize(editor), 1)).run()
              }
            >
              A+
            </button>
          </span>
        </Tooltip>
        <Tooltip title="Shrink font">
          <span>
            <button
              type="button"
              className={cls(false)}
              disabled={disabled}
              onClick={() =>
                editor?.chain().focus().setFontSize(stepFontSize(currentFontSize(editor), -1)).run()
              }
            >
              A−
            </button>
          </span>
        </Tooltip>
        <Tooltip title="Reset font size">
          <span>
            <button
              type="button"
              className={cls(false)}
              disabled={disabled}
              onClick={() => editor?.chain().focus().setFontSize(null).run()}
            >
              A↺
            </button>
          </span>
        </Tooltip>

        <Tooltip title="Text color">
          <span>
            <button
              type="button"
              className={cls(editor?.isActive('textColorClass') ?? false)}
              disabled={disabled}
              onClick={(e) => setColorAnchor(e.currentTarget)}
            >
              A
              <span className="tool-swatch tool-swatch--clay" />
            </button>
          </span>
        </Tooltip>
        <Tooltip title="Highlight">
          <span>
            <button
              type="button"
              className={cls(editor?.isActive('highlightClass') ?? false)}
              disabled={disabled}
              onClick={(e) => setHighlightAnchor(e.currentTarget)}
            >
              ◐
            </button>
          </span>
        </Tooltip>

        <span className="v" />

        <button
          type="button"
          className={cls(editor?.isActive('bold') ?? false, 'b')}
          title={`Bold (${MOD} B)`}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          B
        </button>
        <button
          type="button"
          className={cls(editor?.isActive('italic') ?? false, 'i')}
          title={`Italic (${MOD} I)`}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          I
        </button>
        <button
          type="button"
          className={cls(editor?.isActive('underline') ?? false)}
          title={`Underline (${MOD} U)`}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <span style={{ textDecoration: 'underline' }}>U</span>
        </button>
        <button
          type="button"
          className={cls(editor?.isActive('strike') ?? false)}
          title={`Strikethrough (${MOD} ${SHIFT} S)`}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <span style={{ textDecoration: 'line-through' }}>S</span>
        </button>

        <span className="v" />

        <button
          type="button"
          className={cls(editor?.isActive('bulletList') ?? false)}
          title={`Bullet list (${MOD} ${SHIFT} 8)`}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          &bull;
        </button>
        <button
          type="button"
          className={cls(editor?.isActive('orderedList') ?? false)}
          title={`Numbered list (${MOD} ${SHIFT} 7)`}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          1.
        </button>
        <button
          type="button"
          className={cls(false)}
          title="Outdent"
          disabled={disabled || !editor?.can().liftListItem('listItem')}
          onClick={() => editor?.chain().focus().liftListItem('listItem').run()}
        >
          &#8676;
        </button>
        <button
          type="button"
          className={cls(false)}
          title="Indent"
          disabled={disabled || !editor?.can().sinkListItem('listItem')}
          onClick={() => editor?.chain().focus().sinkListItem('listItem').run()}
        >
          &#8677;
        </button>

        <span className="v" />

        <button
          type="button"
          className={cls(editor?.isActive('blockquote') ?? false)}
          title={`Quote (${MOD} ${SHIFT} B)`}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <span className="sf">&ldquo;</span>
        </button>
        <button
          type="button"
          className={cls(editor?.isActive('pullQuote') ?? false)}
          title="Pull quote"
          disabled={disabled}
          onClick={() => editor?.chain().focus().togglePullQuote().run()}
        >
          <span className="sf">&ldquo;&rdquo;</span>
        </button>
        <button
          type="button"
          className={cls(editor?.getAttributes('paragraph').dropCap ?? false)}
          title="Drop cap"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleDropCap().run()}
        >
          <span className="sf">W</span>
        </button>
        <button
          type="button"
          className={cls(editor?.isActive('code') ?? false)}
          title={`Inline code (${MOD} E)`}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        >
          {'</>'}
        </button>
        <button
          type="button"
          className={cls(editor?.isActive('codeBlock') ?? false)}
          title={`Code block (${MOD} ${ALT} C)`}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        >
          {'{ }'}
        </button>
        <button
          type="button"
          className={cls(false)}
          title="Divider"
          disabled={disabled}
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        >
          &mdash;
        </button>

        <span className="v" />

        <button
          type="button"
          className={cls(editor?.isActive('columnsSection') ?? false)}
          title="Two columns"
          disabled={disabled}
          onClick={() => editor?.chain().focus().insertColumns().run()}
        >
          &#9638;
        </button>
        <button
          type="button"
          className={cls(false)}
          title="Exit columns"
          disabled={disabled || !editor?.isActive('columnsSection')}
          onClick={() => editor?.chain().focus().unsetColumns().run()}
        >
          &#9633;
        </button>

        <span className="v" />

        <button
          type="button"
          className={cls(editor?.isActive('callout') ?? false)}
          title="Callout box"
          disabled={disabled}
          onClick={(e) => setCalloutAnchor(e.currentTarget)}
        >
          &#9432;
        </button>
        <button
          type="button"
          className={cls(editor?.isActive('table') ?? false)}
          title="Table"
          disabled={disabled}
          onClick={(e) => setTableAnchor(e.currentTarget)}
        >
          &#9783;
        </button>
        <button
          type="button"
          className={cls(false)}
          title="Embed / link card"
          disabled={disabled}
          onClick={(e) => {
            setCardForm({ href: '', title: '', description: '' });
            setCardAnchor(e.currentTarget);
            setTimeout(() => cardUrlRef.current?.focus(), 50);
          }}
        >
          &#9655;
        </button>

        <span className="v" />

        <button
          type="button"
          className={cls(editor?.isActive('link') ?? false)}
          title="Link"
          disabled={disabled}
          onClick={openLinkEditor}
        >
          &#128279;
        </button>
        <button type="button" className={cls(false)} title="Insert image" disabled={disabled} onClick={onImageClick}>
          &#9634;
        </button>
        {editor?.isActive('image') && (
          <>
            <span className="v" />
            {(['bt-img-small', 'bt-img-medium', 'bt-img-full'] as const).map((clsName) => (
              <button
                key={clsName}
                type="button"
                className={cls(editor.getAttributes('image').class === clsName)}
                title={clsName.replace('bt-img-', '')}
                onClick={() => editor.chain().focus().updateAttributes('image', { class: clsName }).run()}
              >
                {clsName === 'bt-img-small' ? 'S' : clsName === 'bt-img-medium' ? 'M' : 'L'}
              </button>
            ))}
          </>
        )}
        {editor?.isActive('linkCard') && (
          <>
            <span className="v" />
            <button
              type="button"
              className={cls(false)}
              title="Remove embed card"
              aria-label="Remove embed card"
              onMouseDown={(e) => e.preventDefault()}
              onClick={removeSelectedLinkCard}
            >
              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
            </button>
          </>
        )}
        <button
          type="button"
          className={cls(false)}
          title="Clear formatting"
          disabled={disabled}
          onClick={() =>
            editor?.chain().focus().clearNodes().unsetAllMarks().setParagraph().run()
          }
        >
          &#10005;
        </button>

        <span className="v" />

        <button
          type="button"
          className={cls(false)}
          title={`Undo (${MOD} Z)`}
          disabled={disabled || !editor?.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          &#8630;
        </button>
        <button
          type="button"
          className={cls(false)}
          title={`Redo (${MOD} ${SHIFT} Z)`}
          disabled={disabled || !editor?.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          &#8631;
        </button>

        <span className="v" />

        <button
          type="button"
          className={cls(Boolean(hintsAnchor))}
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
          onClick={(e) => setHintsAnchor(e.currentTarget)}
        >
          ?
        </button>
      </div>

      <Popover
        open={Boolean(linkAnchor)}
        anchorEl={linkAnchor}
        onClose={() => setLinkAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, width: 280, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="caption" fontWeight={600}>
            Link URL
          </Typography>
          <TextField
            inputRef={linkInputRef}
            size="small"
            value={linkUrl}
            placeholder="https://"
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyLink();
            }}
          />
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <button type="button" className="btn out" onClick={() => editor?.chain().focus().unsetLink().run()}>
              Remove
            </button>
            <button type="button" className="btn go" onClick={applyLink}>
              Apply
            </button>
          </Box>
        </Box>
      </Popover>

      <Popover
        open={Boolean(colorAnchor)}
        anchorEl={colorAnchor}
        onClose={() => setColorAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.75, maxWidth: 196 }}>
          {TEXT_COLORS.map((c) => (
            <Box
              key={c.id}
              component="button"
              type="button"
              title={c.label}
              onClick={() => {
                editor?.chain().focus().setTextColorClass(c.className).run();
                setColorAnchor(null);
              }}
              sx={{
                width: 30,
                height: 30,
                p: 0,
                borderRadius: '8px',
                cursor: 'pointer',
                border: '1px solid rgba(24,23,18,0.15)',
                bgcolor: c.swatch,
              }}
            />
          ))}
          <Box
            component="button"
            type="button"
            title="Remove color"
            onClick={() => {
              editor?.chain().focus().setTextColorClass(null).run();
              setColorAnchor(null);
            }}
            sx={{
              width: 30,
              height: 30,
              p: 0,
              borderRadius: '8px',
              cursor: 'pointer',
              border: '1px solid rgba(24,23,18,0.15)',
              bgcolor: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: 'text.secondary',
            }}
          >
            &#10005;
          </Box>
        </Box>
      </Popover>

      <Popover
        open={Boolean(highlightAnchor)}
        anchorEl={highlightAnchor}
        onClose={() => setHighlightAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.75, maxWidth: 196 }}>
          {HIGHLIGHTS.map((h) => (
            <Box
              key={h.id}
              component="button"
              type="button"
              title={h.label}
              onClick={() => {
                editor?.chain().focus().setHighlightClass(h.className).run();
                setHighlightAnchor(null);
              }}
              sx={{
                minWidth: 44,
                height: 30,
                px: 1,
                borderRadius: '8px',
                cursor: 'pointer',
                border: '1px solid rgba(24,23,18,0.15)',
                bgcolor: h.swatch,
                fontFamily: '"Hanken Grotesk", sans-serif',
                fontSize: 12,
                color: '#3a382f',
              }}
            >
              Ab
            </Box>
          ))}
          <Box
            component="button"
            type="button"
            title="Remove highlight"
            onClick={() => {
              editor?.chain().focus().setHighlightClass(null).run();
              setHighlightAnchor(null);
            }}
            sx={{
              width: 30,
              height: 30,
              p: 0,
              borderRadius: '8px',
              cursor: 'pointer',
              border: '1px solid rgba(24,23,18,0.15)',
              bgcolor: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: 'text.secondary',
            }}
          >
            &#10005;
          </Box>
        </Box>
      </Popover>

      <Popover
        open={Boolean(calloutAnchor)}
        anchorEl={calloutAnchor}
        onClose={() => setCalloutAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ py: 0.5, minWidth: 150 }}>
          {CALLOUT_TONES.map((t) => (
            <MenuItem
              key={t.id}
              selected={editor?.isActive('callout', { tone: t.id }) ?? false}
              onClick={() => {
                editor?.chain().focus().setCallout(t.id).run();
                setCalloutAnchor(null);
              }}
            >
              {t.label}
            </MenuItem>
          ))}
          <MenuItem
            disabled={!editor?.isActive('callout')}
            onClick={() => {
              editor?.chain().focus().toggleCallout('info').run();
              setCalloutAnchor(null);
            }}
          >
            Remove callout
          </MenuItem>
        </Box>
      </Popover>

      <Popover
        open={Boolean(cardAnchor)}
        anchorEl={cardAnchor}
        onClose={() => setCardAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, width: 304, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Typography variant="caption" fontWeight={700}>
            Embed link card
          </Typography>
          <TextField
            inputRef={cardUrlRef}
            size="small"
            label="URL"
            value={cardForm.href}
            placeholder="https://youtube.com/watch?v=..."
            onChange={(e) => setCardForm((f) => ({ ...f, href: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') insertCard();
            }}
          />
          <TextField
            size="small"
            label="Title (optional)"
            value={cardForm.title}
            onChange={(e) => setCardForm((f) => ({ ...f, title: e.target.value }))}
          />
          <TextField
            size="small"
            label="Description (optional)"
            value={cardForm.description}
            onChange={(e) => setCardForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Typography variant="caption" color="text.secondary">
            YouTube links get a thumbnail automatically. No inline video is embedded.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <button type="button" className="btn out" onClick={() => setCardAnchor(null)}>
              Cancel
            </button>
            <button type="button" className="btn go" onClick={insertCard}>
              Insert
            </button>
          </Box>
        </Box>
      </Popover>

      <Popover
        open={Boolean(tableAnchor)}
        anchorEl={tableAnchor}
        onClose={() => setTableAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ py: 0.5, minWidth: 172 }}>
          {editor?.isActive('table') ? (
            [
              { label: 'Add row below', run: () => editor?.chain().focus().addRowAfter().run() },
              { label: 'Add column right', run: () => editor?.chain().focus().addColumnAfter().run() },
              { label: 'Toggle header row', run: () => editor?.chain().focus().toggleHeaderRow().run() },
              { label: 'Delete row', run: () => editor?.chain().focus().deleteRow().run() },
              { label: 'Delete column', run: () => editor?.chain().focus().deleteColumn().run() },
              { label: 'Delete table', run: () => editor?.chain().focus().deleteTable().run() },
            ].map((op) => (
              <MenuItem
                key={op.label}
                onClick={() => {
                  op.run();
                  setTableAnchor(null);
                }}
              >
                {op.label}
              </MenuItem>
            ))
          ) : (
            <MenuItem
              onClick={() => {
                editor
                  ?.chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run();
                setTableAnchor(null);
              }}
            >
              Insert 3 x 3 table
            </MenuItem>
          )}
        </Box>
      </Popover>

      <Popover
        open={Boolean(hintsAnchor)}
        anchorEl={hintsAnchor}
        onClose={() => setHintsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1.5, width: 232 }}>
          <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 1 }}>
            Keyboard shortcuts
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {SHORTCUTS.map((s) => (
              <Box
                key={s.label}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 13,
                }}
              >
                <span>{s.label}</span>
                <Box
                  component="kbd"
                  sx={{
                    fontFamily: 'ui-monospace, "Cascadia Code", monospace',
                    fontSize: 11,
                    bgcolor: '#f3f1ec',
                    border: '1px solid #e4e0d8',
                    borderRadius: '5px',
                    px: 0.75,
                    py: '2px',
                    color: '#3a382f',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.keys}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Popover>
    </>
  );
}
