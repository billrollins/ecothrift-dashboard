import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { Box, MenuItem, Popover, Select, TextField, Tooltip, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  CALLOUT_TONES,
  FONT_SIZE_STEPS,
  HIGHLIGHTS,
  TEXT_COLORS,
  type FontSizeStep,
} from './constants';
import type { RichTextEditorVariant } from './types';

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const MOD = IS_MAC ? '\u2318' : 'Ctrl';
const SHIFT = IS_MAC ? '\u21e7' : 'Shift';
const ALT = IS_MAC ? '\u2325' : 'Alt';

const SHORTCUTS = [
  ['Bold', `${MOD} B`],
  ['Italic', `${MOD} I`],
  ['Underline', `${MOD} U`],
  ['Strikethrough', `${MOD} ${SHIFT} S`],
  ['Inline code', `${MOD} E`],
  ['Heading 2', `${MOD} ${ALT} 2`],
  ['Heading 3', `${MOD} ${ALT} 3`],
  ['Bullet list', `${MOD} ${SHIFT} 8`],
  ['Numbered list', `${MOD} ${SHIFT} 7`],
  ['Quote', `${MOD} ${SHIFT} B`],
  ['Code block', `${MOD} ${ALT} C`],
  ['Line break', `${SHIFT} Enter`],
  ['Undo', `${MOD} Z`],
  ['Redo', `${MOD} ${SHIFT} Z`],
] as const;

export const RICH_TEXT_TOOLBAR_CONFIG = [
  { id: 'style', variant: 'all' },
  { id: 'fontSize', variant: 'all' },
  { id: 'textColor', variant: 'all' },
  { id: 'highlight', variant: 'all' },
  { id: 'bold', variant: 'all' },
  { id: 'italic', variant: 'all' },
  { id: 'underline', variant: 'all' },
  { id: 'strike', variant: 'all' },
  { id: 'bulletList', variant: 'all' },
  { id: 'orderedList', variant: 'all' },
  { id: 'outdent', variant: 'all' },
  { id: 'indent', variant: 'all' },
  { id: 'blockquote', variant: 'all' },
  { id: 'pullQuote', variant: 'blog' },
  { id: 'dropCap', variant: 'blog' },
  { id: 'inlineCode', variant: 'all' },
  { id: 'codeBlock', variant: 'all' },
  { id: 'divider', variant: 'all' },
  { id: 'columns', variant: 'blog' },
  { id: 'exitColumns', variant: 'blog' },
  { id: 'callout', variant: 'blog' },
  { id: 'table', variant: 'all' },
  { id: 'linkCard', variant: 'blog' },
  { id: 'link', variant: 'all' },
  { id: 'image', variant: 'all' },
  { id: 'removeLinkCard', variant: 'blog' },
  { id: 'clearFormatting', variant: 'all' },
  { id: 'undo', variant: 'all' },
  { id: 'redo', variant: 'all' },
  { id: 'shortcuts', variant: 'all' },
] as const;

export function toolbarItemsForVariant(variant: RichTextEditorVariant) {
  return RICH_TEXT_TOOLBAR_CONFIG.filter(
    (item) => item.variant === 'all' || item.variant === variant,
  ).map((item) => item.id);
}

function youtubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/,
  );
  return match ? match[1] : null;
}

function useEditorTick(editor: Editor | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick((tick) => (tick + 1) % 1_000_000);
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
  return size && FONT_SIZE_STEPS.includes(size as FontSizeStep)
    ? (size as FontSizeStep)
    : 'normal';
}

function stepFontSize(current: FontSizeStep, direction: 1 | -1): FontSizeStep {
  const index = FONT_SIZE_STEPS.indexOf(current);
  return FONT_SIZE_STEPS[
    Math.max(0, Math.min(FONT_SIZE_STEPS.length - 1, index + direction))
  ];
}

export interface RichTextEditorToolbarProps {
  editor: Editor | null;
  variant: RichTextEditorVariant;
  onImageClick: () => void;
}

