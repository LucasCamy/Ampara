/**
 * Organizar uma captura com IA (ADR-0004/0005): monta o contrato, chama o provedor, passa tudo pelo
 * validador e só então grava (applyOrganization). Qualquer falha deixa a captura na Caixa de entrada.
 */
import { currentProvider, type AiProvider } from '../ai/provider'
import { ORGANIZER_SCHEMA, ORGANIZER_SYSTEM, ORGANIZER_VERSION, buildOrganizerInput, ideaSenseText, pickExamples, selectCandidates } from '../domain/ideasPrompt'
import { SENSE_MIN, SEQUENCE_WINDOW_MS, focusSense, type IdeaCapture } from '../domain/ideas'
import { senseScores } from '../ai/sense'
import { createStore, useStore } from './createStore'
import { SCHEDULE_SCHEMA, SCHEDULE_SYSTEM, baseProposal, buildScheduleInput, overlaps, parseSchedule, type ScheduleNote, type ScheduleProposal } from '../domain/ideasSchedule'
import { parseWhen } from '../domain/whenParse'
import type { DataState, PartnerId } from '../domain/types'
import { validateOrganization, type ValidationResult } from '../domain/ideasValidate'
import { CONCRETIZE_SCHEMA, CONCRETIZE_SYSTEM, buildConcretizeInput, defaultDraft, parseProposal, type ActionDraft } from '../domain/ideasConcretize'
import type { DateKey } from '../domain/types'
import { ASK_SCHEMA, ASK_SYSTEM, buildAskInput, checkAnswer, searchNotes, searchableNotes, type AskFilters, type CheckedAnswer, type FoundNote } from '../domain/ideasAsk'
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
    // sentido (ADR-0012): ideias e anotações parecidas com a captura; sem IA local, só palavras
    const sense = await senseFor(start, owner, capture.text)
    const candidates = selectCandidates(map, notes, capture.text, undefined, sense)
    const exemplos = pickExamples(notes, keptByPerson(start, owner), sense, new Set(candidates.map((c) => c.id)))
    const contextoAnterior = sequenceBefore(start, capture).map((c) => c.text)
    const request = { system: ORGANIZER_SYSTEM, schema: ORGANIZER_SCHEMA, input: buildOrganizerInput(capture.text, { ...map, ideas: candidates }, candidates, { contextoAnterior, exemplos }) }
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

/** Sentido da captura contra as ideias e anotações da pessoa (ids das duas listas não se cruzam). */
async function senseFor(state: DataState, owner: PartnerId, text: string): Promise<Map<string, number> | null> {
  const notes = Object.values(state.ideaNotes).filter((n) => n.ownerId === owner && n.ideaId)
  const ideas = Object.values(state.ideas).filter((i) => i.ownerId === owner)
  const items = [
    ...ideas.map((i) => ({ id: i.id, text: ideaSenseText(i, notes) })),
    ...notes.map((n) => ({ id: n.id, text: n.text })),
  ]
  return focusSense(await senseScores(text, items).catch(() => null))
}

/** Capturas que a própria pessoa organizou (sem registro da IA valendo): são o "jeito dela". */
function keptByPerson(state: DataState, owner: PartnerId): Set<string> {
  const byAi = new Set(Object.values(state.ideaAiLog).filter((l) => l.ownerId === owner && !l.undone).map((l) => l.captureId))
  return new Set(Object.values(state.ideaCaptures).filter((c) => c.ownerId === owner && c.status === 'ORGANIZADA' && !byAi.has(c.id)).map((c) => c.id))
}

