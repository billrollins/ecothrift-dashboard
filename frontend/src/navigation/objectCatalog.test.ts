import { describe, expect, it } from 'vitest';
import { ECO_ICONS } from '../icons/ecoIcons';
import { WINDOW_DEMOS } from '../pages/designlab/windowDemos';
import { OBJECTS, OBJECT_GROUPS, windowCheckId } from './objectCatalog';

const ids = new Set(OBJECTS.map((o) => o.id));

describe('object catalog (Object windows)', () => {
  it('lists each object once, in a known group, with a real icon', () => {
    expect(ids.size).toBe(OBJECTS.length);
    OBJECTS.forEach((o) => {
      expect(OBJECT_GROUPS).toContain(o.group);
      expect(ECO_ICONS[o.icon]).toBeDefined();
    });
  });

  it('links only to objects in the catalog', () => {
    OBJECTS.forEach((o) => o.related.forEach((r) => expect(ids.has(r), `${o.id} -> ${r}`).toBe(true)));
  });

  it('has a Design Lab demo for every object, whose related blocks are links the catalog names', () => {
    OBJECTS.forEach((o) => {
      const demo = WINDOW_DEMOS[o.id];
      expect(demo, o.id).toBeDefined();
      (demo.related ?? []).forEach((r) => expect(o.related, `${o.id} demo -> ${r.object}`).toContain(r.object));
      expect((demo.stats ?? []).length).toBeLessThanOrEqual(4);
    });
  });

  it('saves its ticks under an id the server accepts', () => {
    OBJECTS.forEach((o) => expect(windowCheckId(o.id)).toMatch(/^[A-Za-z][A-Za-z0-9_-]{0,59}$/));
  });
});
