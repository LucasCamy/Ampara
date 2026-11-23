/**
 * Ações do módulo Ideias (segundo cérebro). Especificação: docs/08-ideias-segundo-cerebro.md.
 *
 * - Soltar um pensamento grava a captura na hora, sem esperar IA (ADR-0001).
 * - A organização só grava o que o validador aprovou (ADR-0004) e deixa um registro para auditar e desfazer.
 * - Tudo pertence a quem está usando o app (viewer) e nunca é visível ao par (ADR-0009).
 */
import { IDEA_LIMITS, defaultAreasFor, type Idea, type IdeaAiLog, type IdeaCapture, type IdeaLink, type IdeaMap, type IdeaNote, type IdeaTopic, type CaptureSource } from '../domain/ideas'
import { normalizeSpaces, type ValidationResult, type ValidatedOp } from '../domain/ideasValidate'
import { uuid } from '../domain/seed'
import type { DataState, PartnerId } from '../domain/types'
import { dataStore, transact, type Tx } from './data'
import { uiStore } from './ui'

const nowIso = () => new Date().toISOString()
const viewer = (): PartnerId => uiStore.get().viewer

/** Só o que é da pessoa (no aparelho compartilhado do Casal, o cofre tem dados dos dois). */
export function myIdeaMap(state: DataState, owner: PartnerId): IdeaMap {
  const mine = <T extends { ownerId: PartnerId }>(m: Record<string, T>) => Object.values(m).filter((x) => x.ownerId === owner)
  return { areas: mine(state.ideaAreas), topics: mine(state.ideaTopics), ideas: mine(state.ideas), links: mine(state.ideaLinks) }
}

/** Cria as Áreas iniciais da pessoa na primeira vez que ela usa o módulo. */
export function ensureIdeaAreas(owner: PartnerId = viewer()): void {
  const state = dataStore.get()
  if (Object.values(state.ideaAreas).some((a) => a.ownerId === owner)) return
  transact((tx) => {
    for (const area of defaultAreasFor(owner, nowIso())) tx.put('ideaAreas', area)
  })
}

/** Grava o pensamento como veio. Devolve o id da captura, ou null se estiver vazio. */
export function captureThought(text: string, source: CaptureSource = 'TEXTO', owner: PartnerId = viewer()): string | null {
  const clean = normalizeSpaces(text).slice(0, IDEA_LIMITS.captureMaxChars)
  if (!clean) return null
  ensureIdeaAreas(owner)
  const iso = nowIso()
  const capture: IdeaCapture = { id: uuid(), ownerId: owner, text: clean, source, status: 'PENDENTE', createdAt: iso, updatedAt: iso }
  transact((tx) => tx.put('ideaCaptures', capture))
  return capture.id
}

/** Sem IA (ou com erro): a captura inteira vai para a Caixa de entrada, para a pessoa decidir. */
export function sendCaptureToInbox(captureId: string, reason: string): boolean {
  const capture = dataStore.get().ideaCaptures[captureId]
  if (!capture || capture.ownerId !== viewer() || capture.status !== 'PENDENTE') return false
  const iso = nowIso()
  transact((tx) => {
    tx.put('ideaNotes', note(capture, null, capture.text, 0, capture.text.length, false, reason.slice(0, IDEA_LIMITS.reasonMaxChars), iso))
    tx.put('ideaCaptures', { ...capture, status: 'CAIXA', updatedAt: iso })
  })
  return true
}

function note(capture: IdeaCapture, ideaId: string | null, text: string, startPos: number | null, endPos: number | null, needsReview: boolean, inboxReason: string | null, iso: string): IdeaNote {
  return { id: uuid(), ownerId: capture.ownerId, captureId: capture.id, ideaId, text: text.slice(0, IDEA_LIMITS.noteMaxChars), startPos, endPos, needsReview, inboxReason, createdAt: iso, updatedAt: iso }
}

export interface OrganizationMeta {
  provider: string
  model: string
  promptVersion: string
}

