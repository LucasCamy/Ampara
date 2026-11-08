import { startUpdateChecks } from './sync/update'
import { openDeepLink } from './sync/deeplink'
import { handlePushMessage, type PushAlertMessage } from './features/alerts/watch'
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
import { applyTheme, uiStore } from './store/ui'
import { startSync } from './sync/engine'
import { startAuth } from './auth/session'

applyTheme(uiStore.get().theme)
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
  // push com o app na frente: a notificação sai calada e o som da categoria toca aqui
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ type?: string; url?: string } | PushAlertMessage>) => {
    if (e.data?.type === 'OPEN_URL' && 'url' in e.data && typeof e.data.url === 'string') openDeepLink(e.data.url)
    if (e.data?.type === 'ALERT') handlePushMessage(e.data as PushAlertMessage)
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* sem SW: o app segue funcionando online e com dados locais */
    })
  })
}
