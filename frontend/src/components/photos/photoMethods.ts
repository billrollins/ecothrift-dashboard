import useMediaQuery from '@mui/material/useMediaQuery';

/** The three ways to add a photo (Bill, 2026-11-10: "ALL upload photos the same, with these 3 methods"). */
export type PhotoMethod = 'take' | 'drawer' | 'files';

/** On a phone the camera is in your hand, so it leads. */
export const PHONE_PHOTO_METHODS: readonly PhotoMethod[] = ['take', 'drawer', 'files'];
/** On a computer the photo is usually already in the drawer (taken on the phone), so the drawer leads. */
export const COMPUTER_PHOTO_METHODS: readonly PhotoMethod[] = ['drawer', 'files', 'take'];

export function photoMethodOrder(isPhone: boolean): readonly PhotoMethod[] {
  return isPhone ? PHONE_PHOTO_METHODS : COMPUTER_PHOTO_METHODS;
}

/** A touch device with no mouse: a phone or a tablet, however wide. */
export const TOUCH_ONLY_QUERY = '(hover: none) and (pointer: coarse)';
/** The real window under 900 px, the width where Dash turns into its phone layout. */
export const NARROW_WINDOW_QUERY = '(max-width:899.95px)';

/**
 * Phone or computer, for the Add photo order and for how Take photo works (the phone's own camera, or a webcam
 * window). A phone is a narrow window or any touch-only device.
 *
 * It asks the real window, not the theme: a phone-first page shown inside the desk's phone frame is still on a
 * computer, and there the drawer leads.
 */
export function useIsPhoneDevice(): boolean {
  const narrow = useMediaQuery(NARROW_WINDOW_QUERY);
  const touchOnly = useMediaQuery(TOUCH_ONLY_QUERY);
  return narrow || touchOnly;
}
