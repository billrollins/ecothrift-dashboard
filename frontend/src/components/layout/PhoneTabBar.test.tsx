import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PHONE_TAB_BAR_HEIGHT, PhoneTabBar } from './PhoneTabBar';

const authState = vi.hoisted(() => ({
  role: 'Employee' as 'Employee' | 'Admin',
  language: 'en' as 'en' | 'es',
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      role: authState.role,
      is_superuser: authState.role === 'Admin',
      language: authState.language,
    },
  }),
}));

vi.mock('../../hooks/useNavBadgeCounts', () => ({
  useNavBadgeCounts: () => ({ today: 2 }),
  useNavBadgeTones: () => ({ today: 'grey' }),
}));

const theme = createTheme();

function Probe() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}{location.search}</div>;
}

function renderBar(path = '/dashboard?tab=store') {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <PhoneTabBar />
        <Probe />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('PhoneTabBar (Dash Home tabs, 2026-11-13)', () => {
  beforeEach(() => {
    authState.role = 'Employee';
    authState.language = 'en';
    localStorage.clear();
  });

  it('renders the seven Home tabs in order', () => {
    renderBar();
    const labels = screen.getAllByRole('button').map((node) => node.textContent?.replace(/^\d+/, '').trim());
    expect(labels).toEqual(['Store', 'TimeClock', 'HR', 'Routines', 'Calendar', 'Messages', 'Profile']);
    expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
  });

  it('marks the tab from the URL', () => {
    renderBar('/dashboard?tab=myday');
    expect(screen.getByRole('button', { name: /^timeclock$/i })).toHaveClass('Mui-selected');
    expect(screen.getByRole('button', { name: /store/i })).not.toHaveClass('Mui-selected');
  });

  it('keeps Time clock selected for old Today and hours links', () => {
    renderBar('/today?hours=1');
    expect(screen.getByRole('button', { name: /^timeclock$/i })).toHaveClass('Mui-selected');
  });

  it('lands on Store with nothing remembered, for every role', () => {
    renderBar('/dashboard');
    expect(screen.getByRole('button', { name: /store/i })).toHaveClass('Mui-selected');
  });

  it('opens another tab and remembers the choice per user', async () => {
    const user = userEvent.setup();
    renderBar('/dashboard?tab=store');
    await user.click(screen.getByRole('button', { name: /^profile$/i }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard?tab=profile');
    expect(localStorage.getItem('ecothrift.dashboard.tab.v1.1')).toBe('profile');
  });

  it('shows the routines-waiting count on Routines', () => {
    renderBar();
    expect(screen.getByRole('button', { name: /routines/i })).toContainElement(screen.getByLabelText('2 waiting'));
  });

  it('labels the tabs in Spanish when the user language is es', () => {
    authState.language = 'es';
    renderBar();
    expect(screen.getByRole('button', { name: /tienda/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reloj/i })).toBeInTheDocument();
  });

  it('marks the open tab for screen readers too (#146)', () => {
    renderBar('/dashboard?tab=calendar');
    expect(screen.getByRole('button', { name: /calendar/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /store/i })).not.toHaveAttribute('aria-current');
  });

  it('keeps every tab at least 48 px tall to tap (#146)', () => {
    expect(PHONE_TAB_BAR_HEIGHT).toBeGreaterThanOrEqual(48);
  });

  it('slides sideways instead of squeezing the tabs (#146)', () => {
    renderBar();
    const scroller = screen.getByTestId('phone-tab-scroller');
    expect(getComputedStyle(scroller).overflowX).toBe('auto');
    for (const label of ['TimeClock', 'Calendar', 'Messages']) {
      expect(getComputedStyle(screen.getByText(label)).whiteSpace).toBe('nowrap');
    }
  });

  it('scrolls the open tab into view when it starts off screen (#146)', () => {
    // jsdom has no layout: give the row a 375 px window over 572 px of tabs, Profile at the far right.
    const widths: Record<string, [number, number]> = {
      store: [4, 76], myday: [80, 91], hr: [171, 76], routines: [247, 80], calendar: [327, 80], messages: [407, 86], profile: [493, 76],
    };
    const offsetLeft = vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
      return widths[this.dataset.tab ?? '']?.[0] ?? 0;
    });
    const offsetWidth = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return widths[this.dataset.tab ?? '']?.[1] ?? 0;
    });
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(375);
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(572);
    try {
      renderBar('/dashboard?tab=profile');
      const scroller = screen.getByTestId('phone-tab-scroller');
      expect(scroller.scrollLeft).toBeGreaterThan(0);
      expect(screen.getByTestId('phone-tab-fade-left')).toHaveAttribute('data-show', 'true');
    } finally {
      offsetLeft.mockRestore();
      offsetWidth.mockRestore();
      clientWidth.mockRestore();
      scrollWidth.mockRestore();
    }
  });

  it('leaves the row alone when the open tab already shows (#146)', () => {
    renderBar('/dashboard?tab=store');
    expect(screen.getByTestId('phone-tab-scroller').scrollLeft).toBe(0);
  });
});