/** O que fica no registro para auditar e desfazer. */
export interface OrganizationRecord {
  version: string | null
  ok: boolean
  rejected: ValidationResult['rejected']
  /** Sugestões de estado: a pessoa aceita ou não (a IA nunca muda o estado sozinha). */
  suggestions: Extract<ValidatedOp, { kind: 'SUGERIR_ESTADO' }>[]
  created: { topics: string[]; ideas: string[]; notes: string[]; links: string[] }
  /** Versões anteriores de ideias e assuntos que já existiam e foram alterados. */
  previous: { ideas: Idea[]; topics: IdeaTopic[] }
}

/**
 * Grava o que o validador aprovou para uma captura PENDENTE. Devolve o id do registro (para "Desfazer"
 * e "Por que aqui?") ou null se a captura não for da pessoa ou já tiver sido organizada.
 */
export function applyOrganization(captureId: string, result: ValidationResult, meta: OrganizationMeta): string | null {
  const owner = viewer()
  const capture = dataStore.get().ideaCaptures[captureId]
  if (!capture || capture.ownerId !== owner || capture.status !== 'PENDENTE') return null
  if (normalizeSpaces(capture.text) !== result.capture) return null // resultado de outra captura

  const iso = nowIso()
  const logId = uuid()
  const record: OrganizationRecord = {
    version: result.version, ok: result.ok, rejected: result.rejected, suggestions: [],
    created: { topics: [], ideas: [], notes: [], links: [] }, previous: { ideas: [], topics: [] },
  }

  transact((tx) => {
    const topicIds = new Map<string, string>()
    const ideaIds = new Map<string, string>()
    const touched = new Set<string>()
    const remember = (idea: Idea) => {
      if (!record.created.ideas.includes(idea.id) && !record.previous.ideas.some((i) => i.id === idea.id)) record.previous.ideas.push(idea)
    }
    const resolveIdea = (ref: { id: string } | { ref: string }) => ('id' in ref ? ref.id : ideaIds.get(ref.ref))
    const addNote = (ideaId: string | null, op: { text: string; start: number; end: number }, needsReview: boolean, reason: string | null) => {
      const n = note(capture, ideaId, op.text, op.start, op.end, needsReview, reason, iso)
      tx.put('ideaNotes', n)
      record.created.notes.push(n.id)
      if (ideaId) touched.add(ideaId)
    }

    for (const op of result.ok ? result.apply : []) {
      switch (op.kind) {
        case 'CRIAR_ASSUNTO': {
          const topic: IdeaTopic = { id: uuid(), ownerId: owner, areaId: op.areaId, name: op.name, firm: false, archived: false, origin: 'IA', createdAt: iso, updatedAt: iso }
          topicIds.set(op.ref, topic.id)
          tx.put('ideaTopics', topic)
          record.created.topics.push(topic.id)
          break
        }
        case 'CRIAR_IDEIA': {
          const topicId = 'id' in op.topic ? op.topic.id : topicIds.get(op.topic.ref)
          if (!topicId) break
          const idea: Idea = { id: uuid(), ownerId: owner, topicId, title: op.title, summary: '', nature: op.nature, state: 'SOLTA', needsReview: op.needsReview, createdAt: iso, updatedAt: iso }
          if (op.ref) ideaIds.set(op.ref, idea.id)
          tx.put('ideas', idea)
          record.created.ideas.push(idea.id)
          addNote(idea.id, op, op.needsReview, null)
          break
        }
        case 'ANEXAR': {
          const idea = tx.get('ideas', op.ideaId)
          if (!idea || idea.ownerId !== owner) break
          addNote(idea.id, op, op.needsReview, null)
          break
        }
        case 'SUGERIR_LIGACAO': {
          const from = resolveIdea(op.from)
          const to = resolveIdea(op.to)
          if (!from || !to) break
          const link: IdeaLink = { id: uuid(), ownerId: owner, fromIdeaId: from, toIdeaId: to, type: op.type, reason: op.reason, origin: 'IA', state: 'SUGERIDA', createdAt: iso, updatedAt: iso }
          tx.put('ideaLinks', link)
          record.created.links.push(link.id)
          break
        }
        case 'ATUALIZAR_RESUMO': {
          const id = resolveIdea(op.idea)
          const idea = id ? tx.get('ideas', id) : undefined
          if (!idea || idea.ownerId !== owner) break
          remember(idea)
          tx.put('ideas', { ...idea, summary: op.summary, updatedAt: iso })
          break
        }
        case 'SUGERIR_ESTADO':
          record.suggestions.push(op)
          break
      }
    }

    for (const item of result.inbox) {
      addNote(null, { text: item.text, start: item.start ?? 0, end: item.end ?? item.text.length }, false, item.reason.slice(0, IDEA_LIMITS.reasonMaxChars))
    }

    // Estados automáticos (únicos permitidos sem a pessoa): voltou a falar de uma ideia guardada, ou
    // uma ideia solta ganhou a segunda anotação. Os dois se desfazem com o registro.
    const notes = Object.values(tx.state().ideaNotes)
    for (const id of touched) {
      const idea = tx.get('ideas', id)
      if (!idea) continue
      const count = notes.filter((n) => n.ideaId === id).length
      if (idea.state === 'GUARDADA' || (idea.state === 'SOLTA' && count >= 2)) {
        remember(idea)
        tx.put('ideas', { ...idea, state: 'AMADURECENDO', updatedAt: iso })
      }
    }

    // Assunto provisório vira firme ao chegar a 3 ideias
    const ideas = Object.values(tx.state().ideas)
    for (const topic of Object.values(tx.state().ideaTopics)) {
      if (topic.ownerId !== owner || topic.firm || topic.archived) continue
      if (ideas.filter((i) => i.topicId === topic.id && i.state !== 'GUARDADA').length >= IDEA_LIMITS.firmTopicAtIdeas) {
        if (!record.created.topics.includes(topic.id)) record.previous.topics.push(topic)
        tx.put('ideaTopics', { ...topic, firm: true, updatedAt: iso })
      }
    }

    tx.put('ideaCaptures', { ...capture, status: touched.size ? 'ORGANIZADA' : 'CAIXA', updatedAt: iso })
    const log: IdeaAiLog = { id: logId, ownerId: owner, captureId, provider: meta.provider, model: meta.model, promptVersion: meta.promptVersion, result: record, undone: false, createdAt: iso, updatedAt: iso }
    tx.put('ideaAiLog', log)
  })
  return logId
}

