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
const { captureThought, myIdeaMap, moveNote, organizeManually, scheduleFromProposal, undoOrganization } = await import('./ideaActions')
const { describeAiResult, organizePending, organizeWithAi, proposeSchedule, queueOrganize, sequenceBefore } = await import('./ideaAi')

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

describe('fila por trás e sequência (ADR-0012)', () => {
  const at = (id: string, when: string) => dataStore.set((s) => ({ ...s, ideaCaptures: { ...s.ideaCaptures, [id]: { ...s.ideaCaptures[id]!, createdAt: when } } }))
  const place = (input: string) => {
    const captura = (JSON.parse(input) as { captura: string }).captura
    return { versao: ORGANIZER_VERSION, operacoes: [
      op({ tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:saude', nome: captura.slice(0, 20), motivo: 'novo' }),
      op({ tipo: 'CRIAR_IDEIA', trecho: captura, assunto_ref: 's', titulo: captura.slice(0, 30), natureza: 'PLANO', confianca: 0.9 }),
    ] }
  }

  it('pensamentos em sequência vão como contexto; um intervalo longo corta a sequência', async () => {
    const old = captureThought('pensamento antigo de ontem')!
    const a = captureThought('quero voltar a correr')!
    const b = captureThought('e comprar um tênis também')!
    at(old, '2026-11-23T08:00:00.000Z')
    at(a, '2026-11-23T10:00:00.000Z')
    at(b, '2026-11-23T10:02:00.000Z')
    expect(sequenceBefore(dataStore.get(), dataStore.get().ideaCaptures[b]!).map((c) => c.id)).toEqual([a])
    const provider = fakeProvider(place)
    await organizeWithAi(b, provider)
    expect(JSON.parse(provider.calls[0]!.input).dito_pouco_antes_so_para_entender).toEqual(['quero voltar a correr'])
    expect(JSON.parse(provider.calls[0]!.input).captura).toBe('e comprar um tênis também')
  })

  it('a fila atende um por vez, na ordem', async () => {
    const order: string[] = []
    let running = 0
    const provider: AiProvider = {
      id: 'lento', label: 'lento',
      async runStructured(req) {
        running++
        expect(running).toBe(1)
        order.push((JSON.parse(req.input) as { captura: string }).captura)
        await new Promise((r) => setTimeout(r, 5))
        running--
        return { json: place(req.input), provider: 'lento', model: 'm' }
      },
    }
    const a = captureThought('aprender violão')!
    const b = captureThought('montar uma horta')!
    await Promise.all([queueOrganize(a, provider), queueOrganize(b, provider)])
    expect(order).toEqual(['aprender violão', 'montar uma horta'])
  })

  it('mover uma anotação muda o mapa (e os exemplos da IA) e pode desfazer', async () => {
    const id = captureThought('correr no parque')!
    await organizeWithAi(id, fakeProvider(place))
    const other = captureThought('nadar no clube')!
    await organizeWithAi(other, fakeProvider(place))
    const note = values(dataStore.get().ideaNotes).find((n) => n.text === 'correr no parque')!
    const target = values(dataStore.get().ideaNotes).find((n) => n.text === 'nadar no clube')!.ideaId!
    const r = moveNote(note.id, target)
    expect(r.ok).toBe(true)
    expect(dataStore.get().ideaNotes[note.id]!.ideaId).toBe(target)
    if (r.ok) r.undo?.()
    expect(dataStore.get().ideaNotes[note.id]!.ideaId).toBe(note.ideaId)
    expect(moveNote('nada', target).ok).toBe(false)
  })
})

describe('marcar pela barra (ADR-0014)', () => {
  const place = (input: string) => {
    const captura = (JSON.parse(input) as { captura: string }).captura
    return { versao: ORGANIZER_VERSION, operacoes: [
      op({ tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:saude', nome: 'Dentista', motivo: 'novo' }),
      op({ tipo: 'CRIAR_IDEIA', trecho: captura, assunto_ref: 's', titulo: 'Dentista da família', natureza: 'OBSERVACAO', confianca: 0.9 }),
    ] }
  }

  it('completa com a anotação, cria o compromisso ligado à ideia e desfaz', async () => {
    const c = captureThought('minha dentista é a Dra. Paula, fica na Rua das Flores, 120')!
    await organizeWithAi(c, fakeProvider(place))
    const provider = fakeProvider((input) => {
      const { anotacoes } = JSON.parse(input) as { anotacoes: { n: number; texto: string }[] }
      const n = anotacoes.find((a) => a.texto.includes('Rua das Flores'))!.n
      return { versao: 'agendar@1', titulo: 'Dentista com Dra. Paula', titulo_fonte: n, local: 'Rua das Flores, 120', local_fonte: n, observacao: null, observacao_fonte: null }
    })
    const offer = (await proposeSchedule('amanhã tenho dentista às 18h', '2026-11-25', provider))!
    expect(offer.proposal).toMatchObject({ kind: 'EVENT', title: 'Dentista com Dra. Paula', location: 'Rua das Flores, 120', date: '2026-11-26', start: '18:00' })
    expect(offer.sourceLabel).toBe('Dentista › Dentista da família')

    const r = scheduleFromProposal(offer.proposal)
    expect(r.ok).toBe(true)
    const ev = dataStore.get().events[(r as { targetId: string }).targetId]!
    expect(ev).toMatchObject({ title: 'Dentista com Dra. Paula', location: 'Rua das Flores, 120', date: '2026-11-26', start: '18:00', end: '19:00', ownerId: 'A' })
    const action = values(dataStore.get().ideaActions).find((a) => a.targetId === ev.id)!
    expect(action.targetType).toBe('EVENT')
    // a ideia não muda de estado: é informação, não um plano que virou ação
    expect(dataStore.get().ideas[action.ideaId]!.state).toBe('SOLTA')
    if (r.ok) r.undo()
    expect(dataStore.get().events[ev.id]).toBeUndefined()
  })

  it('sem dia: não é proposta; IA fora do ar: proposta só do código', async () => {
    expect(await proposeSchedule('quero aprender violão', '2026-11-25')).toBeNull()
    const broken: AiProvider = { id: 'x', label: 'x', runStructured: async () => { throw new Error('fora') } }
    const offer = (await proposeSchedule('pagar a luz até sexta', '2026-11-25', broken))!
    expect(offer.proposal).toMatchObject({ kind: 'TASK', title: 'Pagar a luz', date: '2026-11-27' })
    const r = scheduleFromProposal(offer.proposal)
    const task = dataStore.get().tasks[(r as { targetId: string }).targetId]!
    expect(task).toMatchObject({ title: 'Pagar a luz', dueDate: '2026-11-27', assignedTo: 'A', visibleToPartner: false })
  })
})
