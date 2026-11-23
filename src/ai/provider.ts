/**
 * Provedores de IA (ADR-0005). Hoje: a assinatura pelo app do PC (exe do Ampara, ADR-0008), que expõe
 * `window.amparaDesktop`. Chave de API no navegador (ADR-0006) entra depois pela mesma interface.
 */

export interface StructuredRequest {
  /** Instruções do contrato (iguais para todos os provedores) */
  system: string
  /** Esquema JSON da resposta */
  schema: unknown
  /** Captura + mapa compacto (JSON) */
  input: string
}

export interface StructuredResponse {
  json: unknown
  provider: string
  model: string
}

export interface AiProvider {
  id: string
  /** Nome para a pessoa: "Claude pela sua assinatura (PC)" */
  label: string
  runStructured(req: StructuredRequest): Promise<StructuredResponse>
}

/** Ponte que o exe do Ampara injeta (preload). Nada aqui existe no navegador comum. */
export interface AmparaDesktopBridge {
  version: string
  status(): Promise<{ claude: boolean; model: string }>
  runStructured(req: StructuredRequest): Promise<{ json: unknown; model: string }>
  onShortcut?(cb: () => void): () => void
}

declare global {
  interface Window {
    amparaDesktop?: AmparaDesktopBridge
  }
}

export const desktopBridge = (): AmparaDesktopBridge | null => (typeof window !== 'undefined' && window.amparaDesktop ? window.amparaDesktop : null)

/** O provedor disponível neste aparelho, ou null (sem IA: organizar à mão). */
export function currentProvider(): AiProvider | null {
  const bridge = desktopBridge()
  if (!bridge) return null
  return {
    id: 'claude-assinatura',
    label: 'Claude pela sua assinatura (PC)',
    async runStructured(req) {
      try {
        const r = await bridge.runStructured(req)
        return { json: r.json, provider: 'claude-assinatura', model: r.model }
      } catch (e) {
        // erro vindo do processo do PC chega como "Error invoking remote method '...': Error: <mensagem>"
        throw new Error(String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), { cause: e })
      }
    },
  }
}