/**
 * Desfaz uma organização inteira: apaga o que ela criou, devolve ideias e assuntos alterados e deixa a
 * captura PENDENTE de novo. Versões restauradas ganham updatedAt novo ("a mais nova vence" no servidor).
 */
export function undoOrganization(logId: string): boolean {
  const owner = viewer()
  const log = dataStore.get().ideaAiLog[logId]
  if (!log || log.ownerId !== owner || log.undone) return false
  const record = log.result as OrganizationRecord
  const iso = nowIso()
  transact((tx: Tx) => {
    for (const id of record.created.links) tx.remove('ideaLinks', id)
    for (const id of record.created.notes) tx.remove('ideaNotes', id)
    for (const id of record.created.ideas) {
      // ligações que a pessoa criou depois para uma ideia que deixa de existir saem junto
      for (const l of Object.values(tx.state().ideaLinks)) if (l.fromIdeaId === id || l.toIdeaId === id) tx.remove('ideaLinks', l.id)
      tx.remove('ideas', id)
    }
    for (const id of record.created.topics) tx.remove('ideaTopics', id)
    for (const prev of record.previous.ideas) if (tx.get('ideas', prev.id)) tx.put('ideas', { ...prev, updatedAt: iso })
    for (const prev of record.previous.topics) if (tx.get('ideaTopics', prev.id)) tx.put('ideaTopics', { ...prev, updatedAt: iso })
    const capture = tx.get('ideaCaptures', log.captureId)
    if (capture) tx.put('ideaCaptures', { ...capture, status: 'PENDENTE', updatedAt: iso })
    tx.put('ideaAiLog', { ...log, undone: true, updatedAt: iso })
  })
  return true
}
