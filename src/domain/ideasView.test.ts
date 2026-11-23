import { describe, expect, it } from 'vitest'
import { buildEmpty } from './seed'
import { defaultAreasFor, looksLikeThought, type Idea, type IdeaLink, type IdeaNote, type IdeaTopic } from './ideas'
import { areaLayout, buildIdeaTree, inboxOf, linksOf, meshEdges, notesOf, skyLayout, wrapLabel } from './ideasView'
import type { DataState } from './types'

const T = '2026-11-23T10:00:00.000Z'
const later = (min: number) => new Date(Date.parse(T) + min * 60_000).toISOString()
const byId = <X extends { id: string }>(xs: X[]) => Object.fromEntries(xs.map((x) => [x.id, x]))

function fixture(): DataState {
  const s = buildEmpty(new Date(T), 'COUPLE')
  const topic = (id: string, areaId: string, name: string, extra: Partial<IdeaTopic> = {}): IdeaTopic =>
    ({ id, ownerId: 'A', areaId, name, firm: true, archived: false, origin: 'PESSOA', createdAt: T, updatedAt: T, ...extra })
  const idea = (id: string, topicId: string, title: string, extra: Partial<Idea> = {}): Idea =>
    ({ id, ownerId: 'A', topicId, title, summary: '', nature: 'PLANO', state: 'SOLTA', needsReview: false, createdAt: T, updatedAt: T, ...extra })
  const note = (id: string, ideaId: string | null, extra: Partial<IdeaNote> = {}): IdeaNote =>
    ({ id, ownerId: 'A', captureId: 'c1', ideaId, text: id, startPos: null, endPos: null, needsReview: false, inboxReason: null, createdAt: T, updatedAt: T, ...extra })
  const link = (id: string, from: string, to: string, extra: Partial<IdeaLink> = {}): IdeaLink =>
    ({ id, ownerId: 'A', fromIdeaId: from, toIdeaId: to, type: 'RELACIONA', reason: 'r', origin: 'IA', state: 'CONFIRMADA', createdAt: T, updatedAt: T, ...extra })
  return {
    ...s,
    ideaAreas: byId([...defaultAreasFor('A', T).map((a) => (a.id === 'A:casa' ? { ...a, hidden: true } : a)), ...defaultAreasFor('B', T)]),
    ideaTopics: byId([
      topic('t-corrida', 'A:saude', 'Corrida'),
      topic('t-alimento', 'A:saude', 'Alimentação', { firm: false }),
      topic('t-velho', 'A:saude', 'Velho', { archived: true }),
      topic('t-b', 'B:saude', 'Do par', { ownerId: 'B' }),
    ]),
    ideas: byId([
      idea('i-correr', 't-corrida', 'Correr de manhã', { updatedAt: later(5) }),
      idea('i-tenis', 't-corrida', 'Comprar tênis', { nature: 'DESEJO', state: 'GUARDADA' }),
      idea('i-dormir', 't-corrida', 'Dormir cedo', { nature: 'PREOCUPACAO', needsReview: true }),
      idea('i-b', 't-b', 'Ideia do par', { ownerId: 'B' }),
    ]),
    ideaNotes: byId([
      note('n1', 'i-correr', { createdAt: later(2) }),
      note('n2', 'i-correr', { createdAt: later(1), needsReview: true }),
      note('n-inbox', null, { createdAt: later(3) }),
      note('n-b', null, { ownerId: 'B' }),
    ]),
    ideaLinks: byId([
      link('l1', 'i-correr', 'i-dormir', { type: 'DEPENDE_DE', state: 'SUGERIDA' }),
      link('l2', 'i-tenis', 'i-correr', { type: 'PARTE_DE' }),
      link('l3', 'i-correr', 'i-tenis', { state: 'RECUSADA' }),
    ]),
    ideaCaptures: byId([
      { id: 'c1', ownerId: 'A', text: 'x', source: 'TEXTO', status: 'ORGANIZADA', createdAt: T, updatedAt: T },
      { id: 'c2', ownerId: 'A', text: 'pensar no curso', source: 'VOZ', status: 'PENDENTE', createdAt: later(9), updatedAt: later(9) },
      { id: 'c3', ownerId: 'B', text: 'do par', source: 'TEXTO', status: 'PENDENTE', createdAt: T, updatedAt: T },
    ]),
  }
}

