import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmpty } from '../domain/seed'
import { ASK_SCHEMA, ASK_VERSION, buildAskInput, checkAnswer, filtersFromQuestion, sameFamily, searchNotes } from '../domain/ideasAsk'
import type { AiProvider } from '../ai/provider'

vi.mock('./ui', async () => {
  const { createStore } = await import('./createStore')
  return { uiStore: createStore({ viewer: 'A' }), ui: { toast: vi.fn() } }
})

const { dataStore } = await import('./data')
const { uiStore } = await import('./ui')
const { captureThought, organizeManually, sendCaptureToInbox } = await import('./ideaActions')
const { askIdeas } = await import('./ideaAi')

const TODAY = '2026-11-23'
const values = <T,>(m: Record<string, T>) => Object.values(m)

/** Pensamentos de A organizados à mão, com datas controladas. */
function seed() {
  dataStore.set(() => buildEmpty(new Date('2026-11-23T10:00:00.000Z'), 'COUPLE'))
  const put = (text: string, area: string, topic: string, title: string, nature: 'PLANO' | 'PREOCUPACAO' | 'DESEJO', day: string) => {
    const c = captureThought(text)!
    const existing = values(dataStore.get().ideaTopics).find((t) => t.name === topic)
    const ideaExisting = values(dataStore.get().ideas).find((i) => i.title === title)
    organizeManually({ captureId: c, areaId: area, ...(existing ? { topicId: existing.id } : { newTopicName: topic }), ...(ideaExisting ? { ideaId: ideaExisting.id } : { newIdea: { title, nature } }) })
    const n = values(dataStore.get().ideaNotes).find((x) => x.captureId === c)!
    dataStore.set((s) => ({ ...s, ideaNotes: { ...s.ideaNotes, [n.id]: { ...n, createdAt: `${day}T12:00:00.000Z` } } }))
  }
  put('quero voltar a correr de manhã', 'A:saude', 'Corrida', 'Voltar a correr', 'PLANO', '2026-11-02')
  put('correndo 3 vezes por semana já ajudaria', 'A:saude', 'Corrida', 'Voltar a correr', 'PLANO', '2026-11-20')
  put('tenho medo de não pagar o cartão', 'A:dinheiro', 'Contas', 'Cartão de crédito', 'PREOCUPACAO', '2026-11-21')
  put('medo de perder o prazo do curso', 'A:estudos', 'Curso', 'Prazo do curso', 'PREOCUPACAO', '2026-10-10')
  put('queria morar perto do mar', 'A:casa', 'Mudança', 'Morar perto do mar', 'DESEJO', '2026-11-22')
  // trecho solto na Caixa de entrada também entra na busca
  const loose = captureThought('pensar em correr uma prova de 5 km')!
  sendCaptureToInbox(loose, 'sem IA')
}

beforeEach(() => {
  uiStore.set((s) => ({ ...s, viewer: 'A' }))
  seed()
})

describe('busca local nas anotações', () => {
  it('acha por palavra parecida (correr, correndo, corrida), sem acento, inclusive na Caixa de entrada', () => {
    const { found } = searchNotes(dataStore.get(), 'A', 'o que eu já falei sobre CORRIDA?', TODAY)
    expect(found.map((f) => f.note.text).sort()).toEqual(['correndo 3 vezes por semana já ajudaria', 'pensar em correr uma prova de 5 km', 'quero voltar a correr de manhã'])
    expect(found.find((f) => f.note.text.startsWith('pensar'))!.idea).toBeNull()
  })

  it('lê tipo e período na pergunta: "preocupações deste mês" traz só as de novembro', () => {
    const f = filtersFromQuestion('quais preocupações eu tive este mês?', dataStore.get(), 'A', TODAY)
    expect(f).toEqual({ nature: 'PREOCUPACAO', since: '2026-11-01', areaIds: [] })
    const { found } = searchNotes(dataStore.get(), 'A', 'quais preocupações eu tive este mês?', TODAY)
    expect(found.map((x) => x.note.text)).toEqual(['tenho medo de não pagar o cartão'])
  })

  it('filtra por área citada pelo nome e por "esta semana"', () => {
    expect(filtersFromQuestion('o que anotei em saúde esta semana?', dataStore.get(), 'A', TODAY)).toMatchObject({ areaIds: ['A:saude'], since: '2026-11-17' })
    expect(searchNotes(dataStore.get(), 'A', 'o que anotei em saúde esta semana?', TODAY).found.map((x) => x.note.text)).toEqual(['correndo 3 vezes por semana já ajudaria'])
  })

  it('nada do par e nada sem relação', () => {
    expect(searchNotes(dataStore.get(), 'B', 'correr', TODAY).found).toEqual([])
    expect(searchNotes(dataStore.get(), 'A', 'xadrez', TODAY).found).toEqual([])
  })

  it('a entrada da IA leva só as anotações encontradas, com id, ideia, área e dia', () => {
    const { found } = searchNotes(dataStore.get(), 'A', 'cartão', TODAY)
    expect(JSON.parse(buildAskInput('cartão?', found, TODAY))).toEqual({ pergunta: 'cartão?', hoje: TODAY, anotacoes: [{ id: found[0]!.note.id, ideia: 'Cartão de crédito', area: 'Dinheiro', dia: '2026-11-21', texto: 'tenho medo de não pagar o cartão' }] })
    expect([...ASK_SCHEMA.required].sort()).toEqual(Object.keys(ASK_SCHEMA.properties).sort())
  })
})

