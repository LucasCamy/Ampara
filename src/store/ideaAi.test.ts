import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmpty } from '../domain/seed'
import { ORGANIZER_SCHEMA, ORGANIZER_VERSION, buildOrganizerInput, selectCandidates } from '../domain/ideasPrompt'
import type { AiProvider } from '../ai/provider'

vi.mock('./ui', async () => {
  const { createStore } = await import('./createStore')
  return { uiStore: createStore({ viewer: 'A' }), ui: { toast: vi.fn() } }
})

const { dataStore } = await import('./data')
const { uiStore } = await import('./ui')
const { captureThought, myIdeaMap, organizeManually, undoOrganization } = await import('./ideaActions')
const { describeAiResult, organizePending, organizeWithAi } = await import('./ideaAi')

const iso = '2026-11-23T10:00:00.000Z'
const values = <T,>(m: Record<string, T>) => Object.values(m)
const op = (o: Record<string, unknown>) => ({
  tipo: null, trecho: null, ideia_id: null, assunto_id: null, assunto_ref: null, ref: null, area_id: null, nome: null, titulo: null,
  natureza: null, motivo: null, de_ideia: null, para_ideia: null, tipo_ligacao: null, resumo: null, estado: null, confianca: null, ...o,
})
const fakeProvider = (answer: (input: string) => unknown): AiProvider & { calls: { system: string; input: string; schema: unknown }[] } => {
  const calls: { system: string; input: string; schema: unknown }[] = []
  return {
    id: 'teste', label: 'Teste', calls,
    async runStructured(req) {
      calls.push(req)
      return { json: answer(req.input), provider: 'teste', model: 'modelo-teste' }
    },
  }
}

beforeEach(() => {
  uiStore.set((s) => ({ ...s, viewer: 'A' }))
  dataStore.set(() => buildEmpty(new Date(iso), 'COUPLE'))
})

