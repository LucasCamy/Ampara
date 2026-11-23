/**
 * Visões do módulo Ideias (ADR-0007): árvore do Esboço, Caixa de entrada e posições do Mapa.
 * Funções puras: a tela só desenha o que sai daqui. Tudo é filtrado por dono (ADR-0009).
 */
import { hierarchy, tree } from 'd3-hierarchy'
import type { Idea, IdeaAction, IdeaArea, IdeaCapture, IdeaLink, IdeaNature, IdeaNote, IdeaState, IdeaTopic, LinkType } from './ideas'
import type { DataState, PartnerId } from './types'

/** Só as coleções das Ideias: a tela assina cada uma separada (sem re-render por outras mudanças). */
export type IdeaData = Pick<DataState, 'ideaAreas' | 'ideaTopics' | 'ideas' | 'ideaCaptures' | 'ideaNotes' | 'ideaLinks'> & Partial<Pick<DataState, 'ideaActions'>>

export const NATURE_LABEL: Record<IdeaNature, string> = {
  PLANO: 'Plano',
  DESEJO: 'Desejo',
  PREOCUPACAO: 'Preocupação',
  PERGUNTA: 'Pergunta',
  OBSERVACAO: 'Observação',
  REFLEXAO: 'Reflexão',
}

export const STATE_LABEL: Record<IdeaState, string> = {
  SOLTA: 'Solta',
  AMADURECENDO: 'Amadurecendo',
  VIROU_ACAO: 'Virou ação',
  GUARDADA: 'Guardada',
}

/** Frase lida a partir da ideia de origem: "Correr de manhã · depende de · Dormir cedo" */
export const LINK_LABEL: Record<LinkType, string> = {
  RELACIONA: 'conversa com',
  DEPENDE_DE: 'depende de',
  PARTE_DE: 'é parte de',
  CONTRADIZ: 'puxa contra',
  EVOLUI_DE: 'evoluiu de',
}

export type IdeaShow = 'ATIVAS' | 'GUARDADAS' | 'TODAS'
export interface IdeaFilter {
  show: IdeaShow
  nature: IdeaNature | 'TODAS'
}
export const DEFAULT_FILTER: IdeaFilter = { show: 'ATIVAS', nature: 'TODAS' }
export const isDefaultFilter = (f: IdeaFilter) => f.show === DEFAULT_FILTER.show && f.nature === DEFAULT_FILTER.nature

export function matchesFilter(idea: Idea, filter: IdeaFilter): boolean {
  if (filter.nature !== 'TODAS' && idea.nature !== filter.nature) return false
  if (filter.show === 'ATIVAS') return idea.state !== 'GUARDADA'
  if (filter.show === 'GUARDADAS') return idea.state === 'GUARDADA'
  return true
}

const mine = <T extends { ownerId: PartnerId }>(m: Record<string, T>, owner: PartnerId) => Object.values(m).filter((x) => x.ownerId === owner)
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR')

export interface IdeaRow {
  idea: Idea
  noteCount: number
  linkCount: number
  /** Alguma anotação aplicada com confiança média ainda sem conferência */
  needsReview: boolean
}
export interface TopicNode { topic: IdeaTopic; ideas: IdeaRow[] }
export interface AreaNode { area: IdeaArea; topics: TopicNode[]; ideaCount: number }

