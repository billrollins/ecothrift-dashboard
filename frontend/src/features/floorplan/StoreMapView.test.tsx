import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { MapLayer, MapPin, PlanDocument } from '../../types/floorplan.types';
import StoreMapView from './StoreMapView';

function planDoc(): PlanDocument {
  return {
    schema_version: 1,
    settings: { planWidth: 600, planHeight: 400, grid: { visible: true, minor: 6, major: 12 }, snap: 1 },
    elements: [{ id: 'el_1', kind: 'gondola', x: 100, y: 100, w: 48, h: 144, rotation: 0, label: 'Aisle 1', active: true }],
    zones: [],
    paths: [],
    labels: [],
    infoBlocks: [],
  };
}

const layers: MapLayer[] = [
  { id: 1, slug: 'signage', name: 'Signage', description: '', color: '#2563eb', ref_type: '', sort_order: 10 },
  { id: 2, slug: 'cameras', name: 'Cameras', description: '', color: '#dc2626', ref_type: '', sort_order: 20 },
];

function pin(id: number, layer: number, name: string): MapPin {
  return {
    id, plan: 9, layer, layer_slug: layer === 1 ? 'signage' : 'cameras', x: 50, y: 60, name, note: '',
    ref_type: '', ref_id: null, status: 'wanted', created_at: '', updated_at: '',
  };
}

const pins = [pin(1, 1, 'Exit sign'), pin(2, 2, 'Front camera')];

describe('StoreMapView (#105)', () => {
  it('draws the plan and only the pins on layers that are on', () => {
    render(<StoreMapView doc={planDoc()} layers={layers} pins={pins} visibleLayerIds={new Set([1])} />);
    expect(screen.getByText('Aisle 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Signage: Exit sign' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cameras: Front camera' })).toBeNull();
  });

  it('tapping a pin on a read-only map reports it', () => {
    const onPinClick = vi.fn();
    render(<StoreMapView doc={planDoc()} layers={layers} pins={pins} visibleLayerIds={new Set([1, 2])} onPinClick={onPinClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cameras: Front camera' }));
    expect(onPinClick).toHaveBeenCalledWith(pins[1]);
  });

  it('shows the name of a highlighted pin', () => {
    render(
      <StoreMapView doc={planDoc()} layers={layers} pins={pins} visibleLayerIds={new Set([1, 2])} highlightedPinIds={new Set([2])} />,
    );
    expect(screen.getByText('Front camera')).toBeTruthy();
    expect(screen.queryByText('Exit sign')).toBeNull();
  });

  it('a tap while placing reports a spot on the plan', () => {
    const onMapClick = vi.fn();
    render(<StoreMapView doc={planDoc()} layers={layers} pins={[]} visibleLayerIds={new Set()} placing onMapClick={onMapClick} />);
    expect(screen.getByText('Tap the map where it goes')).toBeTruthy();
    const svg = screen.getByRole('img', { name: 'Store map' }) as unknown as SVGSVGElement;
    // jsdom has no layout; give the map an identity transform so a tap lands on plan inches.
    const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    (svg as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({ ...identity, inverse: () => identity });
    fireEvent.click(svg, { clientX: 120, clientY: 80 });
    expect(onMapClick).toHaveBeenCalledWith({ x: 120, y: 80 });
  });
});
