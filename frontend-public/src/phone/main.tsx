/**
 * The phone site's entry (phone.html; served by apps/core/middleware.py on phones for the paths it owns, PLAN.md).
 * Lean on purpose: React, the router and the kit. No providers of the current site, no API call before the first paint
 * (the home feed is stamped in the page), no network font (Archivo is bundled and preloaded).
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { bootNow } from './lib/boot'
import { applyDay, dayOf } from './lib/day'
import { installTranslateGuard } from './scan/core/entry'
import './kit.css'
import './shell/shell.css'

// Before React renders: a page translator (Chrome Translate) must never crash it (Dash Update #80). Importing
// scan/core/entry also starts the install-prompt listener, so Android's Install offer is kept from the first moment.
installTranslateGuard()

// The day first, so a Black Friday page paints in its own colours from the first frame.
applyDay(dayOf(bootNow()))

/**
 * Wait for the headline face only while it is still on its way, and never longer than 150 ms: the preload has had the
 * whole download of the script to arrive, and painting once in the right face beats painting twice (the narrow
 * headlines would re-flow when the font swapped in).
 */
function fontReady(maxMs: number): Promise<unknown> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  if (!fonts || fonts.check('900 16px Archivo')) return Promise.resolve()
  return Promise.race([fonts.load('900 16px Archivo').catch(() => undefined), new Promise((r) => window.setTimeout(r, maxMs))])
}

const root = createRoot(document.getElementById('root')!)
void fontReady(150).then(() =>
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  ),
)