export function RichTextEditorToolbar({
  editor,
  variant,
  onImageClick,
}: RichTextEditorToolbarProps) {
  useEditorTick(editor);
  const disabled = !editor || !editor.isEditable;
  const items = new Set(toolbarItemsForVariant(variant));
  const show = (item: (typeof RICH_TEXT_TOOLBAR_CONFIG)[number]['id']) =>
    items.has(item);
  const cls = (active = false, extra = '') =>
    `rich-text-editor-button${extra ? ` ${extra}` : ''}${active ? ' is-active' : ''}`;

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

  const openLinkEditor = (event: MouseEvent<HTMLElement>) => {
    if (!editor) return;
    setLinkUrl((editor.getAttributes('link').href as string) || '');
    setLinkAnchor(event.currentTarget);
    setTimeout(() => linkInputRef.current?.focus(), 50);
  };

  const applyLink = () => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    else editor.chain().focus().unsetLink().run();
    setLinkAnchor(null);
  };

  const insertCard = () => {
    if (!editor) return;
    const href = cardForm.href.trim();
    if (!href) return;
    const videoId = youtubeId(href);
    const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
    let host = '';
    try {
      host = new URL(href).hostname.replace(/^www\./, '');
    } catch {
      host = '';
    }
    editor
      .chain()
      .focus()
      .insertLinkCard({
        href,
        title: cardForm.title.trim() || (videoId ? 'Watch on YouTube' : host || href),
        description: cardForm.description.trim(),
        thumbnail,
      })
      .run();
    setCardAnchor(null);
  };

  const removeSelectedLinkCard = () => {
    if (!editor) return;
    const { selection } = editor.state;
    if (selection instanceof NodeSelection && selection.node.type.name === 'linkCard') {
      editor.view.dispatch(
        editor.state.tr.delete(selection.from, selection.to).scrollIntoView(),
      );
      editor.view.focus();
    } else {
      editor.chain().focus().deleteNode('linkCard').run();
    }
  };

  return (
    <>
      <div className="rich-text-editor-toolbar" role="toolbar" aria-label="Formatting">
        {show('style') && (
          <Select
            size="small"
            value={styleValue()}
            disabled={disabled}
            onChange={(event) => setStyle(event.target.value)}
            className="rich-text-editor-select"
            variant="standard"
            disableUnderline
          >
            <MenuItem value="paragraph">Paragraph</MenuItem>
            <MenuItem value="h2">Heading 2</MenuItem>
            <MenuItem value="h3">Heading 3</MenuItem>
          </Select>
        )}
        <span className="rich-text-editor-divider" />

        {show('fontSize') && (
          <>
            <Tooltip title="Grow font">
              <span>
                <button
                  type="button"
                  className={cls()}
                  disabled={disabled}
                  onClick={() =>
                    editor
                      ?.chain()
                      .focus()
                      .setFontSize(stepFontSize(currentFontSize(editor), 1))
                      .run()
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
                  className={cls()}
                  disabled={disabled}
                  onClick={() =>
                    editor
                      ?.chain()
                      .focus()
                      .setFontSize(stepFontSize(currentFontSize(editor), -1))
                      .run()
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
                  className={cls()}
                  disabled={disabled}
                  onClick={() => editor?.chain().focus().setFontSize(null).run()}
                >
                  A↺
                </button>
              </span>
            </Tooltip>
          </>
        )}
        {show('textColor') && (
          <button
            type="button"
            className={cls(editor?.isActive('textColorClass') ?? false)}
            title="Text color"
            disabled={disabled}
            onClick={(event) => setColorAnchor(event.currentTarget)}
          >
            A<span className="rich-text-editor-swatch" />
          </button>
        )}
        {show('highlight') && (
          <button
            type="button"
            className={cls(editor?.isActive('highlightClass') ?? false)}
            title="Highlight"
            disabled={disabled}
            onClick={(event) => setHighlightAnchor(event.currentTarget)}
          >
            ◐
          </button>
        )}
        <span className="rich-text-editor-divider" />

        <button
          type="button"
          className={cls(editor?.isActive('bold') ?? false, 'is-bold')}
          title={`Bold (${MOD} B)`}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          B
        </button>
        <button
          type="button"
          className={cls(editor?.isActive('italic') ?? false, 'is-italic')}
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
          <u>U</u>
        </button>
        <button
          type="button"
          className={cls(editor?.isActive('strike') ?? false)}
          title={`Strikethrough (${MOD} ${SHIFT} S)`}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <s>S</s>
        </button>
        <span className="rich-text-editor-divider" />

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
          className={cls()}
          title="Outdent"
          disabled={disabled || !editor?.can().liftListItem('listItem')}
          onClick={() => editor?.chain().focus().liftListItem('listItem').run()}
        >
          &#8676;
        </button>
        <button
          type="button"
          className={cls()}
          title="Indent"
          disabled={disabled || !editor?.can().sinkListItem('listItem')}
          onClick={() => editor?.chain().focus().sinkListItem('listItem').run()}
        >
          &#8677;
        </button>
        <span className="rich-text-editor-divider" />

        <button
          type="button"
          className={cls(editor?.isActive('blockquote') ?? false)}
          title={`Quote (${MOD} ${SHIFT} B)`}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          &ldquo;
        </button>
        {show('pullQuote') && (
          <button
            type="button"
            className={cls(editor?.isActive('pullQuote') ?? false)}
            title="Pull quote"
            disabled={disabled}
            onClick={() => editor?.chain().focus().togglePullQuote().run()}
          >
            &ldquo;&rdquo;
          </button>
        )}
        {show('dropCap') && (
          <button
            type="button"
            className={cls(Boolean(editor?.getAttributes('paragraph').dropCap))}
            title="Drop cap"
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleDropCap().run()}
          >
            W
          </button>
        )}
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
          className={cls()}
          title="Divider"
          disabled={disabled}
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        >
          &mdash;
        </button>
        <span className="rich-text-editor-divider" />

        {show('columns') && (
          <button
            type="button"
            className={cls(editor?.isActive('columnsSection') ?? false)}
            title="Two columns"
            disabled={disabled}
            onClick={() => editor?.chain().focus().insertColumns().run()}
          >
            &#9638;
          </button>
        )}
        {show('exitColumns') && (
          <button
            type="button"
            className={cls()}
            title="Exit columns"
            disabled={disabled || !editor?.isActive('columnsSection')}
            onClick={() => editor?.chain().focus().unsetColumns().run()}
          >
            &#9633;
          </button>
        )}
        {show('callout') && (
          <button
            type="button"
            className={cls(editor?.isActive('callout') ?? false)}
            title="Callout box"
            disabled={disabled}
            onClick={(event) => setCalloutAnchor(event.currentTarget)}
          >
            &#9432;
          </button>
        )}
        <button
          type="button"
          className={cls(editor?.isActive('table') ?? false)}
          title="Table"
          disabled={disabled}
          onClick={(event) => setTableAnchor(event.currentTarget)}
        >
          &#9783;
        </button>
        {show('linkCard') && (
          <button
            type="button"
            className={cls()}
            title="Embed / link card"
            disabled={disabled}
            onClick={(event) => {
              setCardForm({ href: '', title: '', description: '' });
              setCardAnchor(event.currentTarget);
              setTimeout(() => cardUrlRef.current?.focus(), 50);
            }}
          >
            &#9655;
          </button>
        )}
        <span className="rich-text-editor-divider" />

        <button
          type="button"
          className={cls(editor?.isActive('link') ?? false)}
          title="Link"
          disabled={disabled}
          onClick={openLinkEditor}
        >
          &#128279;
        </button>
        <button
          type="button"
          className={cls()}
          title="Insert image"
          disabled={disabled}
          onClick={onImageClick}
        >
          &#9634;
        </button>
        {editor?.isActive('image') &&
          (['bt-img-small', 'bt-img-medium', 'bt-img-full'] as const).map(
            (className) => (
              <button
                key={className}
                type="button"
                className={cls(editor.getAttributes('image').class === className)}
                title={className.replace('bt-img-', '')}
                onClick={() =>
                  editor.chain().focus().updateAttributes('image', { class: className }).run()
                }
              >
                {className === 'bt-img-small'
                  ? 'S'
                  : className === 'bt-img-medium'
                    ? 'M'
                    : 'L'}
              </button>
            ),
          )}
        {show('removeLinkCard') && editor?.isActive('linkCard') && (
          <button
            type="button"
            className={cls()}
            title="Remove embed card"
            aria-label="Remove embed card"
            onMouseDown={(event) => event.preventDefault()}
            onClick={removeSelectedLinkCard}
          >
            <DeleteOutlineIcon sx={{ fontSize: 18 }} />
          </button>
        )}
        <button
          type="button"
          className={cls()}
          title="Clear formatting"
          disabled={disabled}
          onClick={() =>
            editor?.chain().focus().clearNodes().unsetAllMarks().setParagraph().run()
          }
        >
          &#10005;
        </button>
        <span className="rich-text-editor-divider" />

        <button
          type="button"
          className={cls()}
          title={`Undo (${MOD} Z)`}
          disabled={disabled || !editor?.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          &#8630;
        </button>
        <button
          type="button"
          className={cls()}
          title={`Redo (${MOD} ${SHIFT} Z)`}
          disabled={disabled || !editor?.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          &#8631;
        </button>
        <span className="rich-text-editor-divider" />
        <button
          type="button"
          className={cls(Boolean(hintsAnchor))}
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
          onClick={(event) => setHintsAnchor(event.currentTarget)}
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
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && applyLink()}
          />
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => editor?.chain().focus().unsetLink().run()}
            >
              Remove
            </button>
            <button type="button" onClick={applyLink}>
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
          {TEXT_COLORS.map((color) => (
            <Box
              key={color.id}
              component="button"
              type="button"
              title={color.label}
              onClick={() => {
                editor?.chain().focus().setTextColorClass(color.className).run();
                setColorAnchor(null);
              }}
              sx={{
                width: 30,
                height: 30,
                p: 0,
                borderRadius: '8px',
                cursor: 'pointer',
                border: '1px solid rgba(24,23,18,0.15)',
                bgcolor: color.swatch,
              }}
            />
          ))}
          <button
            type="button"
            title="Remove color"
            onClick={() => {
              editor?.chain().focus().setTextColorClass(null).run();
              setColorAnchor(null);
            }}
          >
            &#10005;
          </button>
        </Box>
      </Popover>

      <Popover
        open={Boolean(highlightAnchor)}
        anchorEl={highlightAnchor}
        onClose={() => setHighlightAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.75, maxWidth: 196 }}>
          {HIGHLIGHTS.map((highlight) => (
            <button
              key={highlight.id}
              type="button"
              title={highlight.label}
              onClick={() => {
                editor?.chain().focus().setHighlightClass(highlight.className).run();
                setHighlightAnchor(null);
              }}
              style={{ background: highlight.swatch }}
            >
              Ab
            </button>
          ))}
          <button
            type="button"
            title="Remove highlight"
            onClick={() => {
              editor?.chain().focus().setHighlightClass(null).run();
              setHighlightAnchor(null);
            }}
          >
            &#10005;
          </button>
        </Box>
      </Popover>

      <Popover
        open={Boolean(calloutAnchor)}
        anchorEl={calloutAnchor}
        onClose={() => setCalloutAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ py: 0.5, minWidth: 150 }}>
          {CALLOUT_TONES.map((tone) => (
            <MenuItem
              key={tone.id}
              selected={editor?.isActive('callout', { tone: tone.id }) ?? false}
              onClick={() => {
                editor?.chain().focus().setCallout(tone.id).run();
                setCalloutAnchor(null);
              }}
            >
              {tone.label}
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
            onChange={(event) =>
              setCardForm((form) => ({ ...form, href: event.target.value }))
            }
            onKeyDown={(event) => event.key === 'Enter' && insertCard()}
          />
          <TextField
            size="small"
            label="Title (optional)"
            value={cardForm.title}
            onChange={(event) =>
              setCardForm((form) => ({ ...form, title: event.target.value }))
            }
          />
          <TextField
            size="small"
            label="Description (optional)"
            value={cardForm.description}
            onChange={(event) =>
              setCardForm((form) => ({ ...form, description: event.target.value }))
            }
          />
          <Typography variant="caption" color="text.secondary">
            YouTube links get a thumbnail automatically. No inline video is embedded.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setCardAnchor(null)}>
              Cancel
            </button>
            <button type="button" onClick={insertCard}>
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
              ['Add row below', () => editor.chain().focus().addRowAfter().run()],
              ['Add column right', () => editor.chain().focus().addColumnAfter().run()],
              ['Toggle header row', () => editor.chain().focus().toggleHeaderRow().run()],
              ['Delete row', () => editor.chain().focus().deleteRow().run()],
              ['Delete column', () => editor.chain().focus().deleteColumn().run()],
              ['Delete table', () => editor.chain().focus().deleteTable().run()],
            ].map(([label, run]) => (
              <MenuItem
                key={label as string}
                onClick={() => {
                  (run as () => void)();
                  setTableAnchor(null);
                }}
              >
                {label as string}
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
          {SHORTCUTS.map(([label, keys]) => (
            <Box
              key={label}
              sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, mb: 0.5 }}
            >
              <span>{label}</span>
              <Box
                component="kbd"
                sx={{
                  fontFamily: 'ui-monospace, "Cascadia Code", monospace',
                  fontSize: 11,
                  bgcolor: '#f3f1ec',
                  border: '1px solid #e4e0d8',
                  borderRadius: '5px',
                  px: 0.75,
                  whiteSpace: 'nowrap',
                }}
              >
                {keys}
              </Box>
            </Box>
          ))}
        </Box>
      </Popover>
    </>
  );
}
