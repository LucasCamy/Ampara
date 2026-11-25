/**
 * Conversas da barra do PC (ADR-0013). Privadas de quem conversou (viewer), guardadas no cofre e sincronizadas
 * como o resto de Ideias. A IA só responde texto; "Extrair" cria uma captura e o organizador de sempre decide
 * o que vira ideia, decisão ou passo (ADR-0001: nada vira tarefa sozinho).
 */
import { currentProvider, type AiProvider } from '../ai/provider'
import { CHAT_SCHEMA, CHAT_SYSTEM, chatInput, conversationTitle, parseChatReply, transcriptForCapture } from '../domain/ideaConversations'
import { CONVERSATION_LIMITS, type IdeaConversation } from '../domain/ideas'
import { normalizeSpaces } from '../domain/ideasValidate'
import { uuid } from '../domain/seed'
import type { DataState, PartnerId } from '../domain/types'
import { dataStore, transact } from './data'
import { captureThought } from './ideaActions'
import { uiStore } from './ui'

const nowIso = () => new Date().toISOString()
const viewer = (): PartnerId => uiStore.get().viewer

/** Conversas da pessoa, da mais recente para a mais antiga. */
export function myConversations(state: Pick<DataState, 'ideaConversations'>, owner: PartnerId): IdeaConversation[] {
  return Object.values(state.ideaConversations ?? {}).filter((c) => c.ownerId === owner).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Falha depois da fala já estar guardada: leva o id para a tela mostrar a conversa mesmo assim. */
export class SendError extends Error {
  constructor(message: string, readonly conversationId: string, options?: ErrorOptions) {
    super(message, options)
  }
}

function put(conv: IdeaConversation) {
  transact((tx) => tx.put('ideaConversations', conv))
}

/**
 * Manda uma fala da pessoa: grava na hora (nada se perde se a IA falhar), pede a resposta e grava também.
 * Devolve o id da conversa. Se a IA falhar, a fala da pessoa continua guardada e o erro sobe para a tela.
 */
export async function sendMessage(conversationId: string | null, text: string, provider: AiProvider | null = currentProvider()): Promise<string> {
  const clean = normalizeSpaces(text).slice(0, CONVERSATION_LIMITS.messageMaxChars)
  if (!clean) throw new Error('Escreva o que você quer conversar.')
  const owner = viewer()
  const iso = nowIso()
  const current = conversationId ? dataStore.get().ideaConversations[conversationId] : undefined
  if (conversationId && (!current || current.ownerId !== owner)) throw new Error('Esta conversa não existe mais.')
  if (current && current.messages.length >= CONVERSATION_LIMITS.messages) throw new Error('Esta conversa ficou longa. Extraia o que importa e comece outra.')
  const base: IdeaConversation = current ?? { id: uuid(), ownerId: owner, title: '', messages: [], extractedCaptureId: null, createdAt: iso, updatedAt: iso }
  const withPerson: IdeaConversation = { ...base, messages: [...base.messages, { role: 'PESSOA', text: clean }], updatedAt: iso }
  withPerson.title = withPerson.title || conversationTitle(withPerson.messages)
  put(withPerson)
  if (!provider) throw new SendError('Sem IA neste aparelho. Sua fala ficou guardada.', withPerson.id)
  let reply: string | null
  try {
    const r = await provider.runStructured({ system: CHAT_SYSTEM, schema: CHAT_SCHEMA, input: chatInput(withPerson.messages) })
    reply = parseChatReply(r.json)
  } catch (e) {
    throw new SendError(`${e instanceof Error ? e.message : 'A IA não respondeu.'} Sua fala ficou guardada.`, withPerson.id, { cause: e })
  }
  if (!reply) throw new SendError('A IA não respondeu no formato combinado. Sua fala ficou guardada.', withPerson.id)
  // escreve sobre o estado atual: a pessoa pode ter mandado outra fala enquanto a IA pensava
  const latest = dataStore.get().ideaConversations[withPerson.id] ?? withPerson
  put({ ...latest, messages: [...latest.messages, { role: 'IA', text: reply }], updatedAt: nowIso() })
  return withPerson.id
}

/** Extrair: transforma a conversa numa captura (quem organiza por trás é quem chama, como em qualquer captura). */
export function extractConversation(conversationId: string): { captureId: string; text: string } {
  const conv = dataStore.get().ideaConversations[conversationId]
  if (!conv || conv.ownerId !== viewer()) throw new Error('Esta conversa não existe mais.')
  if (!conv.messages.some((m) => m.role === 'PESSOA')) throw new Error('Esta conversa está vazia.')
  const text = transcriptForCapture(conv.messages)
  const captureId = captureThought(text, 'TEXTO', conv.ownerId)
  if (!captureId) throw new Error('Esta conversa está vazia.')
  const latest = dataStore.get().ideaConversations[conversationId] ?? conv
  put({ ...latest, extractedCaptureId: captureId, updatedAt: nowIso() })
  return { captureId, text }
}

/** Apaga a conversa (a captura extraída e as ideias ficam). Desfazer regrava com data nova. */
export function deleteConversation(conversationId: string): (() => void) | null {
  const conv = dataStore.get().ideaConversations[conversationId]
  if (!conv || conv.ownerId !== viewer()) return null
  transact((tx) => tx.remove('ideaConversations', conversationId))
  return () => put({ ...conv, updatedAt: nowIso() })
}
