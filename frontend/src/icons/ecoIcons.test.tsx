import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ACTION_ICON_NAMES, ECO_ICONS, ICON_NAMES, PAGE_ICON_NAMES, type EcoIconName } from './ecoIcons';
import { NAV_ITEM_CATALOG } from '../navigation/navItemCatalog';
import { SLOT_C_WORKSPACES } from '../navigation/slotCNavLayout';
import { PageHeader, navIconForRoute } from '../components/common/PageHeader';

const SHAPES = 'path, circle, rect, line, polyline, polygon, ellipse';

function draw(name: EcoIconName) {
  const Icon = ECO_ICONS[name];
  const { container } = render(<Icon />);
  return container.querySelector('svg') as SVGSVGElement;
}

describe('Eco icon set: the recipe (top of ecoIcons.tsx)', () => {
  it.each(ICON_NAMES)('%s is drawn inside the one wrapper, with no stray stroke or fill', (name) => {
    const svg = draw(name);
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    const line = svg.querySelector(':scope > g[data-role="line"]');
    expect(line?.getAttribute('stroke-width')).toBe('1.75');
    expect(line?.getAttribute('fill')).toBe('none');
    const shapes = svg.querySelectorAll(SHAPES);
    expect(shapes.length).toBeGreaterThan(0);
    shapes.forEach((shape) => {
      expect(line?.contains(shape)).toBe(true);
      for (const attr of ['fill', 'stroke', 'stroke-width', 'style', 'class', 'transform']) {
        expect(shape.hasAttribute(attr)).toBe(false);
      }
    });
  });

  it.each(PAGE_ICON_NAMES)('page icon %s has a wash and exactly one kraft detail', (name) => {
    const svg = draw(name);
    expect(svg.querySelectorAll('[data-role="accent"]')).toHaveLength(1);
    expect(svg.querySelectorAll('[data-role="wash"]').length).toBeGreaterThan(0);
  });

  it.each(ACTION_ICON_NAMES)('action icon %s is line only', (name) => {
    const svg = draw(name);
    expect(svg.querySelectorAll('[data-role="accent"], [data-role="wash"]')).toHaveLength(0);
  });

  it('gives every sidebar page and workspace an icon from the set', () => {
    for (const item of Object.values(NAV_ITEM_CATALOG)) expect(ICON_NAMES).toContain(item.icon);
    for (const workspace of SLOT_C_WORKSPACES) expect(ICON_NAMES).toContain(workspace.icon);
  });
});

describe('PageHeader icon', () => {
  it('takes the icon of the sidebar page the route belongs to', () => {
    expect(navIconForRoute('/pos/terminal')).toBe('register');
    expect(navIconForRoute('/inventory/vendors/12')).toBe('vendor');
    expect(navIconForRoute('/nowhere')).toBeNull();
  });

  it('shows it beside the title, and none outside a router or when turned off', () => {
    const { container, unmount } = render(
      <MemoryRouter initialEntries={['/pos/terminal']}><PageHeader title="Terminal" /></MemoryRouter>,
    );
    expect(container.querySelector('[data-eco-icon="register"]')).not.toBeNull();
    unmount();
    render(<PageHeader title="Plain" />);
    expect(screen.getByText('Plain').parentElement?.parentElement?.querySelector('svg')).toBeNull();
    const off = render(
      <MemoryRouter initialEntries={['/pos/terminal']}><PageHeader title="Off" icon={false} /></MemoryRouter>,
    );
    expect(off.container.querySelector('svg')).toBeNull();
  });
});
