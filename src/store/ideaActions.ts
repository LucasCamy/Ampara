/**
 * Ações do módulo Ideias (segundo cérebro). Especificação: docs/08-ideias-segundo-cerebro.md.
 *
 * - Soltar um pensamento grava a captura na hora, sem esperar IA (ADR-0001).
 * - A organização só grava o que o validador aprovou (ADR-0004) e deixa um registro para auditar e desfazer.
 * - Tudo pertence a quem está usando o app (viewer) e nunca é visível ao par (ADR-0009).
 */
import { IDEA_LIMITS, defaultAreasFor, foldText, type Idea, type IdeaAction, type IdeaAiLog, type IdeaCapture, type IdeaLink, type IdeaMap, type IdeaNote, type IdeaTopic, type CaptureSource } from '../domain/ideas'
import { normalizeSpaces, type ValidationResult, type ValidatedOp } from '../domain/ideasValidate'
import { uuid } from '../domain/seed'
import type { CalendarEvent, DataState, DateKey, PartnerId, Task } from '../domain/types'
import { MAX_STEPS, dueDateOf, type ActionDraft } from '../domain/ideasConcretize'
import { buildEvent, validateEvent, type EventInput } from '../domain/catalog'
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
          const idea: Idea = { id: uuid(), ownerId: owner, topicId, title: op.title, summary: op.summary, nature: op.nature, state: 'SOLTA', needsReview: op.needsReview, createdAt: iso, updatedAt: iso }
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

/* ---------------------------------------------------------------- ações da pessoa (sem IA) */

type CollectionKey = Parameters<Tx['put']>[0]

/**
 * Como `transact`, mas o Desfazer regrava as versões anteriores com updatedAt novo. As tabelas idea_*
 * mantêm a versão mais nova no servidor (keep_newest): restaurar com a data antiga seria ignorado lá.
 */
function transactFresh(recipe: (tx: Tx) => void): () => void {
  const before = new Map<string, { c: CollectionKey; id: string; prev: unknown }>()
  transact((tx) => {
    const track = (c: CollectionKey, id: string) => {
      const key = `${c}/${id}`
      if (!before.has(key)) before.set(key, { c, id, prev: tx.get(c, id) })
    }
    recipe({
      get: tx.get,
      state: tx.state,
      put: (c, entity) => {
        track(c, (entity as { id: string }).id)
        tx.put(c, entity)
      },
      remove: (c, id) => {
        track(c, id)
        tx.remove(c, id)
      },
    })
  })
  return () => {
    const iso = nowIso()
    transact((tx) => {
      for (const { c, id, prev } of before.values()) {
        if (prev === undefined) tx.remove(c, id)
        else tx.put(c, { ...(prev as object), updatedAt: iso } as never)
      }
    })
  }
}

export type ActionResult = { ok: true; undo: () => void } | { ok: false; error: string }
const fail = (error: string): ActionResult => ({ ok: false, error })
const noop: ActionResult = { ok: true, undo: () => undefined }

/** Regras automáticas depois de novas anotações: ideia guardada volta; solta com 2 anotações amadurece. */
function settleStates(tx: Tx, ideaIds: Iterable<string>, iso: string) {
  const notes = Object.values(tx.state().ideaNotes)
  for (const id of ideaIds) {
    const idea = tx.get('ideas', id)
    if (!idea) continue
    const count = notes.filter((n) => n.ideaId === id).length
    if (idea.state === 'GUARDADA' || (idea.state === 'SOLTA' && count >= 2)) tx.put('ideas', { ...idea, state: 'AMADURECENDO', updatedAt: iso })
  }
}

export interface ManualOrganizeInput {
  /** Captura inteira (pendente) ou um trecho da Caixa de entrada */
  captureId?: string
  noteId?: string
  areaId: string
  topicId?: string
  newTopicName?: string
  ideaId?: string
  newIdea?: { title: string; nature: Idea['nature'] }
}