describe('resposta conferida', () => {
  it('fonte inventada é descartada e a frase fica "sem fonte"; versão errada não vale', () => {
    const a = checkAnswer({ versao: ASK_VERSION, sem_resposta: false, frases: [{ texto: 'Você quer correr de manhã.', fontes: ['n1', 'inventada', 'n1'] }, { texto: 'E nadar.', fontes: ['x'] }] }, new Set(['n1']))
    expect(a).toEqual({ ok: true, noAnswer: false, sentences: [{ text: 'Você quer correr de manhã.', sources: ['n1'] }, { text: 'E nadar.', sources: [] }] })
    expect(checkAnswer({ versao: 'outra', frases: [] }, new Set()).ok).toBe(false)
    expect(checkAnswer({ versao: ASK_VERSION, sem_resposta: true, frases: [{ texto: 'Não achei nada sobre isso.', fontes: [] }] }, new Set()).noAnswer).toBe(true)
  })
})

describe('askIdeas', () => {
  it('manda só as encontradas, confere as citações e não grava nada', async () => {
    const before = dataStore.get()
    let sent = ''
    const provider: AiProvider = {
      id: 't', label: 't',
      runStructured: async (req) => {
        sent = req.input
        const ids = (JSON.parse(req.input) as { anotacoes: { id: string }[] }).anotacoes.map((n) => n.id)
        return { provider: 't', model: 'm', json: { versao: ASK_VERSION, sem_resposta: false, frases: [{ texto: 'Você quer voltar a correr de manhã.', fontes: [ids[0]] }] } }
      },
    }
    const r = await askIdeas('o que falei sobre correr?', TODAY, provider)
    expect(r.found).toHaveLength(3)
    expect(r.answer!.sentences[0]!.sources).toEqual([r.found[0]!.note.id])
    expect(JSON.parse(sent).anotacoes).toHaveLength(3)
    expect(dataStore.get()).toBe(before)
  })

  it('sem IA (ou sem nada encontrado) só devolve a busca; pergunta vazia explica', async () => {
    expect((await askIdeas('correr', TODAY, null)).answer).toBeNull()
    const calls: string[] = []
    const provider: AiProvider = { id: 't', label: 't', runStructured: async (req) => { calls.push(req.input); return { json: {}, provider: 't', model: 'm' } } }
    expect((await askIdeas('xadrez', TODAY, provider)).answer).toBeNull()
    expect(calls).toEqual([])
    await expect(askIdeas('   ', TODAY, null)).rejects.toThrow('Escreva o que você quer saber.')
  })
})

describe('família de palavras', () => {
  it.each([
    ['correr', 'corrida', true], ['correndo', 'correr', true], ['cartao', 'cartoes', true],
    ['casa', 'casamento', false], ['mar', 'mares', false], ['curso', 'cursinho', true], ['prazo', 'praia', false],
  ])('%s ~ %s -> %s', (a, b, expected) => expect(sameFamily(a, b)).toBe(expected))
})


describe('perguntar com sentido (ADR-0012)', () => {
  it('acha a anotação de mesmo sentido mesmo sem palavra em comum', () => {
    const c = captureThought('trotei dez minutos na praça')!
    const data = dataStore.get()
    expect(searchNotes(data, 'A', 'o que eu pensei sobre exercício?', TODAY).found).toHaveLength(0)
    const found = searchNotes(data, 'A', 'o que eu pensei sobre exercício?', TODAY, undefined, new Map([[c, 0.5]])).found
    expect(found.map((f) => f.note.id)).toEqual([c])
    // sentido fraco não entra
    expect(searchNotes(data, 'A', 'o que eu pensei sobre exercício?', TODAY, undefined, new Map([[c, 0.3]])).found).toHaveLength(0)
  })
})
