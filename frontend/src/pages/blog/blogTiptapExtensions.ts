import { Extension, Mark, mergeAttributes, Node } from '@tiptap/core';
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
import type { CalloutTone, FontSizeStep } from './blogEditorConstants';
import { ALLOWED_BT_CLASSES, fontSizeClass, HIGHLIGHTS, TEXT_COLORS } from './blogEditorConstants';

/**
 * Normalize HTML pasted from Word / Google Docs / the web before ProseMirror parses it.
 * Strips inline styles, presentational attributes, non-`bt-` classes, Office cruft, and
 * collapses class-less <span> soup so the stored document stays clean.
 */
const PASTE_DROP_TAGS = new Set(['STYLE', 'SCRIPT', 'META', 'LINK', 'TITLE', 'HEAD']);

export function cleanPastedHtml(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Drop comments (Word wraps conditional cruft in <!--[if ...]-->).
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode as Comment);
  comments.forEach((c) => c.remove());

  doc.body.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName.toUpperCase();
    if (PASTE_DROP_TAGS.has(tag) || tag.includes(':')) {
      el.remove();
      return;
    }
    el.removeAttribute('style');
    el.removeAttribute('align');
    el.removeAttribute('width');
    el.removeAttribute('height');
    el.removeAttribute('bgcolor');
    const className = el.getAttribute('class');
    if (className) {
      const kept = className.split(/\s+/).filter((c) => ALLOWED_BT_CLASSES.has(c));
      if (kept.length) el.setAttribute('class', kept.join(' '));
      else el.removeAttribute('class');
    }
  });

  // Unwrap class-less spans (style carriers from Docs/Word).
  doc.body.querySelectorAll('span:not([class])').forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  });

  return doc.body.innerHTML;
}

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
        parseHTML: (el) => {
          const m = (el as HTMLElement).className.match(/\bbt-size-(small|large|feature)\b/);
          return m ? m[1] : null;
        },
        renderHTML: (attrs) => {
          const cls = fontSizeClass(attrs.size as FontSizeStep | null);
          return cls ? { class: cls } : {};
        },
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span',
        getAttrs: (el) => {
          const m = (el as HTMLElement).className.match(/\bbt-size-(small|large|feature)\b/);
          return m ? { size: m[1] } : false;
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
          if (!size || size === 'normal') {
            return chain().unsetMark('fontSize').run();
          }
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
        parseHTML: (el) => TEXT_COLORS.find((c) => (el as HTMLElement).classList.contains(c.className))?.className ?? null,
        renderHTML: (attrs) => (attrs.className ? { class: attrs.className } : {}),
      },
    };
  },
  parseHTML() {
    return TEXT_COLORS.map((c) => ({
      tag: 'span',
      getAttrs: (el) => ((el as HTMLElement).classList.contains(c.className) ? { className: c.className } : false),
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
        parseHTML: (el) => HIGHLIGHTS.find((h) => (el as HTMLElement).classList.contains(h.className))?.className ?? null,
        renderHTML: (attrs) => (attrs.className ? { class: attrs.className } : {}),
      },
    };
  },
  parseHTML() {
    return HIGHLIGHTS.map((h) => ({
      tag: 'mark',
      getAttrs: (el) => ((el as HTMLElement).classList.contains(h.className) ? { className: h.className } : false),
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

const DropCapExtension = Extension.create({
  name: 'dropCap',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          dropCap: {
            default: false,
            parseHTML: (el) => (el as HTMLElement).classList.contains('bt-dropcap'),
            renderHTML: (attrs) => (attrs.dropCap ? { class: 'bt-dropcap' } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      toggleDropCap:
        () =>
        ({ editor, commands }) => {
          const { dropCap } = editor.getAttributes('paragraph');
          return commands.updateAttributes('paragraph', { dropCap: !dropCap });
        },
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
        ({ chain, editor }) => {
          if (editor.isActive('pullQuote')) {
            return chain().lift('pullQuote').run();
          }
          return chain().wrapIn('pullQuote').run();
        },
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
        parseHTML: (el) => {
          const m = (el as HTMLElement).className.match(/\bbt-callout-(info|tip|warning)\b/);
          return m ? m[1] : 'info';
        },
        renderHTML: (attrs) => ({ class: `bt-callout bt-callout-${attrs.tone || 'info'}` }),
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

/**
 * Safe embed: a clickable link card with optional thumbnail. Deliberately renders an <a>
 * (no <iframe>) so the sanitizer never has to trust a third-party frame.
 */
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
        getAttrs: (el) => {
          const a = el as HTMLElement;
          return {
            href: a.getAttribute('href') || '',
            title: a.querySelector('.bt-linkcard-title')?.textContent || '',
            description: a.querySelector('.bt-linkcard-desc')?.textContent || '',
            thumbnail: a.querySelector('.bt-linkcard-media img')?.getAttribute('src') || '',
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
      ? ['span', { class: 'bt-linkcard-media' }, ['img', { src: thumbnail, alt: '', loading: 'lazy' }]]
      : ['span', { class: 'bt-linkcard-media bt-linkcard-media--empty' }, '\u25B6'];

    const bodyChildren: DOMOutputSpec[] = [['span', { class: 'bt-linkcard-title' }, title]];
    if (description) bodyChildren.push(['span', { class: 'bt-linkcard-desc' }, description]);
    if (host) bodyChildren.push(['span', { class: 'bt-linkcard-host' }, host]);

    return [
      'a',
      { class: 'bt-linkcard', href, target: '_blank', rel: 'noopener nofollow' },
      media,
      ['span', { class: 'bt-linkcard-body' }, ...bodyChildren],
    ] as DOMOutputSpec;
  },
  addCommands() {
    return {
      insertLinkCard:
        (attrs) =>
        ({ chain }) =>
          chain().insertContent({ type: 'linkCard', attrs }).run(),
    };
  },
});

export function createBlogEditorExtensions(placeholder: string) {
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
    Image.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          class: {
            default: 'bt-img-full',
            parseHTML: (el) => (el as HTMLElement).getAttribute('class') || 'bt-img-full',
            renderHTML: (attrs) => ({ class: attrs.class || 'bt-img-full' }),
          },
        };
      },
    }).configure({
      inline: false,
      HTMLAttributes: { loading: 'lazy' },
    }),
    Placeholder.configure({ placeholder }),
    FontSizeMark,
    TextColorMark,
    HighlightClassMark,
    DropCapExtension,
    Node.create({
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
            ({ chain, editor }) => {
              if (editor.isActive('blockquote')) {
                return chain().lift('blockquote').run();
              }
              return chain().wrapIn('blockquote').run();
            },
        };
      },
    }),
    PullQuote,
    Callout,
    Column,
    ColumnsSection,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    LinkCard,
  ];
}
