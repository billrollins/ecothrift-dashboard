/**
 * The live scanner's logic, imported UNCHANGED from the staff build's sources (PLAN-SCANNER.md section 3: cross-import
 * now, move to one home when the old scanner is retired). One place for every scanner piece to import from.
 *
 * Nothing here may be edited for the phone site: these files also run the old scanner at /scan (switch off), the Staff
 * app and the Social studio. `frontend-public/vite.config.ts` dedupes react, react-dom and the two decoder packages, so
 * `useQrCamera` and `screenLock` use the phone site's one React. A staff-side change to these files changes the phone
 * scanner too: the phone scanner's tests run in the `thriftplus` lane (scripts/dev/lean_test.py).
 *
 * Not for the entry chunk: the entry imports only `./entry` (translate guard, install prompt).
 */
export * from '../../../../../frontend/src/api/thriftPlusTypes'
export * from '../../../../../frontend/src/pages/thriftplus/scanner/scannerLogic'
export * from '../../../../../frontend/src/pages/thriftplus/scanner/cameraZoom'
export * from '../../../../../frontend/src/pages/thriftplus/scanner/useQrCamera'
export * from '../../../../../frontend/src/pages/thriftplus/scanner/screenLock'
export * from '../../../../../frontend/src/pages/thriftplus/scanner/installApp'
export * from '../../../../../frontend/src/pages/thriftplus/scanner/receiptClaim'
export * from '../../../../../frontend/src/utils/scanCode'
export * from '../../../../../frontend/src/utils/formatPhone'
export { installTranslateGuard } from '../../../../../frontend/src/utils/translateGuard'
export { compressImageToJpeg, selfieJpeg } from './photo'
