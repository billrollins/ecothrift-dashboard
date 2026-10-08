import { Box, Divider, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { getMarkRange, Mark, mergeAttributes, Node } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ccTokens } from '../../theme';
import { docToTemplate, templateToDoc } from './emailTemplate';
import './EmailEditor.css';

type Pick =
  | { kind: 'field'; anchor: HTMLElement; pos: number; name: string }
  | { kind: 'typed'; anchor: HTMLElement; from: number; to: number; name: string };

/**
 * One part of an email (subject or message) as it will read, with every value Dash fills in shown as a green chip.
 * Tap a chip to type over it: the words turn amber ("no longer from Dash") and can be put back.
 * ``onChange`` gets the template back: linked values as {placeholders}, everything else as typed.
 */
export function EmailEditor({
  label,
  template,
  values,
  fields,
  singleLine = false,
  short = false,
  resetKey = 0,
  onChange,
}: {
  label: string;
  template: string;
  values: Record<string, string>;
  fields: Record<string, string>;
  singleLine?: boolean;
  /** A few lines tall (a text message), not an email's twelve. */
  short?: boolean;
  /** Change it to put the template back (Undo all). */
  resetKey?: number;
  onChange: (template: string) => void;
}) {
  const [pick, setPick] = useState<Pick | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lookup = useRef({ values, fields });
  lookup.current = { values, fields };

  const extensions = useMemo(() => {
    const Field = Node.create({
      name: 'field',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      draggable: false,
      addAttributes: () => ({ name: { default: '' } }),
      parseHTML: () => [{ tag: 'span[data-field]', getAttrs: (el) => ({ name: (el as HTMLElement).dataset.field }) }],
      renderHTML: ({ node, HTMLAttributes }) => {
        const name = String(node.attrs.name);
        const value = lookup.current.values[name] ?? '';
        const what = lookup.current.fields[name] ?? name;
        return [
          'span',
          mergeAttributes(HTMLAttributes, {
            'data-field': name,
            class: value ? 'ef-chip' : 'ef-chip ef-chip--blank',
            contenteditable: 'false',
            title: `Filled in by Dash: ${what}. Tap to type over it.`,
          }),
          value || `(blank: ${what})`,
        ];
      },
      renderText: ({ node }) => lookup.current.values[String(node.attrs.name)] ?? '',
    });
    const TypedOver = Mark.create({
      name: 'typedOver',
      // Typing on at the end of typed-over words keeps them amber (they are all your words now).
      inclusive: true,
      addAttributes: () => ({ name: { default: '' } }),
      parseHTML: () => [{ tag: 'span[data-typed]' }],
      renderHTML: ({ mark }) => {
        const what = lookup.current.fields[String(mark.attrs.name)] ?? mark.attrs.name;
        return ['span', { 'data-typed': mark.attrs.name, class: 'ef-typed', title: `Typed over: no longer from Dash (${what}).` }, 0];
      },
    });
    return [
      StarterKit.configure({
        blockquote: false, bold: false, bulletList: false, code: false, codeBlock: false, dropcursor: false,
        gapcursor: false, hardBreak: false, heading: false, horizontalRule: false, italic: false, listItem: false,
        orderedList: false, strike: false,
      }),
      Field,
      TypedOver,
    ];
  }, []);

  const editor = useEditor({
    extensions,
    content: templateToDoc(template, fields),
    onUpdate: ({ editor: e }) => onChangeRef.current(docToTemplate(e.getJSON())),
    editorProps: {
      attributes: {
        'aria-label': label,
        class: singleLine ? 'ef-doc ef-doc--line' : short ? 'ef-doc ef-doc--short' : 'ef-doc',
      },
      handleKeyDown: (_view, event) => singleLine && event.key === 'Enter',
      // Paste as plain words (a {placeholder} Dash knows becomes a chip).
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain');
        if (!text) return false;
        event.preventDefault();
        const clean = singleLine ? text.replace(/\s*\r?\n\s*/g, ' ') : text;
        const doc = view.state.schema.nodeFromJSON(templateToDoc(clean, lookup.current.fields));
        const slice = doc.childCount === 1 ? new Slice(doc.firstChild!.content, 0, 0) : new Slice(doc.content, 1, 1);
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        return true;
      },
      handleClickOn: (_view, _pos, node, nodePos, event) => {
        if (node.type.name !== 'field') return false;
        setPick({ kind: 'field', anchor: event.target as HTMLElement, pos: nodePos, name: String(node.attrs.name) });
        return true;
      },
      handleClick: (view, pos, event) => {
        const target = (event.target as HTMLElement | null)?.closest('[data-typed]') as HTMLElement | null;
        if (!target) return false;
        const type = view.state.schema.marks.typedOver;
        const range = getMarkRange(view.state.doc.resolve(pos), type);
        if (!range) return false;
        setPick({ kind: 'typed', anchor: target, from: range.from, to: range.to, name: target.dataset.typed ?? '' });
        return false; // the caret still lands where they tapped
      },
    },
  });

  useEffect(() => {
    if (!editor || resetKey === 0) return;
    editor.commands.setContent(templateToDoc(template, fields), true);
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The menu closes first; then the editor takes focus with the words selected, ready to type over.
  const afterMenu = (fn: () => void) => {
    setPick(null);
    window.setTimeout(() => {
      fn();
      editor?.view.focus(); // now, not on the next frame
    }, 30);
  };

  function typeOver() {
    if (!editor || pick?.kind !== 'field') return;
    const text = lookup.current.values[pick.name] || lookup.current.fields[pick.name] || pick.name;
    const { pos, name } = pick;
    afterMenu(() =>
      editor
        .chain()
        .focus()
        .command(({ tr, state }) => {
          tr.replaceWith(pos, pos + 1, state.schema.text(text, [state.schema.marks.typedOver.create({ name })]));
          tr.setSelection(TextSelection.create(tr.doc, pos, pos + text.length));
          return true;
        })
        .run(),
    );
  }

  function putBack() {
    if (!editor || pick?.kind !== 'typed') return;
    const { from, to, name } = pick;
    afterMenu(() =>
      editor
        .chain()
        .focus()
        .command(({ tr, state }) => {
          tr.replaceWith(from, to, state.schema.nodes.field.create({ name }));
          return true;
        })
        .run(),
    );
  }

  const what = pick ? fields[pick.name] ?? pick.name : '';
  return (
    <Box>
      <Typography variant="caption" sx={{ color: ccTokens.ink2, fontWeight: 700, display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      <Box className="ef-box">
        <EditorContent editor={editor} />
      </Box>
      <Menu anchorEl={pick?.anchor ?? null} open={!!pick} onClose={() => setPick(null)} disableRestoreFocus>
        {pick?.kind === 'field' && [
          <Box key="info" sx={{ px: 2, py: 1, maxWidth: 320 }}>
            <Typography variant="body2" fontWeight={700}>
              Filled in by Dash: {what}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              It stays linked: Dash fills in the value when the email goes out.
            </Typography>
          </Box>,
          <Divider key="d" />,
          <MenuItem key="over" onClick={typeOver}>
            <ListItemText primary="Type over it" secondary="Your words instead, for this email only" />
          </MenuItem>,
          <MenuItem key="keep" onClick={() => setPick(null)}>
            Keep it
          </MenuItem>,
        ]}
        {pick?.kind === 'typed' && [
          <Box key="info" sx={{ px: 2, py: 1, maxWidth: 320 }}>
            <Typography variant="body2" fontWeight={700} sx={{ color: ccTokens.warnText }}>
              Typed over: no longer from Dash
            </Typography>
            <Typography variant="caption" color="text.secondary">
              These words replace {what}. Dash will not update them.
            </Typography>
          </Box>,
          <Divider key="d" />,
          <MenuItem key="back" onClick={putBack}>
            <ListItemText primary="Put Dash's value back" secondary={values[pick.name] || `(blank: ${what})`} />
          </MenuItem>,
          <MenuItem key="keep" onClick={() => setPick(null)}>
            Keep my words
          </MenuItem>,
        ]}
      </Menu>
    </Box>
  );
}
