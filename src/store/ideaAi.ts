/**
 * Organizar uma captura com IA (ADR-0004/0005): monta o contrato, chama o provedor, passa tudo pelo
 * validador e só então grava (applyOrganization). Qualquer falha deixa a captura na Caixa de entrada.
 */
import { currentProvider, type AiProvider } from '../ai/provider'
import { ORGANIZER_SCHEMA, ORGANIZER_SYSTEM, ORGANIZER_VERSION, buildOrganizerInput, selectCandidates } from '../domain/ideasPrompt'
import { validateOrganization, type ValidationResult } from '../domain/ideasValidate'
import { CONCRETIZE_SCHEMA, CONCRETIZE_SYSTEM, buildConcretizeInput, defaultDraft, parseProposal, type ActionDraft } from '../domain/ideasConcretize'
import type { DateKey } from '../domain/types'
import { ASK_SCHEMA, ASK_SYSTEM, buildAskInput, checkAnswer, searchNotes, type AskFilters, type CheckedAnswer, type FoundNote } from '../domain/ideasAsk'
import { dataStore } from './data'
import { applyOrganization, myIdeaMap } from './ideaActions'
import { uiStore } from './ui'

export interface AiOrganizeResult {
  logId: string
  /** "Saúde › Corrida" das ideias que receberam anotações */
  places: string[]
  inboxCount: number
  rejectedCount: number
}

/** Nada encaixado e houve recusa por formato (ou resposta fora do contrato): vale uma segunda tentativa. */
export function retryWorthy(result: ValidationResult): boolean {
  const placed = result.apply.some((o) => o.kind === 'ANEXAR' || o.kind === 'CRIAR_IDEIA')
  return !placed && (!result.ok || result.rejected.length > 0)
}

const pending = new Set<string>()
export const isOrganizing = (captureId: string) => pending.has(captureId)

export async function organizeWithAi(captureId: string, provider: AiProvider | null = currentProvider()): Promise<AiOrganizeResult> {
  if (!provider) throw new Error('Nenhuma IA ligada neste aparelho. Confira os Ajustes ou organize à mão.')
  if (pending.has(captureId)) throw new Error('Este pensamento já está sendo organizado.')
  const owner = uiStore.get().viewer
  const start = dataStore.get()
  const capture = start.ideaCaptures[captureId]
  if (!capture || capture.ownerId !== owner || capture.status !== 'PENDENTE') throw new Error('Este pensamento já foi organizado.')

  pending.add(captureId)
  try {
    const map = myIdeaMap(start, owner)
    const notes = Object.values(start.ideaNotes).filter((n) => n.ownerId === owner)
    const candidates = selectCandidates(map, notes, capture.text)
    const request = { system: ORGANIZER_SYSTEM, schema: ORGANIZER_SCHEMA, input: buildOrganizerInput(capture.text, { ...map, ideas: candidates }, candidates) }
    let response = await provider.runStructured(request)
    // valida contra o mapa ATUAL (a pessoa pode ter mexido enquanto a IA pensava)
    if (uiStore.get().viewer !== owner) throw new Error('A pessoa usando o app mudou. Nada foi gravado.')
    let result = validateOrganization(capture.text, response.json, myIdeaMap(dataStore.get(), owner))
    // Modelos pequenos às vezes erram o formato: se nada foi encaixado por erro de formato (não por dúvida),
    // tenta mais uma vez. Dúvida de verdade ("CAIXA_DE_ENTRADA" ou confiança baixa) não repete.
    if (retryWorthy(result)) {
      response = await provider.runStructured(request)
      if (uiStore.get().viewer !== owner) throw new Error('A pessoa usando o app mudou. Nada foi gravado.')
      result = validateOrganization(capture.text, response.json, myIdeaMap(dataStore.get(), owner))
    }
    const logId = applyOrganization(captureId, result, { provider: response.provider, model: response.model, promptVersion: ORGANIZER_VERSION })
    if (!logId) throw new Error('Este pensamento já foi organizado.')

    const after = dataStore.get()
    const places = new Set<string>()
    for (const n of Object.values(after.ideaNotes)) {
      if (n.captureId !== captureId || !n.ideaId) continue
      const idea = after.ideas[n.ideaId]
      const topic = idea ? after.ideaTopics[idea.topicId] : undefined
      const area = topic ? after.ideaAreas[topic.areaId] : undefined
      if (area && topic) places.add(`${area.name} › ${topic.name}`)
    }
    return { logId, places: [...places], inboxCount: result.inbox.length, rejectedCount: result.rejected.length }
  } finally {
    pending.delete(captureId)
  }
}

/** Frase curta para o aviso depois de organizar. */
export function describeAiResult(r: AiOrganizeResult): string {
  if (!r.places.length) return 'A IA não teve certeza. Ficou na Caixa de entrada para você decidir.'
  const where = r.places.length === 1 ? r.places[0] : `${r.places.length} lugares`
  return r.inboxCount ? `Organizei em ${where}. Uma parte ficou na Caixa de entrada.` : `Organizei em ${where}.`
}

/**
 * "Isso vai acontecer": a IA sugere UMA forma de ação (tarefa com micro-passos ou compromisso). Só sugere;
 * quem cria é a pessoa, na gaveta. Sem IA ou com resposta fora do combinado, volta a proposta padrão.
 */
export async function suggestAction(ideaId: string, today: DateKey, provider: AiProvider | null = currentProvider()): Promise<ActionDraft> {
  const owner = uiStore.get().viewer
  const state = dataStore.get()
  const idea = state.ideas[ideaId]
  if (!idea || idea.ownerId !== owner) throw new Error('Esta ideia não existe mais.')
  if (!provider) return defaultDraft(idea)
  const notes = Object.values(state.ideaNotes).filter((n) => n.ownerId === owner && n.ideaId === ideaId)
  const r = await provider.runStructured({ system: CONCRETIZE_SYSTEM, schema: CONCRETIZE_SCHEMA, input: buildConcretizeInput(idea, notes, today) })
  return parseProposal(r.json, idea, today)
}

export interface AskResult {
  /** Anotações encontradas pela busca local (aparecem mesmo sem IA) */
  found: FoundNote[]
  filters: AskFilters
  /** Resposta da IA conferida; null sem IA ou quando nada foi encontrado */
  answer: CheckedAnswer | null
}

/**
 * Perguntar às ideias: busca local primeiro; a IA só vê as anotações encontradas e cada frase precisa citar.
 * Nunca grava nada.
 */
export async function askIdeas(question: string, today: DateKey, provider: AiProvider | null = currentProvider()): Promise<AskResult> {
  const q = question.replace(/\s+/g, ' ').trim()
  if (!q) throw new Error('Escreva o que você quer saber.')
  const owner = uiStore.get().viewer
  const state = dataStore.get()
  const { found, filters } = searchNotes(state, owner, q, today)
  if (!provider || !found.length) return { found, filters, answer: null }
  const r = await provider.runStructured({ system: ASK_SYSTEM, schema: ASK_SCHEMA, input: buildAskInput(q, found, today) })
  return { found, filters, answer: checkAnswer(r.json, new Set(found.map((f) => f.note.id))) }
}

