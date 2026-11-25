/**
 * Conversas da barra do PC (ADR-0013): regras puras. Gravar e chamar a IA ficam em src/store.
 */
import { CONVERSATION_LIMITS, IDEA_LIMITS, type ConversationMessage } from './ideas'
import { normalizeSpaces } from './ideasValidate'

export const CHAT_SYSTEM = `Você é o Ampara, parceiro de conversa de uma pessoa com TDAH e dislexia.
Responda em português do Brasil, com frases curtas e palavras simples.
- No máximo 5 linhas. Sem travessão longo, sem emoji, sem tabelas.
- Termine com UMA pergunta ou UM próximo passo pequeno, nunca vários.
- Não invente fatos sobre a vida da pessoa. Se faltar informação, pergunte uma coisa.
- Você só conversa. Não cria tarefa nem apaga nada: quem guarda é a pessoa, no botão Extrair.
Devolva só o JSON pedido.`

export const CHAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resposta'],
  properties: { resposta: { type: 'string' } },
} as const

/** Título curto: as primeiras palavras da primeira fala da pessoa. */
export function conversationTitle(messages: readonly ConversationMessage[]): string {
  const first = messages.find((m) => m.role === 'PESSOA')?.text ?? 'Conversa'
  const words = normalizeSpaces(first).split(' ').slice(0, 7).join(' ')
  const t = words.charAt(0).toUpperCase() + words.slice(1)
  return t.length > CONVERSATION_LIMITS.titleMaxChars ? `${t.slice(0, CONVERSATION_LIMITS.titleMaxChars - 1)}…` : t || 'Conversa'
}

/** Entrada para a IA responder: a conversa até aqui, uma fala por bloco. */
export function chatInput(messages: readonly ConversationMessage[]): string {
  return messages.slice(-12).map((m) => `${m.role === 'PESSOA' ? 'Pessoa' : 'Ampara'}: ${m.text}`).join('\n\n')
}

/**
 * Texto da conversa para virar captura. Cabe no limite de uma captura: se passar, ficam as falas mais novas,
 * inteiras (nunca corta uma fala ao meio).
 */
export function transcriptForCapture(messages: readonly ConversationMessage[]): string {
  const lines = messages.map((m) => `${m.role === 'PESSOA' ? 'Eu' : 'Ampara'}: ${normalizeSpaces(m.text)}`)
  const kept: string[] = []
  let size = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    const add = lines[i]!.length + 1
    if (size + add > IDEA_LIMITS.captureMaxChars && kept.length) break
    kept.unshift(lines[i]!.slice(0, IDEA_LIMITS.captureMaxChars))
    size += add
  }
  return kept.join(' ')
}

/** Resposta da IA conferida: texto simples, curto, sem nada além do contrato. */
export function parseChatReply(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null
  const r = (json as { resposta?: unknown }).resposta
  if (typeof r !== 'string') return null
  const text = r.replace(/\r/g, '').trim()
  if (!text) return null
  return text.slice(0, CONVERSATION_LIMITS.messageMaxChars)
}
