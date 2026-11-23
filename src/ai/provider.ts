/**
 * Provedores de IA (ADR-0005): IA local no PC pela rede Tailscale (ADR-0010, grátis, PC e celular) e a
 * assinatura do Claude pelo app do PC (ADR-0008, `window.amparaDesktop`). Mesma interface para os dois.
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
  /** Painel da bolinha (true) ou janela completa (false) */
  onCompact?(cb: (compact: boolean) => void): () => void
  openFull?(): void
  isCompact?(): Promise<boolean>
  /** Abre a digitação por voz do Windows no campo em foco */
  dictate?(): Promise<boolean>
}

declare global {
  interface Window {
    amparaDesktop?: AmparaDesktopBridge
  }
}

export const desktopBridge = (): AmparaDesktopBridge | null => (typeof window !== 'undefined' && window.amparaDesktop ? window.amparaDesktop : null)

/* ---------------------------------------------------------------- IA local (ADR-0010) */

/** Endereço da IA local na rede Tailscale, gravado no build (VITE_LOCAL_AI_URL). Vazio: não existe. */
export const LOCAL_AI_URL = ((import.meta.env.VITE_LOCAL_AI_URL as string | undefined) ?? '').trim().replace(/\/+$/, '')
/** Nome com que o modelo é carregado no servidor (lms load ... --identifier ampara). */
export const LOCAL_AI_MODEL = 'ampara'
const LOCAL_TIMEOUT_MS = 150_000

export type AiChoice = 'auto' | 'local' | 'claude' | 'off'
const PREF_KEY = 'ampara:ai'

/** Escolha da IA neste aparelho (preferência local, não sincroniza). */
export function aiChoice(): AiChoice {
  try {
    const v = localStorage.getItem(PREF_KEY)
    return v === 'local' || v === 'claude' || v === 'off' ? v : 'auto'
  } catch {
    return 'auto'
  }
}
export function setAiChoice(choice: AiChoice) {
  try { localStorage.setItem(PREF_KEY, choice) } catch { /* sem armazenamento: fica no automático */ }
}

/** Chamada no formato OpenAI (LM Studio): esquema JSON obrigatório na resposta. */
export function localProvider(url = LOCAL_AI_URL, fetchImpl: typeof fetch = (...a) => fetch(...a)): AiProvider | null {
  if (!url) return null
  return {
    id: 'ia-local',
    label: 'IA local no seu PC (grátis)',
    async runStructured(req) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), LOCAL_TIMEOUT_MS)
      let res: Response
      try {
        res = await fetchImpl(`${url}/v1/chat/completions`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: LOCAL_AI_MODEL,
            temperature: 0.2,
            max_tokens: 3000,
            messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.input }],
            response_format: { type: 'json_schema', json_schema: { name: 'resposta', strict: true, schema: req.schema } },
          }),
        })
      } catch (e) {
        throw new Error(ctrl.signal.aborted
          ? 'A IA local demorou demais. Tente de novo.'
          : 'A IA local não respondeu. O PC está ligado e o Tailscale conectado neste aparelho?', { cause: e })
      } finally {
        clearTimeout(timer)
      }
      if (!res.ok) throw new Error(`A IA local deu erro (${res.status}). O modelo está carregado no PC?`)
      const body = await res.json() as { model?: string; choices?: { message?: { content?: string } }[] }
      const text = body.choices?.[0]?.message?.content ?? ''
      let json: unknown
      try { json = JSON.parse(text) } catch { json = null }
      return { json, provider: 'ia-local', model: body.model ?? LOCAL_AI_MODEL }
    },
  }
}

/** A IA local responde? (lista de modelos, sem custo). */
export async function localAiStatus(url = LOCAL_AI_URL): Promise<{ ok: boolean; models: string[] }> {
  if (!url) return { ok: false, models: [] }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(`${url}/v1/models`, { signal: ctrl.signal })
    const body = await res.json() as { data?: { id: string }[] }
    return { ok: res.ok, models: (body.data ?? []).map((m) => m.id) }
  } catch {
    return { ok: false, models: [] }
  } finally {
    clearTimeout(timer)
  }
}

function claudeProvider(bridge: AmparaDesktopBridge): AiProvider {
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

/**
 * O provedor deste aparelho, ou null (sem IA: organizar à mão).
 * Automático: IA local quando configurada (grátis, PC e celular); senão, Claude pela assinatura no app do PC.
 */
export function currentProvider(choice: AiChoice = aiChoice()): AiProvider | null {
  if (choice === 'off') return null
  const bridge = desktopBridge()
  const local = localProvider()
  if (choice === 'claude') return bridge ? claudeProvider(bridge) : local
  if (choice === 'local') return local ?? (bridge ? claudeProvider(bridge) : null)
  return local ?? (bridge ? claudeProvider(bridge) : null)
}
