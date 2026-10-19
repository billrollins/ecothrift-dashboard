/// <reference types="vite/client" />

/** The release version, from the repo's package.json at build time (vite.config.ts). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_DEV_LOG?: string;
}
