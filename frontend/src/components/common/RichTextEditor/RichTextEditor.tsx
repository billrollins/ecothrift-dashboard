import { useEffect, useMemo, useRef, type ChangeEvent } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { createRichTextEditorExtensions } from './extensions';
import { cleanPastedHtml } from './pasteSanitizer';
import { RichTextEditorToolbar } from './RichTextEditorToolbar';
import type {
  RichTextEditorChange,
  RichTextEditorProps,
  RichTextEditorValue,
} from './types';
import './RichTextEditor.css';

function valueSignature(value: RichTextEditorValue): string {
  return typeof value === 'string' ? `html:${value}` : `json:${JSON.stringify(value ?? {})}`;
}

function editorSignature(editor: Editor, value: RichTextEditorValue): string {
  return typeof value === 'string'
    ? `html:${editor.getHTML()}`
    : `json:${JSON.stringify(editor.getJSON())}`;
}

function editorValue(editor: Editor): RichTextEditorChange {
  return {
    html: editor.getHTML(),
    json: editor.getJSON(),
    text: editor.getText(),
  };
}

function selectLinkCardFromEvent(view: EditorView, event: MouseEvent): boolean {
  const rawTarget = event.target;
  const target =
    rawTarget instanceof Element
      ? rawTarget
      : rawTarget instanceof globalThis.Node
        ? rawTarget.parentElement
        : null;
  const card = target?.closest('a.bt-linkcard');
  if (!card || !view.dom.contains(card)) return false;

  event.preventDefault();
  event.stopPropagation();
  try {
    const rawPosition = view.posAtDOM(card, 0);
    const resolved = view.state.doc.resolve(rawPosition);
    const position =
      resolved.nodeAfter?.type.name === 'linkCard'
        ? rawPosition
        : resolved.nodeBefore?.type.name === 'linkCard'
          ? rawPosition - resolved.nodeBefore.nodeSize
          : null;
    if (position != null) {
      view.dispatch(
        view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)),
      );
      view.focus();
    }
  } catch {
    // Still block navigation if ProseMirror cannot map the clicked DOM position.
  }
  return true;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = '',
  editable = true,
  variant,
  uploadImage,
  onSelectionChange,
  className = '',
}: RichTextEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const uploadImageRef = useRef(uploadImage);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const lastIncomingRef = useRef<string | null>(null);

  onChangeRef.current = onChange;
  uploadImageRef.current = uploadImage;
  onSelectionChangeRef.current = onSelectionChange;

  const extensions = useMemo(
    () => createRichTextEditorExtensions({ variant, placeholder }),
    [placeholder, variant],
  );

  const insertImage = async (file: File) => {
    const editor = editorRef.current;
    const uploader = uploadImageRef.current;
    if (!editor || !uploader) return;
    try {
      const image = await uploader(file);
      editor
        .chain()
        .focus()
        .setImage({ src: image.url, alt: image.alt ?? '' })
        .run();
    } catch {
      // Upload error presentation belongs to the injected uploader's owner.
    }
  };

  const editor = useEditor({
    extensions,
    content: value ?? '',
    editable,
    onUpdate: ({ editor: currentEditor }) => {
      onChangeRef.current(editorValue(currentEditor));
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      const { from, to, empty } = currentEditor.state.selection;
      onSelectionChangeRef.current?.({
        from,
        to,
        text: empty ? '' : currentEditor.state.doc.textBetween(from, to, ' '),
      });
    },
    editorProps: {
      transformPastedHTML: cleanPastedHtml,
      handleDOMEvents: {
        mousedown: selectLinkCardFromEvent,
        click: selectLinkCardFromEvent,
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved || !event.dataTransfer?.files?.length) return false;
        const file = Array.from(event.dataTransfer.files).find((candidate) =>
          candidate.type.startsWith('image/'),
        );
        if (!file || !uploadImageRef.current) return false;
        event.preventDefault();
        void insertImage(file);
        return true;
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.items ?? [])
          .map((item) => (item.type.startsWith('image/') ? item.getAsFile() : null))
          .find((candidate): candidate is File => Boolean(candidate));
        if (!file || !uploadImageRef.current) return false;
        event.preventDefault();
        void insertImage(file);
        return true;
      },
    },
  });

  editorRef.current = editor;

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor) return;
    const incoming = valueSignature(value);
    if (lastIncomingRef.current === incoming) return;
    lastIncomingRef.current = incoming;

    if (editorSignature(editor, value) !== incoming) {
      editor.commands.setContent(value ?? '', false);
    }
    onChangeRef.current(editorValue(editor));
  }, [editor, value]);

  const onImageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void insertImage(file);
  };

  return (
    <div
      className={`rich-text-editor rich-text-editor--${variant}${className ? ` ${className}` : ''}`}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onImageFile}
      />
      <RichTextEditorToolbar
        editor={editor}
        variant={variant}
        onImageClick={() => imageInputRef.current?.click()}
      />
      <EditorContent editor={editor} className="rich-text-editor-content" />
    </div>
  );
}
