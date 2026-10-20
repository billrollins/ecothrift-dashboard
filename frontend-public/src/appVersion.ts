/** The release this build is, e.g. "v2.185.2": small in the footer so staff can tell which version is live (owner 2026-10-20). */
declare const __APP_VERSION__: string

export const APP_VERSION = typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? `v${__APP_VERSION__}` : ''
