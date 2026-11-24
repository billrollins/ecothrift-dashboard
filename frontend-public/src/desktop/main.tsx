/**
 * The desktop site's entry (desktop.html; Dash Update #211). Served by apps/core/middleware.py to computers when
 * AppSetting `storefront.desktop_site` is on (or the owner's Testing pick asks), never to a phone. Lean like the phone
 * entry: React, the router, the phone kit's tokens and font, this site's layout. The home feed is stamped in the page.
 */
// The base CSS first (the kit's tokens, then this site's layout), so every page's own CSS comes after it and wins.
import '../phone/kit.css'
import './desk.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { deskDayOf } from './lib/day'
import { bootNow } from '../phone/lib/boot'
import { applyDay } from '../phone/lib/day'
import { installTranslateGuard } from '../phone/scan/core/entry'

// A page translator (Chrome Translate) must never crash React (Dash Update #80), on a computer as on a phone.
installTranslateGuard()

// The day first (the server may already have stamped it), so a Black Friday page paints in its own colours at once.
applyDay(deskDayOf(bootNow()))

/** Wait for the headline face only while it is on its way, never longer than 150 ms (as the phone entry does). */
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