describe('organizar com IA', () => {
  it('manda o contrato, valida e grava; o aviso diz onde ficou', async () => {
    const id = captureThought('quero correr de manhã e comprar um tênis novo')!
    const provider = fakeProvider(() => ({
      versao: ORGANIZER_VERSION,
      operacoes: [
        op({ tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:saude', nome: 'Corrida', motivo: 'novo tema' }),
        op({ tipo: 'CRIAR_IDEIA', ref: 'c', trecho: 'quero correr de manhã', assunto_ref: 's', titulo: 'Correr de manhã', natureza: 'PLANO', confianca: 0.92 }),
        op({ tipo: 'CRIAR_IDEIA', trecho: 'comprar um tênis novo', assunto_ref: 's', titulo: 'Tênis novo', natureza: 'DESEJO', confianca: 0.85 }),
      ],
    }))
    const r = await organizeWithAi(id, provider)
    expect(provider.calls[0]!.schema).toBe(ORGANIZER_SCHEMA)
    expect(JSON.parse(provider.calls[0]!.input)).toMatchObject({ captura: 'quero correr de manhã e comprar um tênis novo', areas: expect.arrayContaining([{ id: 'A:saude', nome: 'Saúde' }]) })
    expect(values(dataStore.get().ideas).map((i) => i.title).sort()).toEqual(['Correr de manhã', 'Tênis novo'])
    expect(dataStore.get().ideaAiLog[r.logId]).toMatchObject({ provider: 'teste', model: 'modelo-teste', promptVersion: ORGANIZER_VERSION })
    expect(describeAiResult(r)).toBe('Organizei em Saúde › Corrida.')
  })

  it('resposta com erro de formato tenta de novo uma vez; a segunda certa é gravada', async () => {
    const id = captureThought('aprender violão')!
    let calls = 0
    const provider = fakeProvider(() => {
      calls++
      return calls === 1
        ? { versao: ORGANIZER_VERSION, operacoes: [op({ tipo: 'CRIAR_IDEIA', trecho: 'aprender violão', assunto_id: 'inventado', titulo: 'Violão', natureza: 'DESEJO', confianca: 0.9 })] }
        : { versao: ORGANIZER_VERSION, operacoes: [op({ tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:lazer', nome: 'Música' }), op({ tipo: 'CRIAR_IDEIA', trecho: 'aprender violão', assunto_ref: 's', titulo: 'Violão', natureza: 'DESEJO', confianca: 0.9 })] }
    })
    const r = await organizeWithAi(id, provider)
    expect(calls).toBe(2)
    expect(describeAiResult(r)).toBe('Organizei em Lazer e criatividade › Música.')
  })

  it('dúvida de verdade (Caixa de entrada pedida pela IA) não repete', async () => {
    const id = captureThought('hmm sei lá')!
    let calls = 0
    await organizeWithAi(id, fakeProvider(() => { calls++; return { versao: ORGANIZER_VERSION, operacoes: [op({ tipo: 'CAIXA_DE_ENTRADA', trecho: 'hmm sei lá', motivo: 'sem contexto' })] } }))
    expect(calls).toBe(1)
  })

  it('resposta fora do contrato não grava ideia: a captura vai para a Caixa de entrada', async () => {
    const id = captureThought('pensamento qualquer')!
    const r = await organizeWithAi(id, fakeProvider(() => 'não sei'))
    expect(values(dataStore.get().ideas)).toEqual([])
    expect(values(dataStore.get().ideaNotes)).toEqual([expect.objectContaining({ ideaId: null, text: 'pensamento qualquer' })])
    expect(describeAiResult(r)).toBe('A IA não teve certeza. Ficou na Caixa de entrada para você decidir.')
  })

  it('sem provedor explica; captura de outra pessoa ou já organizada é recusada', async () => {
    const id = captureThought('x')!
    await expect(organizeWithAi(id, null)).rejects.toThrow('Nenhuma IA ligada')
    uiStore.set((s) => ({ ...s, viewer: 'B' }))
    await expect(organizeWithAi(id, fakeProvider(() => ({})))).rejects.toThrow('já foi organizado')
  })

  it('erro do provedor deixa a captura pendente para tentar de novo', async () => {
    const id = captureThought('ideia')!
    const failing: AiProvider = { id: 'x', label: 'x', runStructured: () => Promise.reject(new Error('limite da assinatura')) }
    await expect(organizeWithAi(id, failing)).rejects.toThrow('limite da assinatura')
    expect(dataStore.get().ideaCaptures[id]!.status).toBe('PENDENTE')
  })

  it('o mapa enviado é só da pessoa e as candidatas vêm por palavras em comum', () => {
    const a = captureThought('aprender violão')!
    organizeManually({ captureId: a, areaId: 'A:lazer', newTopicName: 'Música', newIdea: { title: 'Aprender violão', nature: 'DESEJO' } })
    const b = captureThought('correr')!
    organizeManually({ captureId: b, areaId: 'A:saude', newTopicName: 'Corrida', newIdea: { title: 'Correr', nature: 'PLANO' } })
    uiStore.set((s) => ({ ...s, viewer: 'B' }))
    captureThought('pensamento do par')
    const map = myIdeaMap(dataStore.get(), 'A')
    const cands = selectCandidates(map, values(dataStore.get().ideaNotes), 'comprar cordas para o violão', 1)
    expect(cands.map((i) => i.title)).toEqual(['Aprender violão'])
    const input = JSON.parse(buildOrganizerInput('x', map, cands)) as { areas: { id: string }[] }
    expect(input.areas.every((x) => x.id.startsWith('A:'))).toBe(true)
  })

  it('o esquema pede todas as chaves e nenhuma a mais em cada operação', () => {
    const item = ORGANIZER_SCHEMA.properties.operacoes.items
    expect(item.additionalProperties).toBe(false)
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort())
  })
})

describe('organizar sozinho o que ficou esperando', () => {
  const answer = (input: string) => {
    const captura = (JSON.parse(input) as { captura: string }).captura
    return { versao: ORGANIZER_VERSION, operacoes: [
      op({ tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:lazer', nome: captura.split(' ').slice(-2).join(' '), motivo: 'novo' }),
      op({ tipo: 'CRIAR_IDEIA', trecho: captura, assunto_ref: 's', titulo: 'Ideia ' + captura.slice(0, 20), natureza: 'PLANO', confianca: 0.9 }),
    ] }
  }

  it('organiza o que nenhuma IA pegou e não mexe no que a pessoa desfez', async () => {
    const undone = captureThought('aprender a tocar violão')!
    const r = await organizeWithAi(undone, fakeProvider(answer))
    undoOrganization(r.logId)
    expect(dataStore.get().ideaCaptures[undone]!.status).toBe('PENDENTE')
    const a = captureThought('comprar um teclado usado')!
    const b = captureThought('montar uma banda com amigos')!
    const provider = fakeProvider(answer)
    expect(await organizePending(provider)).toBe(2)
    expect(provider.calls.map((c) => (JSON.parse(c.input) as { captura: string }).captura)).toEqual(['comprar um teclado usado', 'montar uma banda com amigos'])
    expect(dataStore.get().ideaCaptures[a]!.status).toBe('ORGANIZADA')
    expect(dataStore.get().ideaCaptures[b]!.status).toBe('ORGANIZADA')
    expect(dataStore.get().ideaCaptures[undone]!.status).toBe('PENDENTE')
  })

  it('IA ainda fora: para no primeiro erro e deixa tudo guardado; sem IA não faz nada', async () => {
    captureThought('aprender violão')
    captureThought('comprar um teclado')
    const broken: AiProvider = { id: 'x', label: 'x', runStructured: vi.fn(async () => { throw new Error('PC desligado') }) }
    expect(await organizePending(broken)).toBe(0)
    expect(broken.runStructured).toHaveBeenCalledTimes(1)
    expect(values(dataStore.get().ideaCaptures).every((c) => c.status === 'PENDENTE')).toBe(true)
    expect(await organizePending(null)).toBe(0)
  })
})
