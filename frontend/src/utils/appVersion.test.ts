import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { LoadingScreen } from '../components/feedback/LoadingScreen';
import { APP_VERSION } from './appVersion';

describe('the app version on the splash screens', () => {
  it('is the repo release from package.json, with a v', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf8')) as { version: string };
    expect(APP_VERSION).toBe(`v${pkg.version}`);
  });

  it('the Staff splash shows it; Dash loading screens do not', () => {
    const { unmount } = render(createElement(LoadingScreen, { message: 'Loading…', version: true }));
    expect(screen.getByTestId('app-version')).toHaveTextContent(APP_VERSION);
    unmount();
    render(createElement(LoadingScreen, { message: 'Loading…' }));
    expect(screen.queryByTestId('app-version')).not.toBeInTheDocument();
  });
});
