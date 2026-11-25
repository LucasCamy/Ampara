/**
 * Sentido dos textos (ADR-0012): o EmbeddingGemma da IA local transforma cada texto num vetor; textos com o mesmo
 * assunto ficam perto. Cada vetor é calculado uma vez e fica só na memória do app aberto (nada em disco, nada
 * sincronizado). Sem a IA local, tudo devolve null e o app usa a busca por palavras.
 */
import { SENSE_MIN } from '../domain/ideas'
import { LOCAL_AI_URL, localReady } from './provider'

export const SENSE_MODEL = 'ampara-sentido'
/** Calibrado em português: mesmo assunto ~0,45+, outro ~0,3. */
export { SENSE_MIN }
const TIMEOUT_MS = 8000
const BATCH = 64

export type SenseKind = 'query' | 'doc'
type Embed = (texts: string[]) => Promise<number[][] | null>

const prefix = (kind: SenseKind, text: string) => (kind === 'query' ? 'task: search result | query: ' : 'title: none | text: ') + text

/** Chamada ao LM Studio (formato OpenAI). */
export function localEmbed(url = LOCAL_AI_URL, fetchImpl: typeof fetch = (...a) => fetch(...a)): Embed | null {
  if (!url) return null
  return async (texts) => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetchImpl(`${url}/v1/embeddings`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: SENSE_MODEL, input: texts }),
      })
      if (!res.ok) return null
      const body = await res.json() as { data?: { embedding?: number[] }[] }
      const out = (body.data ?? []).map((d) => d.embedding ?? [])
      return out.length === texts.length && out.every((v) => v.length > 0) ? out : null
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

const memory = new Map<string, Float32Array>()
export function forgetSense() { memory.clear() }

function normalize(v: number[]): Float32Array {
  let n = 0
  for (const x of v) n += x * x
  const len = Math.sqrt(n) || 1
  return Float32Array.from(v, (x) => x / len)
}
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i]! * b[i]!
  return s
}

/** Vetores dos textos, usando a memória; null se a IA local não respondeu. */
export async function vectorsOf(texts: string[], kind: SenseKind, embed: Embed): Promise<Float32Array[] | null> {
  const keys = texts.map((t) => kind + '\u0000' + t)
  const missing = [...new Set(keys.filter((k) => !memory.has(k)))]
  for (let i = 0; i < missing.length; i += BATCH) {
    const part = missing.slice(i, i + BATCH)
    const got = await embed(part.map((k) => prefix(kind, k.slice(k.indexOf('\u0000') + 1))))
    if (!got) return null
    part.forEach((k, j) => memory.set(k, normalize(got[j]!)))
  }
  return keys.map((k) => memory.get(k)!)
}

export interface SenseOptions {
  embed?: Embed | null
  ready?: () => Promise<boolean>
}

/**
 * Parecença (0 a 1) entre a consulta e cada item. null quando não há IA local (o app usa só as palavras).
 * Os textos longos são cortados: o começo basta para o assunto.
 */
export async function senseScores(query: string, items: { id: string; text: string }[], opts: SenseOptions = {}): Promise<Map<string, number> | null> {
  const embed = opts.embed === undefined ? localEmbed() : opts.embed
  if (!embed || !query.trim() || !items.length) return null
  const ready = opts.ready ?? localReady()
  if (!(await ready().catch(() => false))) return null
  const q = await vectorsOf([query.slice(0, 1500)], 'query', embed)
  if (!q) return null
  const docs = await vectorsOf(items.map((i) => i.text.slice(0, 1500)), 'doc', embed)
  if (!docs) return null
  return new Map(items.map((it, i) => [it.id, dot(q[0]!, docs[i]!)]))
}
