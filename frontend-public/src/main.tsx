import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { CartProvider } from './cart'
import { OnlineSalesConfigProvider } from './onlineSalesConfig'
import './styles.css'

// Optional, privacy-friendly analytics — off unless VITE_PLAUSIBLE_DOMAIN is set
// at build time (e.g. `VITE_PLAUSIBLE_DOMAIN=ecothrift.us`). No-op otherwise.
const plausibleDomain = import.meta.env.VITE_PLAUSIBLE_DOMAIN
if (plausibleDomain) {
  const script = document.createElement('script')
  script.defer = true
  script.dataset.domain = plausibleDomain
  script.src = 'https://plausible.io/js/script.js'
  document.head.appendChild(script)
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <OnlineSalesConfigProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </OnlineSalesConfigProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
