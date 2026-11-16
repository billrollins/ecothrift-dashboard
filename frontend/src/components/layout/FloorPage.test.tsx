import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { FloorPage } from './FloorPage';
import { PhoneShellContext } from './phoneShell';

vi.mock('./FloorNav', () => ({ FloorNav: () => <div data-testid="floor-nav" /> }));

function renderPage(phoneShell: boolean) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <PhoneShellContext.Provider value={phoneShell}>
          <FloorPage title="Calendar" subtitle="Store events">
            <div>body</div>
          </FloorPage>
        </PhoneShellContext.Provider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('FloorPage band (#146)', () => {
  it('draws the desk band with its title and tabs on a desk', () => {
    renderPage(false);
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeInTheDocument();
    expect(screen.getByTestId('floor-nav')).toBeInTheDocument();
  });

  it('drops the band in the phone shell (the top bar has the title, the bottom bar the tabs)', () => {
    renderPage(true);
    expect(screen.queryByRole('heading', { name: 'Calendar' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('floor-nav')).not.toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});
