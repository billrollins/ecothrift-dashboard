import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import ErrorOutline from '@mui/icons-material/ErrorOutline';
import Refresh from '@mui/icons-material/Refresh';
import { reportScreenError } from '../../api/core.api';
import { APP_VERSION } from '../../utils/appVersion';

/**
 * A deploy replaces the app's files; a tab opened before it still asks for the old page chunks and gets
 * "Failed to fetch dynamically imported module" (Chrome, Edge), "error loading dynamically imported module"
 * (Firefox) or "Importing a module script failed" (Safari). Vite's own preload failure says "Unable to preload CSS".
 */
const NEW_VERSION_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i;

export function isNewVersionError(error: unknown): boolean {
  if (!error) return false;
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return NEW_VERSION_PATTERN.test(text);
}

function reload() {
  window.location.reload();
}

export interface CrashScreenProps {
  newVersion: boolean;
  /** `screen` fills the window (outside the layout); `page` sits inside the layout, sidebar still there. */
  variant?: 'screen' | 'page';
}

export function CrashScreen({ newVersion, variant = 'screen' }: CrashScreenProps) {
  return (
    <Box
      role="alert"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 2,
        px: 3,
        minHeight: variant === 'screen' ? '100vh' : '60vh',
      }}
    >
      {newVersion ? (
        <Refresh sx={{ fontSize: 56, color: 'primary.main' }} />
      ) : (
        <ErrorOutline sx={{ fontSize: 56, color: 'error.main' }} />
      )}
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        {newVersion ? 'A new version of Dash is ready' : 'Something went wrong'}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 420 }}>
        {newVersion
          ? 'Dash was updated while this page was open. Reload to keep going.'
          : 'This screen hit an error. Reload to keep going.'}
      </Typography>
      <Button variant="contained" size="large" startIcon={<Refresh />} onClick={reload} sx={{ minWidth: 180, minHeight: 48 }}>
        Reload
      </Button>
    </Box>
  );
}

interface Props {
  children: ReactNode;
  variant?: 'screen' | 'page';
  /** When it changes (the page's path), a caught error is cleared so the next page renders. */
  resetKey?: string;
}

interface State {
  error: unknown;
  newVersion: boolean;
}

/**
 * The safety net (critic review 2026-10-21, point 8): a crash shows "Something went wrong" with Reload instead of a
 * blank page, and is sent to the owner's error alerts; a deploy that replaced the app's files shows "A new version of
 * Dash is ready" with Reload (not sent: it is expected after every deploy).
 *
 * The `screen` boundary wraps the whole app and also listens for Vite's `vite:preloadError`, which fires when a
 * page chunk's files are gone even if nothing renders the error. The `page` boundary sits around the layout's page
 * area, so the sidebar stays and moving to another page (`resetKey`) clears it.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, newVersion: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error ?? new Error('Unknown error'), newVersion: isNewVersionError(error) };
  }

  componentDidMount() {
    if (this.props.variant !== 'page') window.addEventListener('vite:preloadError', this.onPreloadError);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && !this.state.newVersion && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, newVersion: false });
    }
  }

  componentWillUnmount() {
    window.removeEventListener('vite:preloadError', this.onPreloadError);
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isNewVersionError(error)) return;
    const err = error instanceof Error ? error : new Error(String(error));
    reportScreenError({
      message: `${err.name}: ${err.message}`,
      stack: err.stack ?? '',
      component_stack: info.componentStack ?? '',
      path: window.location.pathname,
      version: APP_VERSION.replace(/^v/, ''),
    }).catch(() => {
      /* the screen already says what to do; a failed report must not throw again */
    });
  }

  private onPreloadError = (event: Event) => {
    event.preventDefault();
    this.setState({ error: (event as Event & { payload?: unknown }).payload ?? event, newVersion: true });
  };

  render() {
    if (this.state.error) return <CrashScreen newVersion={this.state.newVersion} variant={this.props.variant} />;
    return this.props.children;
  }
}