/** Pensamentos soltos logo antes deste, em sequência (até 3 min entre um e outro). */
export function sequenceBefore(state: Pick<DataState, 'ideaCaptures'>, capture: IdeaCapture): IdeaCapture[] {
  const mine = Object.values(state.ideaCaptures)
    .filter((c) => c.ownerId === capture.ownerId && c.id !== capture.id && c.createdAt <= capture.createdAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  const out: IdeaCapture[] = []
  let last = Date.parse(capture.createdAt)
  for (const c of mine) {
    const t = Date.parse(c.createdAt)
    if (last - t > SEQUENCE_WINDOW_MS || out.length >= 3) break
    out.push(c)
    last = t
  }
  return out.reverse()
}

/** Palpite rápido pelo sentido, antes da IA grande: "Saúde › Corrida". null sem IA local ou sem nada parecido. */
export async function guessPlace(text: string): Promise<string | null> {
  const owner = uiStore.get().viewer
  const state = dataStore.get()
  const ideas = Object.values(state.ideas).filter((i) => i.ownerId === owner)
  if (!ideas.length) return null
  const notes = Object.values(state.ideaNotes).filter((n) => n.ownerId === owner && n.ideaId)
  const sense = await senseScores(text, ideas.map((i) => ({ id: i.id, text: ideaSenseText(i, notes) }))).catch(() => null)
  if (!sense) return null
  // palpite só com um vencedor claro: perto do mínimo e à frente do segundo
  const ranked = [...sense].sort((a, b) => b[1] - a[1])
  const [first, second] = ranked
  if (!first || first[1] < SENSE_MIN - 0.02) return null
  if (second ? first[1] - second[1] < 0.03 : first[1] < SENSE_MIN + 0.06) return null
  const best = { id: first[0] }
  const topic = state.ideaTopics[state.ideas[best.id]!.topicId]
  const area = topic ? state.ideaAreas[topic.areaId] : undefined
  return area && topic ? `${area.name} › ${topic.name}` : null
}

/* ------------------------------------------------ fila por trás (ADR-0012): um por vez, sem a pessoa esperar */

export const organizerStore = createStore<{ waiting: number; ids: readonly string[] }>({ waiting: 0, ids: [] })
export const useOrganizerWaiting = () => useStore(organizerStore, (s) => s.waiting)
export const useQueuedIds = () => useStore(organizerStore, (s) => s.ids)
const queued = new Set<string>()
let chain: Promise<unknown> = Promise.resolve()

/** Põe a captura na fila. A placa atende um pedido por vez, então a fila também. Já na fila: mesma espera. */
export function queueOrganize(captureId: string, provider: AiProvider | null = currentProvider()): Promise<AiOrganizeResult> {
  if (queued.has(captureId)) return Promise.reject(new Error('Este pensamento já está na fila.'))
  queued.add(captureId)
  organizerStore.set((s) => ({ waiting: s.waiting + 1, ids: [...s.ids, captureId] }))
  const job = chain.then(() => organizeWithAi(captureId, provider))
  chain = job.catch(() => undefined)
  return job.finally(() => {
    queued.delete(captureId)
    organizerStore.set((s) => ({ waiting: Math.max(0, s.waiting - 1), ids: s.ids.filter((id) => id !== captureId) }))
  })
}

/**
 * Pensamentos que esperam porque nenhuma IA respondeu (PC desligado, sem internet): organiza sozinho quando uma IA
 * volta. Só pega o que a IA nunca organizou (nada desfeito pela pessoa), do mais antigo para o mais novo, e para no
 * primeiro erro (a IA ainda está fora). Devolve quantos foram organizados.
 */
export async function organizePending(provider: AiProvider | null = currentProvider(), max = 5): Promise<number> {
  if (!provider) return 0
  const owner = uiStore.get().viewer
  const state = dataStore.get()
  const touched = new Set(Object.values(state.ideaAiLog).map((l) => l.captureId))
  const waiting = Object.values(state.ideaCaptures)
    .filter((c) => c.ownerId === owner && c.status === 'PENDENTE' && !touched.has(c.id) && !pending.has(c.id) && !queued.has(c.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, max)
  let done = 0
  for (const c of waiting) {
    if (uiStore.get().viewer !== owner) break
    try {
      await queueOrganize(c.id, provider)
      done++
    } catch {
      break
    }
  }
  return done
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
  // sentido (ADR-0012): acha "fui correr" quando a pergunta é sobre exercício; sem IA local, só palavras
  const sense = provider ? focusSense(await senseScores(q, searchableNotes(state, owner).map((n) => ({ id: n.id, text: n.text }))).catch(() => null)) : null
  const { found, filters } = searchNotes(state, owner, q, today, undefined, sense)
  if (!provider || !found.length) return { found, filters, answer: null }
  const r = await provider.runStructured({ system: ASK_SYSTEM, schema: ASK_SCHEMA, input: buildAskInput(q, found, today) })
  return { found, filters, answer: checkAnswer(r.json, new Set(found.map((f) => f.note.id))) }
}

/* ------------------------------------------------ marcar pela barra (ADR-0014) */

export interface ScheduleOffer {
  proposal: ScheduleProposal
  /** "09:00 Reunião" do que se cruza com o horário */
  conflicts: string[]
  /** "Saúde › Dentista" de onde veio o local (ou o título) */
  sourceLabel: string | null
}

/**
 * Se o texto fala de um dia, monta a proposta: dia e hora pelo código; título, local e observação pela IA com
 * as anotações parecidas (sentido; sem IA local, palavras). Sem dia: null (segue como pensamento).
 */
export async function proposeSchedule(text: string, today: DateKey, provider: AiProvider | null = currentProvider()): Promise<ScheduleOffer | null> {
  const when = parseWhen(text, today)
  if (!when) return null
  const owner = uiStore.get().viewer
  const state = dataStore.get()
  // tudo o que a pessoa já soltou conta: anotações nas ideias, na Caixa de entrada e pensamentos ainda não organizados
  const placed = searchableNotes(state, owner)
  let notes: ScheduleNote[]
  const sense = focusSense(await senseScores(text, placed.map((n) => ({ id: n.id, text: n.text }))).catch(() => null))
  if (sense?.size) {
    const textOf = new Map(placed.map((n) => [n.id, n.text]))
    notes = [...sense].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => ({ id, text: textOf.get(id) ?? '' }))
  } else {
    notes = searchNotes(state, owner, text, today).found.slice(0, 8).map((f) => ({ id: f.note.id, text: f.note.text }))
  }
  let proposal = baseProposal(text, when)
  if (provider) {
    try {
      const r = await provider.runStructured({ system: SCHEDULE_SYSTEM, schema: SCHEDULE_SCHEMA, input: buildScheduleInput(text, today, when, notes) })
      proposal = parseSchedule(r.json, text, when, notes)
    } catch {
      // sem resposta da IA: fica a proposta do código (dia, hora e o texto como título)
    }
  }
  const mine = Object.values(state.events).filter((e) => e.ownerId === null || e.ownerId === owner)
  const sourceId = proposal.sources.location ?? proposal.sources.title ?? proposal.sources.notes
  const idea = sourceId ? state.ideas[state.ideaNotes[sourceId]?.ideaId ?? ''] : undefined
  const topic = idea ? state.ideaTopics[idea.topicId] : undefined
  return { proposal, conflicts: overlaps(mine, proposal), sourceLabel: idea ? (topic ? `${topic.name} › ${idea.title}` : idea.title) : null }
}
