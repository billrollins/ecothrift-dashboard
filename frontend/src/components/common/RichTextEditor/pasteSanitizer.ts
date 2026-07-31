import { ALLOWED_RICH_TEXT_CLASSES } from './constants';

const PASTE_DROP_TAGS = new Set(['STYLE', 'SCRIPT', 'META', 'LINK', 'TITLE', 'HEAD']);

/**
 * Normalize HTML pasted from Word, Google Docs, and the web before ProseMirror parses it.
 */
export function cleanPastedHtml(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode as Comment);
  comments.forEach((comment) => comment.remove());

  doc.body.querySelectorAll('*').forEach((element) => {
    const tag = element.tagName.toUpperCase();
    if (PASTE_DROP_TAGS.has(tag) || tag.includes(':')) {
      element.remove();
      return;
    }

    for (const attribute of ['style', 'align', 'width', 'height', 'bgcolor']) {
      element.removeAttribute(attribute);
    }

    const className = element.getAttribute('class');
    if (className) {
      const kept = className
        .split(/\s+/)
        .filter((candidate) => ALLOWED_RICH_TEXT_CLASSES.has(candidate));
      if (kept.length) element.setAttribute('class', kept.join(' '));
      else element.removeAttribute('class');
    }
  });

  doc.body.querySelectorAll('span:not([class])').forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  });

  return doc.body.innerHTML;
}
