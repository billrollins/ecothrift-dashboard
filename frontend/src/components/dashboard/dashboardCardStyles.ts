export const dashboardPalette = {
  backdrop: '#33483a',
  backdropDeep: '#243429',
  surface: '#fffdf7',
  surfaceSoft: '#fbf6ec',
  panelBorder: '#203126',
  muted: '#637066',
  softBorder: 'rgba(57, 75, 61, 0.2)',
  softBorderStrong: 'rgba(57, 75, 61, 0.28)',
  textOnBackdrop: '#f8fbf5',
  green: '#2f7a48',
  greenDark: '#1f5634',
  greenSoft: 'rgba(47, 122, 72, 0.15)',
  greenLine: '#6fbf73',
  gold: '#bd8618',
  goldDark: '#7a540e',
  goldBright: '#f2c94c',
  goldSoft: 'rgba(242, 201, 76, 0.18)',
  blue: '#2f67ad',
  blueSoft: 'rgba(47, 103, 173, 0.14)',
  teal: '#13776f',
  amber: '#bf7417',
  violet: '#7354b6',
} as const;

/** Dark olive drop shadow for cards floating on evergreen backdrop. */
const DROP_SHADOW = '20, 30, 24';

const raisedCardShadow = [
  'inset 0 1px 0 rgba(255,255,255,0.94)',
  `0 2px 4px rgba(${DROP_SHADOW}, 0.36)`,
  `0 8px 22px rgba(${DROP_SHADOW}, 0.48)`,
  `0 18px 40px rgba(${DROP_SHADOW}, 0.40)`,
].join(', ');



/** Black border for main dashboard panel cards only (Sales chart, Weekly Book). */

export const dashboardPanelBorderSx = {

  border: '1px solid',

  borderColor: dashboardPalette.panelBorder,

} as const;



/** Padding so drop shadows are not clipped by flex/grid parents (theme spacing units). */

export const DASHBOARD_SHADOW_GUTTER = 2.5;



/** Raised / embossed panel styling for dashboard cards on cardboard backdrop. */

export const dashboardCardElevation = 0;



/** Main section panels - black border. */

export const dashboardRaisedCardSx = {

  bgcolor: dashboardPalette.surface,

  ...dashboardPanelBorderSx,

  boxShadow: raisedCardShadow,

} as const;



/** Department cards - soft border, no black. */

export const dashboardRaisedDeptCardSx = {

  bgcolor: dashboardPalette.surface,

  border: '1px solid',

  borderColor: dashboardPalette.softBorder,

  boxShadow: raisedCardShadow,

} as const;



/** Stat pills (Goal, Last, Today) - soft border, no black. */

export const dashboardRaisedStatSx = {

  bgcolor: dashboardPalette.surface,

  border: '1px solid',

  borderColor: dashboardPalette.softBorderStrong,

  boxShadow: [

    'inset 0 1px 0 rgba(255,255,255,0.92)',

    `0 2px 5px rgba(${DROP_SHADOW}, 0.28)`,

    `0 6px 16px rgba(${DROP_SHADOW}, 0.38)`,

  ].join(', '),

} as const;



/** Phone cards - one soft shadow, no hover lift. */
export const dashboardPhoneCardSx = {
  bgcolor: dashboardPalette.surface,
  border: '1px solid',
  borderColor: dashboardPalette.softBorder,
  borderRadius: 4,
  boxShadow: `0 8px 20px rgba(${DROP_SHADOW}, 0.22)`,
} as const;

/** Simple hover lift - shadow moves with the card via transform. */
export const dashboardCardHoverLiftSx = {
  transition: 'transform 0.2s ease',
  '@media (hover: hover)': {
    '&:hover': {
      transform: 'translateY(-4px)',
    },
  },
} as const;

/** Solid left-edge accent - color only, no wash across the card. */

export function dashboardAccentLeftSx(accent: string) {

  return {

    borderLeft: `4px solid ${accent}`,

  } as const;

}


