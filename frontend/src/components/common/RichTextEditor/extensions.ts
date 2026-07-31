import { Extension, Mark, mergeAttributes, Node, type AnyExtension } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
import {
  HIGHLIGHTS,
  TEXT_COLORS,
  fontSizeClass,
  type CalloutTone,
  type FontSizeStep,
} from './constants';
import type { RichTextEditorVariant } from './types';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: FontSizeStep | null) => ReturnType;
    };
    textColorClass: {
      setTextColorClass: (className: string | null) => ReturnType;
    };
    highlightClass: {
      setHighlightClass: (className: string | null) => ReturnType;
    };
    dropCap: {
      toggleDropCap: () => ReturnType;
    };
    pullQuote: {
      togglePullQuote: () => ReturnType;
    };
    columnsSection: {
      insertColumns: () => ReturnType;
      unsetColumns: () => ReturnType;
    };
    callout: {
      setCallout: (tone: CalloutTone) => ReturnType;
      toggleCallout: (tone: CalloutTone) => ReturnType;
    };
    linkCard: {
      insertLinkCard: (attrs: {
        href: string;
        title?: string;
        description?: string;
        thumbnail?: string;
      }) => ReturnType;
    };
  }
}

const FontSizeMark = Mark.create({
  name: 'fontSize',
  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element) => {
          const match = (element as HTMLElement).className.match(
            /\bbt-size-(small|large|feature)\b/,
          );
          return match ? match[1] : null;
        },
        renderHTML: (attributes) => {
          const className = fontSizeClass(attributes.size as FontSizeStep | null);
          return className ? { class: className } : {};
        },
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span',
        getAttrs: (element) => {
          const match = (element as HTMLElement).className.match(
            /\bbt-size-(small|large|feature)\b/,
          );
          return match ? { size: match[1] } : false;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) => {
          if (!size || size === 'normal') return chain().unsetMark('fontSize').run();
          return chain().setMark('fontSize', { size }).run();
        },
    };
  },
});

const TextColorMark = Mark.create({
  name: 'textColorClass',
  addAttributes() {
    return {
      className: {
        default: null,
        parseHTML: (element) =>
          TEXT_COLORS.find((color) =>
            (element as HTMLElement).classList.contains(color.className),
          )?.className ?? null,
        renderHTML: (attributes) =>
          attributes.className ? { class: attributes.className } : {},
      },
    };
  },
  parseHTML() {
    return TEXT_COLORS.map((color) => ({
      tag: 'span',
      getAttrs: (element) =>
        (element as HTMLElement).classList.contains(color.className)
          ? { className: color.className }
          : false,
    }));
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setTextColorClass:
        (className) =>
        ({ chain }) =>
          className
            ? chain().setMark('textColorClass', { className }).run()
            : chain().unsetMark('textColorClass').run(),
    };
  },
});

const HighlightClassMark = Mark.create({
  name: 'highlightClass',
  addAttributes() {
    return {
      className: {
        default: null,
        parseHTML: (element) =>
          HIGHLIGHTS.find((highlight) =>
            (element as HTMLElement).classList.contains(highlight.className),
          )?.className ?? null,
        renderHTML: (attributes) =>
          attributes.className ? { class: attributes.className } : {},
      },
    };
  },
  parseHTML() {
    return HIGHLIGHTS.map((highlight) => ({
      tag: 'mark',
      getAttrs: (element) =>
        (element as HTMLElement).classList.contains(highlight.className)
          ? { className: highlight.className }
          : false,
    }));
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setHighlightClass:
        (className) =>
        ({ chain }) =>
          className
            ? chain().setMark('highlightClass', { className }).run()
            : chain().unsetMark('highlightClass').run(),
    };
  },
});

const Blockquote = Node.create({
  name: 'blockquote',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  parseHTML() {
    return [{ tag: 'blockquote:not(.bt-pullquote)' }];
  },
  renderHTML() {
    return ['blockquote', 0];
  },
  addCommands() {
    return {
      toggleBlockquote:
        () =>
        ({ chain, editor }) =>
          editor.isActive('blockquote')
            ? chain().lift('blockquote').run()
            : chain().wrapIn('blockquote').run(),
    };
  },
});

const RichTextImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: 'bt-img-full',
        parseHTML: (element) =>
          (element as HTMLElement).getAttribute('class') || 'bt-img-full',
        renderHTML: (attributes) => ({ class: attributes.class || 'bt-img-full' }),
      },
    };
  },
}).configure({
  inline: false,
  HTMLAttributes: { loading: 'lazy' },
});

const DropCapExtension = Extension.create({
  name: 'dropCap',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          dropCap: {
            default: false,
            parseHTML: (element) =>
              (element as HTMLElement).classList.contains('bt-dropcap'),
            renderHTML: (attributes) =>
              attributes.dropCap ? { class: 'bt-dropcap' } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      toggleDropCap:
        () =>
        ({ editor, commands }) =>
          commands.updateAttributes('paragraph', {
            dropCap: !editor.getAttributes('paragraph').dropCap,
          }),
    };
  },
});