/** A pessoa organiza à mão: escolhe Área, Assunto (ou cria) e Ideia (ou cria). */
export function organizeManually(input: ManualOrganizeInput): ActionResult {
  const owner = viewer()
  const s = dataStore.get()
  const capture = input.captureId ? s.ideaCaptures[input.captureId] : undefined
  const inboxNote = input.noteId ? s.ideaNotes[input.noteId] : undefined
  const sourceOk = capture
    ? capture.ownerId === owner && capture.status === 'PENDENTE'
    : !!inboxNote && inboxNote.ownerId === owner && inboxNote.ideaId === null
  if (!sourceOk) return fail('Este pensamento já foi organizado.')
  const area = s.ideaAreas[input.areaId]
  if (!area || area.ownerId !== owner || area.hidden) return fail('Escolha uma área.')

  let topic: IdeaTopic | undefined
  const newTopicName = input.newTopicName?.trim()
  if (input.topicId) {
    topic = s.ideaTopics[input.topicId]
    if (!topic || topic.ownerId !== owner || topic.areaId !== area.id || topic.archived) return fail('Escolha um assunto desta área.')
  } else if (newTopicName) {
    if (newTopicName.length > IDEA_LIMITS.topicNameMaxChars) return fail(`Use até ${IDEA_LIMITS.topicNameMaxChars} letras no nome do assunto.`)
    const active = Object.values(s.ideaTopics).filter((t) => t.ownerId === owner && t.areaId === area.id && !t.archived)
    if (active.some((t) => foldText(t.name) === foldText(newTopicName))) return fail('Já existe um assunto com esse nome nesta área.')
    if (active.length >= IDEA_LIMITS.maxActiveTopicsPerArea) return fail(`Esta área já tem ${IDEA_LIMITS.maxActiveTopicsPerArea} assuntos. Junte ou arquive algum antes.`)
  } else return fail('Escolha um assunto ou crie um novo.')

  let idea: Idea | undefined
  const newTitle = input.newIdea?.title.trim()
  if (input.ideaId) {
    idea = s.ideas[input.ideaId]
    if (!idea || idea.ownerId !== owner || !topic || idea.topicId !== topic.id) return fail('Escolha uma ideia deste assunto.')
  } else if (!newTitle) return fail('Escreva o nome da ideia.')
  else if (newTitle.length > 80) return fail('Use um nome mais curto para a ideia.')

  const iso = nowIso()
  const undo = transactFresh((tx) => {
    if (!topic) {
      topic = { id: uuid(), ownerId: owner, areaId: area.id, name: newTopicName!, firm: true, archived: false, origin: 'PESSOA', createdAt: iso, updatedAt: iso }
      tx.put('ideaTopics', topic)
    }
    if (!idea) {
      idea = { id: uuid(), ownerId: owner, topicId: topic.id, title: newTitle!, summary: '', nature: input.newIdea!.nature, state: 'SOLTA', needsReview: false, createdAt: iso, updatedAt: iso }
      tx.put('ideas', idea)
    }
    if (capture) {
      tx.put('ideaNotes', note(capture, idea.id, capture.text, 0, capture.text.length, false, null, iso))
      tx.put('ideaCaptures', { ...capture, status: 'ORGANIZADA', updatedAt: iso })
    } else {
      tx.put('ideaNotes', { ...inboxNote!, ideaId: idea.id, inboxReason: null, needsReview: false, updatedAt: iso })
    }
    settleStates(tx, [idea.id], iso)
  })
  return { ok: true, undo }
}

export interface IdeaPatch {
  title?: string
  summary?: string
  nature?: Idea['nature']
  /** "Virou ação" só pelo concretizar (ADR-0001) */
  state?: Exclude<Idea['state'], 'VIROU_ACAO'>
  topicId?: string
}

export function updateIdea(id: string, patch: IdeaPatch): ActionResult {
  const owner = viewer()
  const s = dataStore.get()
  const idea = s.ideas[id]
  if (!idea || idea.ownerId !== owner) return fail('Esta ideia não existe mais.')
  const title = patch.title?.trim()
  if (patch.title !== undefined && (!title || title.length > 80)) return fail('Escreva um nome com até 80 letras.')
  const summary = patch.summary?.trim()
  if (summary !== undefined && summary.length > IDEA_LIMITS.summaryMaxChars) return fail(`Use até ${IDEA_LIMITS.summaryMaxChars} letras no resumo.`)
  if (patch.topicId !== undefined) {
    const topic = s.ideaTopics[patch.topicId]
    if (!topic || topic.ownerId !== owner || topic.archived) return fail('Escolha um assunto.')
  }
  const next: Idea = {
    ...idea,
    ...(title !== undefined ? { title } : {}),
    ...(summary !== undefined ? { summary } : {}),
    ...(patch.nature ? { nature: patch.nature } : {}),
    ...(patch.state ? { state: patch.state } : {}),
    ...(patch.topicId ? { topicId: patch.topicId } : {}),
  }
  if (JSON.stringify(next) === JSON.stringify(idea)) return noop
  const undo = transactFresh((tx) => tx.put('ideas', { ...next, updatedAt: nowIso() }))
  return { ok: true, undo }
}

/**
 * Mudar uma anotação de ideia. É a correção mais natural da pessoa: o mapa muda e, com ele, os exemplos que a IA
 * vê da próxima vez (ADR-0012).
 */
export function moveNote(noteId: string, ideaId: string): ActionResult {
  const owner = viewer()
  const s = dataStore.get()
  const note = s.ideaNotes[noteId]
  const target = s.ideas[ideaId]
  if (!note || note.ownerId !== owner || !note.ideaId) return fail('Esta anotação não existe mais.')
  if (!target || target.ownerId !== owner) return fail('Escolha uma ideia.')
  if (note.ideaId === ideaId) return noop
  const undo = transactFresh((tx) => tx.put('ideaNotes', { ...note, ideaId, needsReview: false, updatedAt: nowIso() }))
  return { ok: true, undo }
}

/** Aceitar (fica sólida) ou recusar (some e a IA não sugere de novo) uma ligação. */
export function setLinkState(linkId: string, state: 'CONFIRMADA' | 'RECUSADA'): ActionResult {
  const link = dataStore.get().ideaLinks[linkId]
  if (!link || link.ownerId !== viewer()) return fail('Esta ligação não existe mais.')
  if (link.state === state) return noop
  const undo = transactFresh((tx) => tx.put('ideaLinks', { ...link, state, updatedAt: nowIso() }))
  return { ok: true, undo }
}