/** Árvore fixa Área > Assunto > Ideia, só da pessoa, sem Áreas escondidas nem assuntos arquivados. */
export function buildIdeaTree(state: IdeaData, owner: PartnerId, filter: IdeaFilter = DEFAULT_FILTER): AreaNode[] {
  const notes = mine(state.ideaNotes, owner)
  const links = mine(state.ideaLinks, owner).filter((l) => l.state !== 'RECUSADA')
  const noteCount = new Map<string, number>()
  const review = new Set<string>()
  for (const n of notes) {
    if (!n.ideaId) continue
    noteCount.set(n.ideaId, (noteCount.get(n.ideaId) ?? 0) + 1)
    if (n.needsReview) review.add(n.ideaId)
  }
  const linkCount = new Map<string, number>()
  for (const l of links) for (const id of [l.fromIdeaId, l.toIdeaId]) linkCount.set(id, (linkCount.get(id) ?? 0) + 1)

  const ideasByTopic = new Map<string, IdeaRow[]>()
  for (const idea of mine(state.ideas, owner)) {
    if (!matchesFilter(idea, filter)) continue
    const row: IdeaRow = { idea, noteCount: noteCount.get(idea.id) ?? 0, linkCount: linkCount.get(idea.id) ?? 0, needsReview: idea.needsReview || review.has(idea.id) }
    ideasByTopic.set(idea.topicId, [...(ideasByTopic.get(idea.topicId) ?? []), row])
  }
  const showEmptyTopics = isDefaultFilter(filter)
  const topicsByArea = new Map<string, TopicNode[]>()
  for (const topic of mine(state.ideaTopics, owner).filter((t) => !t.archived).sort(byName)) {
    const ideas = (ideasByTopic.get(topic.id) ?? []).sort((a, b) => b.idea.updatedAt.localeCompare(a.idea.updatedAt))
    if (!ideas.length && !showEmptyTopics) continue
    topicsByArea.set(topic.areaId, [...(topicsByArea.get(topic.areaId) ?? []), { topic, ideas }])
  }
  return mine(state.ideaAreas, owner)
    .filter((a) => !a.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((area) => {
      const topics = topicsByArea.get(area.id) ?? []
      return { area, topics, ideaCount: topics.reduce((n, t) => n + t.ideas.length, 0) }
    })
}

export interface InboxView {
  /** Capturas que ainda não foram organizadas (nem pela IA nem pela pessoa) */
  pending: IdeaCapture[]
  /** Trechos que a IA não encaixou com segurança, ou que a pessoa mandou para cá */
  notes: IdeaNote[]
  count: number
}

export function inboxOf(state: IdeaData, owner: PartnerId): InboxView {
  const pending = mine(state.ideaCaptures, owner).filter((c) => c.status === 'PENDENTE').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const notes = mine(state.ideaNotes, owner).filter((n) => n.ideaId === null).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { pending, notes, count: pending.length + notes.length }
}

/** Anotações de uma ideia, da mais antiga para a mais nova (linha do tempo). */
export function notesOf(state: IdeaData, owner: PartnerId, ideaId: string): IdeaNote[] {
  return mine(state.ideaNotes, owner)
    .filter((n) => n.ideaId === ideaId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.startPos ?? 0) - (b.startPos ?? 0))
}

export interface LinkView { link: IdeaLink; other: Idea; outgoing: boolean }

/** Ligações visíveis de uma ideia (recusadas ficam só para a IA não repetir). Sugeridas primeiro. */
export function linksOf(state: IdeaData, owner: PartnerId, ideaId: string): LinkView[] {
  const out: LinkView[] = []
  for (const link of mine(state.ideaLinks, owner)) {
    if (link.state === 'RECUSADA') continue
    const outgoing = link.fromIdeaId === ideaId
    if (!outgoing && link.toIdeaId !== ideaId) continue
    const other = state.ideas[outgoing ? link.toIdeaId : link.fromIdeaId]
    if (other && other.ownerId === owner) out.push({ link, other, outgoing })
  }
  return out.sort((a, b) => (a.link.state === b.link.state ? a.other.title.localeCompare(b.other.title, 'pt-BR') : a.link.state === 'SUGERIDA' ? -1 : 1))
}

/* ---------------------------------------------------------------- Mapa (ADR-0007) */

export interface MapNode {
  id: string
  kind: 'center' | 'area' | 'topic' | 'idea'
  label: string
  x: number
  y: number
  /** raio do círculo (área) ou meia-altura da pílula */
  r: number
  count: number
  /** assunto provisório ou ideia para conferir: traço tracejado */
  dashed: boolean
  state?: IdeaState
}
export interface MapEdge { from: string; to: string }
export interface MapLayout { size: number; nodes: MapNode[]; edges: MapEdge[] }

const round = (n: number) => Math.round(n * 10) / 10

/** Nível "Céu": as Áreas em volta do centro. O tamanho mostra quantas ideias cada uma tem. */
export function skyLayout(areas: AreaNode[], size = 640): MapLayout {
  const c = size / 2
  const ring = size * 0.33
  const max = Math.max(1, ...areas.map((a) => a.ideaCount))
  const nodes: MapNode[] = [{ id: 'center', kind: 'center', label: 'Minhas ideias', x: c, y: c, r: size * 0.09, count: areas.reduce((n, a) => n + a.ideaCount, 0), dashed: false }]
  const edges: MapEdge[] = []
  areas.forEach((a, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(areas.length, 1)) * Math.PI * 2
    const r = size * (0.065 + 0.045 * Math.sqrt(a.ideaCount / max))
    nodes.push({ id: a.area.id, kind: 'area', label: a.area.name, x: round(c + Math.cos(angle) * ring), y: round(c + Math.sin(angle) * ring), r: round(r), count: a.ideaCount, dashed: a.ideaCount === 0 })
    edges.push({ from: 'center', to: a.area.id })
  })
  return { size, nodes, edges }
}

