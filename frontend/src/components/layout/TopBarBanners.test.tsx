import { ThemeProvider, createTheme } from '@mui/material/styles';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOP_BAR_ROTATE_MS,
  TopBarBannerHost,
  resetTopBarBanners,
  useTopBarBanner,
  type TopBarBanner,
} from './TopBarBanners';
import { TrainingBanner } from '../pos/TrainingRegister';

const VIEW_AS: TopBarBanner = {
  kind: 'view-as',
  text: 'Viewing as Maria K (Processing Associate)',
  detail: 'Signed in as Bill · read only',
  shortText: 'Viewing as Maria K',
  priority: 30,
  tone: 'warning',
};
const TRAINING: TopBarBanner = { kind: 'training', text: 'TRAINING REGISTER', shortText: 'PRACTICE', priority: 20, tone: 'danger' };

function Banner({ banner }: { banner: TopBarBanner | null }) {
  useTopBarBanner(banner);
  return null;
}

function renderHost(...list: TopBarBanner[]) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <TopBarBannerHost />
      {list.map((b) => <Banner key={b.kind} banner={b} />)}
    </ThemeProvider>,
  );
}

const shownKind = () => screen.getByTestId('top-bar-banners').querySelector('[data-kind]')?.getAttribute('data-kind');

describe('Top bar banners (Dash Updates #54)', () => {
  beforeEach(() => resetTopBarBanners());
  afterEach(() => vi.useRealTimers());

  it('shows nothing when no banner is on', () => {
    renderHost();
    expect(getComputedStyle(screen.getByTestId('top-bar-banners')).display).toBe('none');
  });

  it('shows one banner as is, with its action and no dots', () => {
    const onClick = vi.fn();
    renderHost({ ...VIEW_AS, action: { label: 'Back to Bill', shortLabel: 'Back', onClick } });
    const host = screen.getByTestId('top-bar-banners');
    expect(host).toHaveAttribute('aria-live', 'polite');
    expect(host.textContent).toContain('Viewing as Maria K (Processing Associate)');
    expect(host.textContent).toContain('Signed in as Bill · read only');
    expect(screen.queryAllByTestId('top-bar-banner-dot')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('top-bar-banner-action-view-as'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('takes turns when there are several, highest priority first, and pauses on hover', () => {
    vi.useFakeTimers();
    renderHost(TRAINING, VIEW_AS);
    expect(shownKind()).toBe('view-as');
    const dots = screen.getAllByTestId('top-bar-banner-dot');
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveAttribute('aria-label', 'Show banner 1 of 2: Viewing as Maria K');
    expect(dots[0]).toHaveAttribute('aria-current', 'true');

    act(() => vi.advanceTimersByTime(TOP_BAR_ROTATE_MS));
    expect(shownKind()).toBe('training');
    act(() => vi.advanceTimersByTime(TOP_BAR_ROTATE_MS));
    expect(shownKind()).toBe('view-as');

    fireEvent.mouseEnter(screen.getByTestId('top-bar-banners'));
    act(() => vi.advanceTimersByTime(TOP_BAR_ROTATE_MS * 3));
    expect(shownKind()).toBe('view-as');
    fireEvent.mouseLeave(screen.getByTestId('top-bar-banners'));

    fireEvent.click(screen.getAllByTestId('top-bar-banner-dot')[1]);
    expect(shownKind()).toBe('training');
  });

  it('keeps one fixed height whether one banner or several, so nothing moves', () => {
    const one = renderHost(VIEW_AS);
    const heightOne = getComputedStyle(screen.getByTestId('top-bar-banners')).height;
    one.unmount();
    resetTopBarBanners();
    renderHost(VIEW_AS, TRAINING, { ...TRAINING, kind: 'third', priority: 1 });
    const host = screen.getByTestId('top-bar-banners');
    expect(heightOne).toBe('40px');
    expect(getComputedStyle(host).height).toBe(heightOne);
    expect(getComputedStyle(host).overflow).toBe('hidden');
  });

  it('drops a banner when its state ends', () => {
    const view = renderHost(VIEW_AS, TRAINING);
    view.rerender(
      <ThemeProvider theme={createTheme()}>
        <TopBarBannerHost />
        <Banner banner={VIEW_AS} />
        <Banner banner={null} />
      </ThemeProvider>,
    );
    expect(shownKind()).toBe('view-as');
    expect(screen.queryAllByTestId('top-bar-banner-dot')).toHaveLength(0);
  });

  it('moves the training register banner into the top bar when there is one', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <TopBarBannerHost />
        <TrainingBanner />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('training-banner')).toBeNull();
    expect(screen.getByTestId('top-bar-banners').textContent).toContain('TRAINING REGISTER: NOT A REAL SALE');
  });
});
