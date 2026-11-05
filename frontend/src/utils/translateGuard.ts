/**
 * Keep React from crashing when the browser translates the page (Dash Update #80, 2026-11-05).
 *
 * Chrome's Translate (and similar tools) swap our text nodes for their own `<font>` elements. When React then removes or
 * inserts next to the text node it rendered, the node is no longer where React left it and the DOM throws
 * "NotFoundError: Failed to execute 'removeChild' on 'Node'". A Spanish-speaking member hit this on the add-phone code
 * step 7 times on 11-05 (facebook/react#11538). We keep translation on (it helps customers) and make these two calls
 * forgiving instead:
 *  - removeChild of a node that has already moved: remove it from where it is now (or do nothing if it is gone).
 *  - insertBefore a reference node that has moved inside this parent: insert before its top ancestor here; if it is
 *    gone entirely, append.
 * Text that swaps with an element is also wrapped in a `<span>` in the member and staff apps, so the translated words
 * are removed with it instead of staying on screen. Installed for all of Dash: staff screens get translated too, and
 * a moved node is the only thing it forgives (it warns once per page load).
 */
let installed = false;
let warned = false;

/** Once per page load: so a real DOM bug is never fully silent. */
function note(): void {
  if (warned) return;
  warned = true;
  console.warn('translateGuard: a DOM node moved by a page translator was skipped (Dash Update #80).');
}

export function installTranslateGuard(): void {
  if (installed || typeof Node !== 'function' || !Node.prototype) return;
  installed = true;
  const removeChild = Node.prototype.removeChild;
  const insertBefore = Node.prototype.insertBefore;

  Node.prototype.removeChild = function guardedRemoveChild<T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      note();
      if (child.parentNode) return removeChild.call(child.parentNode, child) as T;
      return child;
    }
    return removeChild.call(this, child) as T;
  };

  Node.prototype.insertBefore = function guardedInsertBefore<T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) {
      note();
      let top: Node | null = ref;
      while (top && top.parentNode !== this) top = top.parentNode;
      return insertBefore.call(this, node, top) as T;
    }
    return insertBefore.call(this, node, ref) as T;
  };
}
