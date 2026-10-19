/** The release this build is, e.g. "v2.182.5" (owner 2026-10-19: the version on both apps' splash screens, muted). */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? `v${__APP_VERSION__}` : '';
