import { authStore, readGeminiSecret } from '../auth/session'
import { geminiProvider } from './gemini'

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

export type AiChoice = 'auto' | 'local' | 'claude' | 'gemini' | 'off'
const PREF_KEY = 'ampara:ai'

/** Preferência por pessoa neste aparelho. O valor antigo permanece como padrão de migração. */
export function aiChoice(): AiChoice {
  try {
    const who = authStore.get().who
    const personal = who ? localStorage.getItem(PREF_KEY + ':' + who) : null
    if (personal === 'gemini') return personal
    const v = personal ?? localStorage.getItem(PREF_KEY)
    return v === 'local' || v === 'claude' || v === 'off' ? v : 'auto'
  } catch {
    return 'auto'
  }
}
export function setAiChoice(choice: AiChoice) {
  const who = authStore.get().who
  try { localStorage.setItem(who ? PREF_KEY + ':' + who : PREF_KEY, choice) } catch { /* sem armazenamento: fica no automático */ }
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
 * Tenta cada IA na ordem. Uma IA que não responde (PC desligado, sem internet, cota acabada) passa a vez para a
 * próxima. A resposta em si não é julgada aqui: quem confere é o validador.
 */
export interface ChainStep {
  provider: AiProvider
  /** Pergunta rápida antes de chamar (evita esperar o tempo-limite inteiro da IA local com o PC desligado) */
  ready?: () => Promise<boolean>
}
export function fallbackProvider(steps: ChainStep[]): AiProvider | null {
  if (!steps.length) return null
  if (steps.length === 1) return steps[0]!.provider
  return {
    id: 'automatico',
    label: steps.map((s) => s.provider.label).join(', depois '),
    async runStructured(req) {
      let last: unknown = null
      for (const [i, step] of steps.entries()) {
        const isLast = i === steps.length - 1
        if (!isLast && step.ready && !(await step.ready().catch(() => false))) continue
        try {
          return await step.provider.runStructured(req)
        } catch (e) {
          last = e
        }
      }
      throw last instanceof Error ? last : new Error('Nenhuma IA respondeu. O pensamento ficou guardado.')
    },
  }
}

/** Resposta da IA local vale por 1 min: várias chamadas seguidas não perguntam de novo. */
let localCheck: { at: number; ok: boolean } | null = null
export function localReady(url = LOCAL_AI_URL, now = () => Date.now()): () => Promise<boolean> {
  return async () => {
    if (localCheck && now() - localCheck.at < 60_000) return localCheck.ok
    const { ok } = await localAiStatus(url)
    localCheck = { at: now(), ok }
    return ok
  }
}
export function resetLocalCheck() { localCheck = null }

function geminiForChoice(allowed: AiChoice[]): AiProvider | null {
  const { who, geminiReady } = authStore.get()
  if (!who || !geminiReady) return null
  return geminiProvider(() => authStore.get().who === who && allowed.includes(aiChoice()) ? readGeminiSecret() : Promise.resolve(null))
}

/**
 * O provedor deste aparelho, ou null (sem IA: organizar à mão).
 * Automático: IA local (grátis, PC e celular); se ela não responder, o Gemini (se a pessoa guardou a chave);
 * por último, o Claude pela assinatura no app do PC.
 */
export function currentProvider(choice: AiChoice = aiChoice()): AiProvider | null {
  if (choice === 'off') return null
  if (choice === 'gemini') return geminiForChoice(['gemini'])
  const bridge = desktopBridge()
  const local = localProvider()
  const claude = bridge ? claudeProvider(bridge) : null
  if (choice === 'claude') return claude ?? local
  if (choice === 'local') return local ?? claude
  const gemini = geminiForChoice(['auto'])
  const steps: ChainStep[] = []
  if (local) steps.push({ provider: local, ready: localReady() })
  if (gemini) steps.push({ provider: gemini })
  if (claude) steps.push({ provider: claude })
  return fallbackProvider(steps)
}
