/**
 * The two scanner modules the phone ENTRY needs (main.tsx), and nothing else, so the entry chunk stays small:
 * - the translate guard (Dash Update #80: Chrome Translate must not crash React on the code step), installed before
 *   React renders;
 * - the install prompt (`installApp.ts` keeps Android's `beforeinstallprompt` from the first moment, so the
 *   "Put Thrift+ on your home screen" card can offer Install later, whichever page it is on).
 * Both are imported unchanged from the staff build's sources (see ./index.ts).
 */
export { installTranslateGuard } from '../../../../../frontend/src/utils/translateGuard'
export { canInstall, installPrompt, isStandalone } from '../../../../../frontend/src/pages/thriftplus/scanner/installApp'
