import { authStore } from '../auth/session'
import { EXTRA, parseDeepLink, type DeepLink } from '../domain/deeplink'
import { ui } from '../store/ui'

/**
 * Abrir o app num lugar certo: notificação, atalho do Android (manifest) ou ?quick= na URL.
 * O service worker manda a URL por mensagem quando o app já está aberto (o iOS não aceita navegar a janela
 * pelo service worker); com o app bloqueado, o destino espera o login.
 */

let pending: DeepLink | null = null

function apply(link: DeepLink) {
  if (link.tab) ui.setTab(link.tab)
  if (link.quick) ui.launchQuick(link.quick, link.params)
}

/** Vem do service worker (notificação) com o app já aberto */
export function openDeepLink(href: string) {
  const link = parseDeepLink(href, location.origin)
  if (!link) return
  if (authStore.get().status === 'unlocked') apply(link)
  else pending = link
}

/** Ao entrar no app: aplica o que veio na URL ou o que esperou o login, e limpa a URL */
export function consumeLaunchLink() {
  const fromUrl = location.search.includes('quick=') ? parseDeepLink(location.href, location.origin) : null
  const link = pending ?? fromUrl
  pending = null
  if (!link) return
  apply(link)
  if (fromUrl) {
    const params = new URLSearchParams(location.search)
    params.delete('quick')
    for (const k of EXTRA) params.delete(k)
    const qs = params.toString()
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`)
  }
}