describe('árvore do Esboço', () => {
  it('só da pessoa, sem área escondida nem assunto arquivado, na ordem do catálogo', () => {
    const tree = buildIdeaTree(fixture(), 'A')
    expect(tree.map((a) => a.area.name)).toEqual(['Trabalho', 'Estudos', 'Saúde', 'Dinheiro', 'Relações', 'Projetos pessoais', 'Lazer e criatividade'])
    const saude = tree.find((a) => a.area.id === 'A:saude')!
    expect(saude.topics.map((t) => t.topic.name)).toEqual(['Alimentação', 'Corrida'])
    // ativas por padrão: a guardada não aparece; mais recente primeiro
    expect(saude.topics[1]!.ideas.map((r) => r.idea.title)).toEqual(['Correr de manhã', 'Dormir cedo'])
    expect(saude.ideaCount).toBe(2)
  })

  it('conta anotações, ligações visíveis e marca "conferir"', () => {
    const rows = buildIdeaTree(fixture(), 'A', { show: 'TODAS', nature: 'TODAS' }).find((a) => a.area.id === 'A:saude')!.topics.find((t) => t.topic.id === 't-corrida')!.ideas
    const correr = rows.find((r) => r.idea.id === 'i-correr')!
    expect(correr).toMatchObject({ noteCount: 2, linkCount: 2, needsReview: true })
    expect(rows.find((r) => r.idea.id === 'i-dormir')!.needsReview).toBe(true)
  })

  it('filtros escondem assuntos vazios', () => {
    const guardadas = buildIdeaTree(fixture(), 'A', { show: 'GUARDADAS', nature: 'TODAS' }).find((a) => a.area.id === 'A:saude')!
    expect(guardadas.topics.map((t) => t.topic.name)).toEqual(['Corrida'])
    expect(guardadas.topics[0]!.ideas.map((r) => r.idea.title)).toEqual(['Comprar tênis'])
    const preocupacoes = buildIdeaTree(fixture(), 'A', { show: 'TODAS', nature: 'PREOCUPACAO' }).find((a) => a.area.id === 'A:saude')!
    expect(preocupacoes.topics[0]!.ideas.map((r) => r.idea.title)).toEqual(['Dormir cedo'])
  })

  it('o par não aparece em nada', () => {
    expect(buildIdeaTree(fixture(), 'B').flatMap((a) => a.topics).map((t) => t.topic.name)).toEqual(['Do par'])
  })
})

describe('Caixa de entrada, anotações e ligações', () => {
  it('capturas pendentes e trechos soltos da pessoa, mais novos primeiro', () => {
    const inbox = inboxOf(fixture(), 'A')
    expect(inbox.pending.map((c) => c.id)).toEqual(['c2'])
    expect(inbox.notes.map((n) => n.id)).toEqual(['n-inbox'])
    expect(inbox.count).toBe(2)
  })

  it('linha do tempo da ideia vai da mais antiga para a mais nova', () => {
    expect(notesOf(fixture(), 'A', 'i-correr').map((n) => n.id)).toEqual(['n2', 'n1'])
  })

  it('ligações: sugeridas primeiro, recusadas escondidas, com o sentido', () => {
    const links = linksOf(fixture(), 'A', 'i-correr')
    expect(links.map((l) => [l.link.id, l.other.title, l.outgoing])).toEqual([['l1', 'Dormir cedo', true], ['l2', 'Comprar tênis', false]])
    expect(meshEdges(fixture(), 'A', new Set(['i-correr', 'i-dormir'])).map((l) => l.id)).toEqual(['l1'])
  })
})

describe('layout do mapa', () => {
  it('céu: centro e uma área por posição fixa, dentro do desenho', () => {
    const tree = buildIdeaTree(fixture(), 'A')
    const sky = skyLayout(tree, 600)
    expect(sky.nodes).toHaveLength(1 + tree.length)
    expect(sky.edges).toHaveLength(tree.length)
    for (const n of sky.nodes) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(0)
      expect(n.x + n.r).toBeLessThanOrEqual(600)
    }
    expect(skyLayout(tree, 600)).toEqual(sky) // determinístico
    expect(sky.nodes.find((n) => n.id === 'A:trabalho')!.dashed).toBe(true) // área vazia tracejada
  })

  it('área: assuntos no anel do meio, ideias por fora, provisório e "conferir" tracejados', () => {
    const area = buildIdeaTree(fixture(), 'A').find((a) => a.area.id === 'A:saude')!
    const layout = areaLayout(area, 600)
    const node = (id: string) => layout.nodes.find((n) => n.id === id)!
    const dist = (id: string) => Math.hypot(node(id).x - 300, node(id).y - 300)
    expect(dist('t-corrida')).toBeCloseTo(120, 0)
    expect(dist('i-correr')).toBeCloseTo(240, 0)
    expect(node('t-alimento').dashed).toBe(true)
    expect(node('i-dormir').dashed).toBe(true)
    expect(layout.edges).toContainEqual({ from: 't-corrida', to: 'i-correr' })
    expect(areaLayout(area, 600)).toEqual(layout)
  })

  it('rótulo quebra em até 2 linhas', () => {
    expect(wrapLabel('Correr de manhã')).toEqual(['Correr de', 'manhã'])
    expect(wrapLabel('Um título bem comprido que não cabe no mapa', 10)).toHaveLength(2)
  })
})

describe('captura livre: parece pensamento?', () => {
  it.each([
    ['será que vale a pena trocar de emprego', true],
    ['E se eu mudasse para a praia', true],
    ['acho que preciso descansar mais', true],
    ['quero aprender violão', true],
    ['devo ligar pra ela', false],
    ['vale a pena?', true],
    ['ligar na clínica amanhã', false],
    ['lavar a louça', false],
    ['', false],
  ])('%s -> %s', (text, expected) => {
    expect(looksLikeThought(text)).toBe(expected)
  })
})