interface Datum { id: string; kind: MapNode['kind']; label: string; count: number; dashed: boolean; state?: IdeaState; children?: Datum[] }

/** Nível "Área": árvore radial determinística (d3-hierarchy). Mesma entrada, mesma forma, sempre. */
export function areaLayout(area: AreaNode, size = 640): MapLayout {
  const data: Datum = {
    id: area.area.id, kind: 'center', label: area.area.name, count: area.ideaCount, dashed: false,
    children: area.topics.map((t) => ({
      id: t.topic.id, kind: 'topic', label: t.topic.name, count: t.ideas.length, dashed: !t.topic.firm,
      children: t.ideas.map((row) => ({ id: row.idea.id, kind: 'idea', label: row.idea.title, count: row.noteCount, dashed: row.needsReview, state: row.idea.state })),
    })),
  }
  const radius = size * 0.4
  const root = tree<Datum>()
    .size([Math.PI * 2, radius])
    .separation((a, b) => (a.parent === b.parent ? 1 : 2) / Math.max(a.depth, 1))(hierarchy(data))
  const c = size / 2
  const nodes: MapNode[] = []
  const edges: MapEdge[] = []
  for (const n of root.descendants()) {
    // anel fixo por nível: assuntos no meio, ideias por fora
    const r = n.depth === 0 ? 0 : n.depth === 1 ? radius * 0.5 : radius
    const angle = n.x - Math.PI / 2
    nodes.push({
      id: n.data.id, kind: n.data.kind, label: n.data.label, count: n.data.count, dashed: n.data.dashed, state: n.data.state,
      x: round(c + Math.cos(angle) * r), y: round(c + Math.sin(angle) * r), r: n.depth === 0 ? size * 0.08 : n.depth === 1 ? 20 : 16,
    })
    if (n.parent) edges.push({ from: n.parent.data.id, to: n.data.id })
  }
  return { size, nodes, edges }
}

/** Ligações da malha entre ideias que aparecem no mapa atual. */
export function meshEdges(state: IdeaData, owner: PartnerId, visibleIdeaIds: ReadonlySet<string>): IdeaLink[] {
  return mine(state.ideaLinks, owner).filter((l) => l.state !== 'RECUSADA' && visibleIdeaIds.has(l.fromIdeaId) && visibleIdeaIds.has(l.toIdeaId))
}

/** Quebra um rótulo em até 2 linhas curtas para caber no mapa. */
export function wrapLabel(text: string, max = 14): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur)
      cur = w
    } else cur = (cur + ' ' + w).trim()
  }
  if (cur) lines.push(cur)
  if (lines.length > 2) return [lines[0]!, `${lines[1]!.slice(0, max - 1)}…`]
  return lines
}

export interface ActionView { action: IdeaAction; title: string; done: boolean; when: string | null }

/** O que a ideia virou (tarefas e compromissos ainda existentes), do mais novo para o mais antigo. */
export function actionsOf(state: Pick<DataState, 'ideaActions' | 'tasks' | 'events'>, owner: PartnerId, ideaId: string): ActionView[] {
  const out: ActionView[] = []
  for (const action of Object.values(state.ideaActions)) {
    if (action.ownerId !== owner || action.ideaId !== ideaId) continue
    if (action.targetType === 'TASK') {
      const t = state.tasks[action.targetId]
      if (t) out.push({ action, title: t.title, done: t.status === 'DONE', when: t.dueDate })
    } else {
      const e = state.events[action.targetId]
      if (e) out.push({ action, title: e.title, done: false, when: `${e.date} ${e.start}` })
    }
  }
  return out.sort((a, b) => b.action.createdAt.localeCompare(a.action.createdAt))
}

/** De qual ideia veio esta tarefa ou compromisso (só para quem escreveu a ideia). */
export function ideaOfTarget(state: Pick<DataState, 'ideaActions' | 'ideas'>, owner: PartnerId, targetId: string): Idea | null {
  const action = Object.values(state.ideaActions).find((a) => a.ownerId === owner && a.targetId === targetId)
  const idea = action ? state.ideas[action.ideaId] : undefined
  return idea && idea.ownerId === owner ? idea : null
}

