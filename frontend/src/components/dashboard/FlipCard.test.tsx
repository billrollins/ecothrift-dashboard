import { ThemeProvider, createTheme } from '@mui/material/styles';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlipCard } from './FlipCard';

type Frames = Keyframe[];

/** A stand-in for Element.animate (jsdom has none) whose finish we control. */
function fakeAnimate() {
  const calls: Frames[] = [];
  const finishers: Array<() => void> = [];
  const animate = vi.fn(function animate(this: Element, frames: Frames) {
    calls.push(frames);
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    finishers.push(() => finish());
    return { finished, cancel: vi.fn() } as unknown as Animation;
  });
  Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true, writable: true });
  return { calls, finishers };
}

function renderCard() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <FlipCard
        name="Buying"
        front={(button) => <div>Front side {button}</div>}
        back={(button) => <div>Back side {button}</div>}
      />
    </ThemeProvider>,
  );
}

afterEach(() => {
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
  vi.useRealTimers();
});

describe('FlipCard turn', () => {
  it('only ever squeezes the card inside its own box (owner 2026-10-22: the 3D turn grew it and moved the page)', async () => {
    const { calls, finishers } = fakeAnimate();
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Show past weeks: Buying' }));
    // First half: still the front, squeezing.
    expect(screen.getByRole('button', { name: 'Show past weeks: Buying' })).toBeInTheDocument();
    await act(async () => finishers[0]());
    // Turned over: the back shows, with focus on its button; the second half opens it again.
    expect(screen.getByRole('button', { name: 'Show this week: Buying' })).toHaveFocus();
    expect(calls).toHaveLength(2);
    for (const frame of calls.flat()) {
      const match = /^scaleX\(([\d.]+)\)$/.exec(String(frame.transform));
      expect(match, `transform ${String(frame.transform)}`).not.toBeNull();
      expect(Number(match?.[1])).toBeLessThanOrEqual(1);
    }
  });

  it('still turns when the animation clock stalls', () => {
    vi.useFakeTimers();
    fakeAnimate(); // never finishes
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Show past weeks: Buying' }));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole('button', { name: 'Show this week: Buying' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Show past weeks: Buying' })).not.toBeInTheDocument();
  });

  it('ignores a second tap while it is turning', async () => {
    const { calls, finishers } = fakeAnimate();
    renderCard();
    const button = screen.getByRole('button', { name: 'Show past weeks: Buying' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(calls).toHaveLength(1);
    await act(async () => finishers[0]());
    expect(screen.getByRole('button', { name: 'Show this week: Buying' })).toBeInTheDocument();
  });
});
