import { startUpdateChecks } from './sync/update'
import { openDeepLink } from './sync/deeplink'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startClocks } from './store/clock'
import { uiStore } from './store/ui'
import { startSync } from './sync/engine'
import { startAuth } from './auth/session'

document.documentElement.dataset.theme = uiStore.get().theme
startClocks()
startSync()
startUpdateChecks()
void startAuth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // notificação tocada com o app aberto: o service worker manda o destino (o iOS não deixa ele navegar a janela)
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ type?: string; url?: string }>) => {
    if (e.data?.type === 'OPEN_URL' && typeof e.data.url === 'string') openDeepLink(e.data.url)
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* sem SW: o app segue funcionando online e com dados locais */
    })
  })
}