/** "Está certo": a pessoa conferiu o que a IA encaixou com confiança média. */
export function markIdeaReviewed(ideaId: string): ActionResult {
  const owner = viewer()
  const s = dataStore.get()
  const idea = s.ideas[ideaId]
  if (!idea || idea.ownerId !== owner) return fail('Esta ideia não existe mais.')
  const iso = nowIso()
  const undo = transactFresh((tx) => {
    if (idea.needsReview) tx.put('ideas', { ...idea, needsReview: false, updatedAt: iso })
    for (const n of Object.values(s.ideaNotes)) {
      if (n.ideaId === ideaId && n.needsReview) tx.put('ideaNotes', { ...n, needsReview: false, updatedAt: iso })
    }
  })
  return { ok: true, undo }
}

/** Confirma um assunto provisório criado pela IA (vira firme, traço sólido). */
export function confirmTopic(topicId: string): ActionResult {
  const topic = dataStore.get().ideaTopics[topicId]
  if (!topic || topic.ownerId !== viewer()) return fail('Este assunto não existe mais.')
  if (topic.firm) return noop
  const undo = transactFresh((tx) => tx.put('ideaTopics', { ...topic, firm: true, updatedAt: nowIso() }))
  return { ok: true, undo }
}

/** Apaga um pensamento que ainda não foi organizado (com Desfazer). */
export function deletePendingCapture(captureId: string): ActionResult {
  const capture = dataStore.get().ideaCaptures[captureId]
  if (!capture || capture.ownerId !== viewer() || capture.status !== 'PENDENTE') return fail('Este pensamento já foi organizado.')
  const undo = transactFresh((tx) => tx.remove('ideaCaptures', captureId))
  return { ok: true, undo }
}

/** Tira um trecho da Caixa de entrada sem guardar em nenhuma ideia. */
export function discardInboxNote(noteId: string): ActionResult {
  const n = dataStore.get().ideaNotes[noteId]
  if (!n || n.ownerId !== viewer() || n.ideaId !== null) return fail('Este trecho não está mais na Caixa de entrada.')
  const undo = transactFresh((tx) => tx.remove('ideaNotes', noteId))
  return { ok: true, undo }
}

/* ---------------------------------------------------------------- "Isso vai acontecer" (ADR-0001) */

/**
 * Cria a tarefa (com micro-passos) ou o compromisso que a pessoa confirmou, liga à ideia (idea_actions) e marca a
 * ideia como "Virou ação". A ideia continua existindo. Tudo numa operação, com Desfazer.
 * A tarefa nasce pessoal e privada: veio de uma ideia, que é privada (ADR-0009).
 */
export function concretizeIdea(ideaId: string, draft: ActionDraft, today: DateKey): ActionResult & { targetId?: string } {
  const owner = viewer()
  const s = dataStore.get()
  const idea = s.ideas[ideaId]
  if (!idea || idea.ownerId !== owner) return fail('Esta ideia não existe mais.')
  const title = draft.title.replace(/\s+/g, ' ').trim()
  if (!title) return fail(draft.kind === 'TASK' ? 'Escreva o que precisa ser feito.' : 'Escreva o compromisso.')
  const iso = nowIso()
  let target: { type: 'TASK'; task: Task } | { type: 'EVENT'; event: CalendarEvent }

  if (draft.kind === 'TASK') {
    const steps = draft.steps.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, MAX_STEPS)
    target = {
      type: 'TASK',
      task: {
        id: uuid(), createdBy: owner, assignedTo: owner, title: title.slice(0, 120), effort: draft.effort, status: 'PENDING',
        dueDate: dueDateOf(draft.when, today), dueTime: null, visibleToPartner: false, sentBy: null,
        completedAt: null, completedBy: null, sourceMedicationId: null,
        steps: steps.map((text) => ({ id: uuid(), text: text.slice(0, 120), done: false })),
        postponeCount: 0, createdAt: iso, updatedAt: iso,
      },
    }
  } else {
    const input: EventInput = { title, date: draft.date, start: draft.start, end: draft.end, owner: 'ME', type: 'APPOINTMENT' }
    const errors = validateEvent(input)
    const first = Object.values(errors).find(Boolean)
    if (first) return fail(first)
    target = { type: 'EVENT', event: buildEvent(input, owner, uuid(), iso) }
  }

  const targetId = target.type === 'TASK' ? target.task.id : target.event.id
  const undo = transactFresh((tx) => {
    if (target.type === 'TASK') tx.put('tasks', target.task)
    else tx.put('events', target.event)
    const action: IdeaAction = { id: uuid(), ownerId: owner, ideaId, targetType: target.type, targetId, createdAt: iso, updatedAt: iso }
    tx.put('ideaActions', action)
    tx.put('ideas', { ...idea, state: 'VIROU_ACAO', updatedAt: iso })
  })
  return { ok: true, undo, targetId }
}
