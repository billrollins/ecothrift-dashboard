import { isValidElement } from 'react';
import IconButton from '@mui/material/IconButton';
import Close from '@mui/icons-material/Close';
import {
  closeSnackbar,
  SnackbarProvider,
  type OptionsObject,
  type ProviderContext,
  type SnackbarKey,
  type SnackbarMessage,
  type SnackbarProviderProps,
} from 'notistack';

/**
 * Error toasts stay until dismissed (critic review 2026-10-21, point 8: a missed "payment failed").
 * Success, info and warning toasts still fade. A caller that sets its own `persist` or `autoHideDuration`
 * keeps it. Identical errors on screen are not stacked again.
 */
export function stickyErrorOptions(
  options: OptionsObject | undefined,
  close: (key: SnackbarKey) => void = closeSnackbar,
): OptionsObject | undefined {
  if (options?.variant !== 'error') return options;
  if (options.persist !== undefined || options.autoHideDuration !== undefined) return options;
  return {
    preventDuplicate: true,
    action: (key: SnackbarKey) => (
      <IconButton size="small" color="inherit" aria-label="Dismiss" onClick={() => close(key)}>
        <Close fontSize="small" />
      </IconButton>
    ),
    ...options,
    persist: true,
  };
}

/** notistack's provider with sticky errors. Every `useSnackbar()` under it gets the wrapped `enqueueSnackbar`. */
export class AppSnackbarProvider extends SnackbarProvider {
  constructor(props: SnackbarProviderProps) {
    super(props);
    const base = this.enqueueSnackbar;
    const context = (this.state as { contextValue: ProviderContext }).contextValue;
    const close = (key: SnackbarKey) => context.closeSnackbar(key);
    // Same test notistack uses: a string or an element is the message, anything else is the options object.
    const wrapped = ((messageOrOptions: unknown, options?: OptionsObject) => {
      if (typeof messageOrOptions === 'string' || isValidElement(messageOrOptions)) {
        return base(messageOrOptions, stickyErrorOptions(options, close));
      }
      return base(stickyErrorOptions(messageOrOptions as OptionsObject, close) as OptionsObject & { message?: SnackbarMessage });
    }) as ProviderContext['enqueueSnackbar'];
    this.enqueueSnackbar = wrapped;
    // The context value was built in the base constructor; point it at the wrapper before the first render.
    context.enqueueSnackbar = wrapped;
  }
}