const PullQuote = Node.create({
  name: 'pullQuote',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  parseHTML() {
    return [{ tag: 'blockquote.bt-pullquote' }];
  },
  renderHTML() {
    return ['blockquote', { class: 'bt-pullquote' }, 0];
  },
  addCommands() {
    return {
      togglePullQuote:
        () =>
        ({ chain, editor }) =>
          editor.isActive('pullQuote')
            ? chain().lift('pullQuote').run()
            : chain().wrapIn('pullQuote').run(),
    };
  },
});

const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: 'info',
        parseHTML: (element) => {
          const match = (element as HTMLElement).className.match(
            /\bbt-callout-(info|tip|warning)\b/,
          );
          return match ? match[1] : 'info';
        },
        renderHTML: (attributes) => ({
          class: `bt-callout bt-callout-${attributes.tone || 'info'}`,
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div.bt-callout' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setCallout:
        (tone) =>
        ({ chain, editor }) =>
          editor.isActive('callout')
            ? chain().updateAttributes('callout', { tone }).run()
            : chain().wrapIn('callout', { tone }).run(),
      toggleCallout:
        (tone) =>
        ({ chain, editor }) =>
          editor.isActive('callout')
            ? chain().lift('callout').run()
            : chain().wrapIn('callout', { tone }).run(),
    };
  },
});

const Column = Node.create({
  name: 'column',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div.bt-column' }];
  },
  renderHTML() {
    return ['div', { class: 'bt-column' }, 0];
  },
});

const ColumnsSection = Node.create({
  name: 'columnsSection',
  group: 'block',
  content: 'column column',
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: 'section.bt-columns-2' }];
  },
  renderHTML() {
    return ['section', { class: 'bt-columns bt-columns-2' }, 0];
  },
  addCommands() {
    return {
      insertColumns:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: 'columnsSection',
              content: [
                { type: 'column', content: [{ type: 'paragraph' }] },
                { type: 'column', content: [{ type: 'paragraph' }] },
              ],
            })
            .run(),
      unsetColumns:
        () =>
        ({ commands }) =>
          commands.lift('columnsSection'),
    };
  },
});

const LinkCard = Node.create({
  name: 'linkCard',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      href: { default: '' },
      title: { default: '' },
      description: { default: '' },
      thumbnail: { default: '' },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'a.bt-linkcard',
        getAttrs: (element) => {
          const anchor = element as HTMLElement;
          return {
            href: anchor.getAttribute('href') || '',
            title: anchor.querySelector('.bt-linkcard-title')?.textContent || '',
            description: anchor.querySelector('.bt-linkcard-desc')?.textContent || '',
            thumbnail:
              anchor.querySelector('.bt-linkcard-media img')?.getAttribute('src') || '',
          };
        },
      },
    ];
  },
  renderHTML({ node }) {
    const href = (node.attrs.href as string) || '#';
    const title = (node.attrs.title as string) || href;
    const description = (node.attrs.description as string) || '';
    const thumbnail = (node.attrs.thumbnail as string) || '';
    let host = '';
    try {
      host = new URL(href).hostname.replace(/^www\./, '');
    } catch {
      host = '';
    }

    const media: DOMOutputSpec = thumbnail
      ? [
          'span',
          { class: 'bt-linkcard-media' },
          ['img', { src: thumbnail, alt: '', loading: 'lazy' }],
        ]
      : ['span', { class: 'bt-linkcard-media bt-linkcard-media--empty' }, '\u25B6'];
    const body: DOMOutputSpec[] = [
      ['span', { class: 'bt-linkcard-title' }, title],
    ];
    if (description) body.push(['span', { class: 'bt-linkcard-desc' }, description]);
    if (host) body.push(['span', { class: 'bt-linkcard-host' }, host]);

    return [
      'a',
      { class: 'bt-linkcard', href, target: '_blank', rel: 'noopener nofollow' },
      media,
      ['span', { class: 'bt-linkcard-body' }, ...body],
    ] as DOMOutputSpec;
  },
  addCommands() {
    return {
      insertLinkCard:
        (attributes) =>
        ({ chain }) =>
          chain().insertContent({ type: 'linkCard', attrs: attributes }).run(),
    };
  },
});

/** Extensions safe for every editor variant, including email composition. */
export function createCoreRichTextExtensions(placeholder: string): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      blockquote: false,
      codeBlock: { HTMLAttributes: { class: 'bt-codeblock' } },
      code: { HTMLAttributes: { class: 'bt-code' } },
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: 'noopener nofollow', target: '_blank' },
    }),
    RichTextImage,
    Placeholder.configure({ placeholder }),
    FontSizeMark,
    TextColorMark,
    HighlightClassMark,
    Blockquote,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
  ];
}

/** Layout and publishing nodes that are intentionally unavailable in email. */
export function createBlogRichTextExtensions(): AnyExtension[] {
  return [DropCapExtension, PullQuote, Callout, Column, ColumnsSection, LinkCard];
}

export function createRichTextEditorExtensions(options: {
  variant: RichTextEditorVariant;
  placeholder?: string;
}): AnyExtension[] {
  const core = createCoreRichTextExtensions(options.placeholder ?? '');
  return options.variant === 'blog' ? [...core, ...createBlogRichTextExtensions()] : core;
}
