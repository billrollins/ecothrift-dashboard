import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary, isNewVersionError } from './AppErrorBoundary';

const api = vi.hoisted(() => ({ reportScreenError: vi.fn() }));
vi.mock('../../api/core.api', () => api);

function Boom({ error }: { error: Error }): never {
  throw error;
}

describe('isNewVersionError', () => {
  it("knows each browser's missing-chunk message", () => {
    expect(isNewVersionError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Page-abc.js'))).toBe(true);
    expect(isNewVersionError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isNewVersionError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isNewVersionError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
    expect(isNewVersionError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isNewVersionError(null)).toBe(false);
  });
});

describe('AppErrorBoundary', () => {
  // React re-throws caught render errors to window in development; keep jsdom from printing them.
  const swallow = (event: ErrorEvent) => event.preventDefault();
  beforeEach(() => {
    api.reportScreenError.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.addEventListener('error', swallow);
  });
  afterEach(() => {
    window.removeEventListener('error', swallow);
    vi.restoreAllMocks();
  });

  it('shows Something went wrong with Reload and reports the crash', () => {
    render(
      <AppErrorBoundary>
        <Boom error={new TypeError('x is undefined')} />
      </AppErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(api.reportScreenError).toHaveBeenCalledTimes(1);
    expect(api.reportScreenError.mock.calls[0][0]).toMatchObject({ message: 'TypeError: x is undefined', path: '/' });
  });

  it('a missing chunk after a deploy shows the new-version screen and is not reported', () => {
    render(
      <AppErrorBoundary>
        <Boom error={new TypeError('Failed to fetch dynamically imported module: /assets/TerminalPage-1.js')} />
      </AppErrorBoundary>,
    );
    expect(screen.getByText('A new version of Dash is ready')).toBeInTheDocument();
    expect(api.reportScreenError).not.toHaveBeenCalled();
  });

  it("Vite's preload error switches to the new-version screen", () => {
    render(
      <AppErrorBoundary>
        <p>Terminal</p>
      </AppErrorBoundary>,
    );
    act(() => {
      window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    });
    expect(screen.getByText('A new version of Dash is ready')).toBeInTheDocument();
  });

  it('the page boundary clears when the path changes', () => {
    const { rerender } = render(
      <AppErrorBoundary variant="page" resetKey="/a">
        <Boom error={new Error('bad page')} />
      </AppErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    rerender(
      <AppErrorBoundary variant="page" resetKey="/b">
        <p>Next page</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('Next page')).toBeInTheDocument();
  });
});
