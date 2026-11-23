import type { AiProvider } from './provider'

export const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent'
const REQUEST_TIMEOUT_MS = 60_000

interface GeminiResponse {
  modelVersion?: string
  promptFeedback?: { blockReason?: string }
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]
  error?: { details?: { reason?: string }[] }
}

/** Os validadores do Ampara aplicam os limites de listas. No Gemini, maxItems replica o esquema de cada item. */
function geminiSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema
  const { type, enum: values, items, properties, ...rest } = schema as Record<string, unknown>
  const node = { ...rest }
  delete node.maxItems
  if (properties && typeof properties === 'object') {
    node.properties = Object.fromEntries(Object.entries(properties).map(([name, value]) => [name, geminiSchema(value)]))
  }
  if (items !== undefined) node.items = geminiSchema(items)
  // O Gemini aceita enum de strings ou números, com o null em um ramo separado.
  if (Array.isArray(type) && type.includes('string') && type.includes('null') && Array.isArray(values) && values.includes(null)) {
    node.anyOf = [{ type: 'string', enum: values.filter((value) => value !== null) }, { type: 'null' }]
  } else {
    if (type !== undefined) node.type = type
    if (values !== undefined) node.enum = values
  }
  return node
}

export interface GeminiCredential {
  secret: string
  signal?: AbortSignal
}

export function geminiProvider(
  credential: () => Promise<GeminiCredential | null>,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): AiProvider {
  return {
    id: 'gemini',
    label: 'Gemini 3.1 Flash-Lite',
    async runStructured(req) {
      const access = await credential()
      if (!access || access.signal?.aborted) throw new Error('Desbloqueie o cofre e confira a chave do Gemini em Ajustes.')
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      const signal = access.signal ? AbortSignal.any([access.signal, timeout]) : timeout
      let response: Response
      let body: GeminiResponse | null
      try {
        response = await fetchImpl(GEMINI_URL, {
          method: 'POST',
          signal,
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': access.secret },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: 'user', parts: [{ text: req.input }] }],
            generationConfig: {
              thinkingConfig: { thinkingLevel: 'minimal' },
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
              responseJsonSchema: geminiSchema(req.schema),
            },
          }),
        })
        body = await response.json().catch(() => null) as GeminiResponse | null
      } catch {
        if (access.signal?.aborted) throw new Error('A sessão do Gemini foi encerrada.')
        if (timeout.aborted) throw new Error('O Gemini demorou demais. Tente de novo.')
        throw new Error('Não consegui acessar o Gemini. Confira a conexão e tente de novo.')
      }
      if (access.signal?.aborted) throw new Error('A sessão do Gemini foi encerrada.')
      if (timeout.aborted) throw new Error('O Gemini demorou demais. Tente de novo.')
      if (!response.ok) {
        if (response.status === 429) throw new Error('O Gemini atingiu o limite do projeto. Aguarde e tente de novo.')
        if (response.status >= 500) throw new Error('O Gemini está temporariamente indisponível. Tente de novo mais tarde.')
        if (response.status === 401 || response.status === 403 || body?.error?.details?.some((detail) => detail.reason === 'API_KEY_INVALID')) {
          throw new Error('O Gemini recusou a chave ou o projeto. Confira os dados em Ajustes.')
        }
        throw new Error(`O Gemini devolveu um erro (${response.status}). Tente de novo.`)
      }
      const candidate = body?.candidates?.[0]
      if (body?.promptFeedback?.blockReason || (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason))) {
        throw new Error('O Gemini não pôde responder a esse conteúdo.')
      }
      const text = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? '').join('') ?? ''
      let json: unknown = null
      if (candidate?.finishReason !== 'MAX_TOKENS') {
        try { json = JSON.parse(text) } catch { /* o organizador decide se tenta novamente */ }
      }
      return { json, provider: 'gemini', model: body?.modelVersion ?? GEMINI_MODEL }
    },
  }
}
