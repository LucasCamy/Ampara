import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmpty } from '../domain/seed'
import { validateOrganization } from '../domain/ideasValidate'
import { purgeUnauthorized } from '../domain/merge'

vi.mock('./ui', async () => {
  const { createStore } = await import('./createStore')
  return { uiStore: createStore({ viewer: 'A' }), ui: { toast: vi.fn() } }
})

const { dataStore } = await import('./data')
const { uiStore } = await import('./ui')
const { applyOrganization, captureThought, confirmTopic, deletePendingCapture, discardInboxNote, ensureIdeaAreas, markIdeaReviewed, myIdeaMap, organizeManually, sendCaptureToInbox, setLinkState, undoOrganization, updateIdea } = await import('./ideaActions')

const iso = '2026-11-23T10:00:00.000Z'
const META = { provider: 'teste', model: 'modelo-x', promptVersion: 'organizador@1' }
const state = () => dataStore.get()
const values = <T,>(m: Record<string, T>) => Object.values(m)

beforeEach(() => {
  uiStore.set((s) => ({ ...s, viewer: 'A' }))
  dataStore.set(() => buildEmpty(new Date(iso), 'COUPLE'))
})

/** Organiza uma captura como a IA faria, passando pelo validador de verdade. */
function organize(captureId: string, operacoes: unknown[]) {
  const capture = state().ideaCaptures[captureId]!
  const result = validateOrganization(capture.text, { versao: 'organizador@1', operacoes }, myIdeaMap(state(), 'A'))
  return applyOrganization(captureId, result, META)
}

describe('soltar um pensamento', () => {
  it('grava a captura na hora, com espaços normalizados, e cria as 8 Áreas da pessoa uma vez', () => {
    const id = captureThought('  quero   correr\nde manhã ', 'VOZ')!
    captureThought('outra coisa')
    const capture = state().ideaCaptures[id]!
    expect(capture).toMatchObject({ text: 'quero correr de manhã', source: 'VOZ', status: 'PENDENTE', ownerId: 'A' })
    expect(values(state().ideaAreas).map((a) => a.id)).toEqual(['A:trabalho', 'A:estudos', 'A:saude', 'A:casa', 'A:dinheiro', 'A:relacoes', 'A:projetos', 'A:lazer'])
    expect(state().outbox.some((e) => e.entityType === 'ideaCaptures' && e.entityId === id)).toBe(true)
  })

  it('pensamento vazio não grava nada', () => {
    expect(captureThought('   ')).toBeNull()
    expect(values(state().ideaCaptures)).toEqual([])
  })

  it('cada pessoa tem suas Áreas', () => {
    ensureIdeaAreas('A')
    ensureIdeaAreas('B')
    expect(values(state().ideaAreas).filter((a) => a.ownerId === 'B')).toHaveLength(8)
  })

  it('sem IA, a captura inteira vai para a Caixa de entrada', () => {
    const id = captureThought('ligar pro dentista')!
    expect(sendCaptureToInbox(id, 'sem provedor de IA')).toBe(true)
    expect(values(state().ideaNotes)).toEqual([expect.objectContaining({ ideaId: null, text: 'ligar pro dentista', inboxReason: 'sem provedor de IA' })])
    expect(state().ideaCaptures[id]!.status).toBe('CAIXA')
    expect(sendCaptureToInbox(id, 'de novo')).toBe(false)
  })
})

describe('aplicar a organização validada', () => {
  it('cria assunto provisório, ideias, anotações literais, ligação sugerida e registro', () => {
    const id = captureThought('quero ir para Floripa e preciso juntar 3 mil')!
    const logId = organize(id, [
      { tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:lazer', nome: 'Viagens', motivo: 'novo tema' },
      { tipo: 'CRIAR_IDEIA', ref: 'v', trecho: 'quero ir para Floripa', assunto_ref: 's', titulo: 'Ir para Floripa', natureza: 'DESEJO', confianca: 0.9 },
      { tipo: 'CRIAR_IDEIA', ref: 'd', trecho: 'preciso juntar 3 mil', assunto_ref: 's', titulo: 'Juntar 3 mil', natureza: 'PLANO', confianca: 0.7 },
      { tipo: 'SUGERIR_LIGACAO', de_ideia: 'v', para_ideia: 'd', tipo_ligacao: 'DEPENDE_DE', motivo: 'a viagem precisa do dinheiro', confianca: 0.9 },
      { tipo: 'ATUALIZAR_RESUMO', ideia_id: 'v', resumo: 'Viajar para Floripa.' },
    ])!
    const topics = values(state().ideaTopics)
    expect(topics).toEqual([expect.objectContaining({ name: 'Viagens', areaId: 'A:lazer', firm: false, origin: 'IA', ownerId: 'A' })])
    const ideas = values(state().ideas)
    expect(ideas.map((i) => [i.title, i.state, i.needsReview, i.summary])).toEqual([
      ['Ir para Floripa', 'SOLTA', false, 'Viajar para Floripa.'],
      ['Juntar 3 mil', 'SOLTA', true, ''],
    ])
    expect(values(state().ideaNotes).map((n) => n.text)).toEqual(['quero ir para Floripa', 'preciso juntar 3 mil'])
    expect(values(state().ideaLinks)).toEqual([expect.objectContaining({ type: 'DEPENDE_DE', state: 'SUGERIDA', origin: 'IA' })])
    expect(state().ideaCaptures[id]!.status).toBe('ORGANIZADA')
    const log = state().ideaAiLog[logId]!
    expect(log).toMatchObject({ provider: 'teste', model: 'modelo-x', promptVersion: 'organizador@1', undone: false })
  })

  it('não aplica duas vezes nem aplica o resultado de outra captura', () => {
    const id = captureThought('aprender violão')!
    const other = captureThought('outra captura')!
    const wrong = validateOrganization('outra captura', { versao: 'organizador@1', operacoes: [] }, myIdeaMap(state(), 'A'))
    expect(applyOrganization(id, wrong, META)).toBeNull()
    expect(organize(id, [])).not.toBeNull()
    expect(organize(id, [])).toBeNull()
    expect(other).toBeTruthy()
  })

  it('o que a IA não encaixou vai para a Caixa de entrada; sem nada encaixado a captura fica como CAIXA', () => {
    const id = captureThought('comprar tênis e marcar médico')!
    organize(id, [{ tipo: 'CRIAR_IDEIA', trecho: 'comprar tênis', assunto_id: 'nao-existe', titulo: 'Tênis', natureza: 'PLANO', confianca: 0.9 }])
    expect(values(state().ideaNotes)).toEqual([expect.objectContaining({ ideaId: null, text: 'comprar tênis e marcar médico' })])
    expect(state().ideaCaptures[id]!.status).toBe('CAIXA')
  })

  it('segunda anotação amadurece a ideia; voltar a falar de uma guardada também', () => {
    const first = captureThought('correr de manhã')!
    organize(first, [{ tipo: 'CRIAR_IDEIA', trecho: 'correr de manhã', assunto_id: undefined, assunto_ref: 's', titulo: 'Correr', natureza: 'PLANO', confianca: 0.9 },
      { tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:saude', nome: 'Corrida', motivo: 'x' }])
    const idea = values(state().ideas)[0]!
    const second = captureThought('correr 3 vezes por semana')!
    organize(second, [{ tipo: 'ANEXAR', trecho: 'correr 3 vezes por semana', ideia_id: idea.id, confianca: 0.9 }])
    expect(state().ideas[idea.id]!.state).toBe('AMADURECENDO')

    dataStore.set((s) => ({ ...s, ideas: { ...s.ideas, [idea.id]: { ...s.ideas[idea.id]!, state: 'GUARDADA' } } }))
    const third = captureThought('voltei a pensar em correr')!
    organize(third, [{ tipo: 'ANEXAR', trecho: 'voltei a pensar em correr', ideia_id: idea.id, confianca: 0.9 }])
    expect(state().ideas[idea.id]!.state).toBe('AMADURECENDO')
  })

  it('sugestão de estado fica só no registro: a IA não muda o estado sozinha', () => {
    const id = captureThought('correr')!
    organize(id, [{ tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:saude', nome: 'Corrida', motivo: 'x' },
      { tipo: 'CRIAR_IDEIA', trecho: 'correr', assunto_ref: 's', titulo: 'Correr', natureza: 'PLANO', confianca: 0.9 }])
    const idea = values(state().ideas)[0]!
    const id2 = captureThought('nem sei mais')!
    const logId = organize(id2, [{ tipo: 'SUGERIR_ESTADO', ideia_id: idea.id, estado: 'GUARDADA', motivo: 'parece parada' }])!
    expect(state().ideas[idea.id]!.state).toBe('SOLTA')
    expect((state().ideaAiLog[logId]!.result as { suggestions: unknown[] }).suggestions).toEqual([{ kind: 'SUGERIR_ESTADO', ideaId: idea.id, state: 'GUARDADA', reason: 'parece parada' }])
  })

  it('assunto provisório fica firme com 3 ideias', () => {
    const id = captureThought('correr. nadar. pedalar')!
    organize(id, [
      { tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:saude', nome: 'Exercício', motivo: 'x' },
      ...['correr.', 'nadar.', 'pedalar'].map((t, i) => ({ tipo: 'CRIAR_IDEIA', trecho: t, assunto_ref: 's', titulo: `Ideia ${i}`, natureza: 'PLANO', confianca: 0.9 })),
    ])
    expect(values(state().ideaTopics)[0]!.firm).toBe(true)
  })
})

describe('desfazer e privacidade', () => {
  it('desfazer remove o que foi criado, devolve o resumo anterior e deixa a captura PENDENTE', () => {
    const first = captureThought('aprender violão')!
    organize(first, [{ tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:lazer', nome: 'Música', motivo: 'x' },
      { tipo: 'CRIAR_IDEIA', trecho: 'aprender violão', assunto_ref: 's', titulo: 'Violão', natureza: 'DESEJO', confianca: 0.9 },
      { tipo: 'ATUALIZAR_RESUMO', ideia_id: 'x', resumo: 'ignorado' }])
    const idea = values(state().ideas)[0]!
    dataStore.set((s) => ({ ...s, ideas: { ...s.ideas, [idea.id]: { ...idea, summary: 'Resumo antigo.' } } }))

    const second = captureThought('comprar um violão usado')!
    const logId = organize(second, [
      { tipo: 'ANEXAR', trecho: 'comprar um violão usado', ideia_id: idea.id, confianca: 0.9 },
      { tipo: 'ATUALIZAR_RESUMO', ideia_id: idea.id, resumo: 'Resumo novo.' },
    ])!
    expect(state().ideas[idea.id]).toMatchObject({ summary: 'Resumo novo.', state: 'AMADURECENDO' })

    expect(undoOrganization(logId)).toBe(true)
    expect(state().ideas[idea.id]).toMatchObject({ summary: 'Resumo antigo.', state: 'SOLTA' })
    expect(state().ideas[idea.id]!.updatedAt > iso).toBe(true)
    expect(values(state().ideaNotes).map((n) => n.text)).toEqual(['aprender violão'])
    expect(state().ideaCaptures[second]!.status).toBe('PENDENTE')
    expect(state().ideaAiLog[logId]!.undone).toBe(true)
    expect(undoOrganization(logId)).toBe(false)
    // a captura volta a poder ser organizada
    expect(organize(second, [])).not.toBeNull()
  })

  it('o par não aplica, não desfaz e não vê as ideias de quem escreveu', () => {
    const id = captureThought('pensamento só meu')!
    uiStore.set((s) => ({ ...s, viewer: 'B' }))
    expect(organize(id, [])).toBeNull()
    expect(sendCaptureToInbox(id, 'x')).toBe(false)
    expect(myIdeaMap(state(), 'B').areas).toEqual([])
    // aparelho de uma pessoa só: as ideias do par nunca ficam aqui
    const purged = purgeUnauthorized(state(), 'B')
    expect(values(purged.ideaCaptures)).toEqual([])
    expect(values(purged.ideaAreas)).toEqual([])
    expect(purged.outbox.some((e) => e.entityType === 'ideaCaptures')).toBe(false)
  })
})

describe('organizar à mão (sem IA)', () => {

  it('cria assunto firme e ideia nova com a captura inteira como anotação; Desfazer volta tudo', () => {
    const id = captureThought('quero correr de manhã')!
    const r = organizeManually({ captureId: id, areaId: 'A:saude', newTopicName: 'Corrida', newIdea: { title: 'Correr de manhã', nature: 'PLANO' } })
    expect(r.ok).toBe(true)
    expect(values(state().ideaTopics)).toEqual([expect.objectContaining({ name: 'Corrida', firm: true, origin: 'PESSOA' })])
    const idea = values(state().ideas)[0]!
    expect(idea).toMatchObject({ title: 'Correr de manhã', nature: 'PLANO', state: 'SOLTA' })
    expect(values(state().ideaNotes)).toEqual([expect.objectContaining({ ideaId: idea.id, text: 'quero correr de manhã', startPos: 0, endPos: 21 })])
    expect(state().ideaCaptures[id]!.status).toBe('ORGANIZADA')
    if (r.ok) r.undo()
    expect(values(state().ideas)).toEqual([])
    expect(values(state().ideaTopics)).toEqual([])
    expect(state().ideaCaptures[id]).toMatchObject({ status: 'PENDENTE' })
    expect(state().ideaCaptures[id]!.updatedAt > iso).toBe(true)
  })

  it('trecho da Caixa de entrada vai para uma ideia que já existe e ela amadurece', () => {
    const first = captureThought('correr')!
    organizeManually({ captureId: first, areaId: 'A:saude', newTopicName: 'Corrida', newIdea: { title: 'Correr', nature: 'PLANO' } })
    const idea = values(state().ideas)[0]!
    const topic = values(state().ideaTopics)[0]!
    const second = captureThought('correr 3 vezes por semana')!
    sendCaptureToInbox(second, 'sem IA')
    const inboxNote = values(state().ideaNotes).find((n) => n.ideaId === null)!
    const r = organizeManually({ noteId: inboxNote.id, areaId: 'A:saude', topicId: topic.id, ideaId: idea.id })
    expect(r.ok).toBe(true)
    expect(state().ideaNotes[inboxNote.id]).toMatchObject({ ideaId: idea.id, inboxReason: null })
    expect(state().ideas[idea.id]!.state).toBe('AMADURECENDO')
  })

  it.each([
    [{ areaId: 'A:nao-existe', newTopicName: 'x', newIdea: { title: 'x', nature: 'PLANO' as const } }, 'Escolha uma área.'],
    [{ areaId: 'A:saude', newIdea: { title: 'x', nature: 'PLANO' as const } }, 'Escolha um assunto ou crie um novo.'],
    [{ areaId: 'A:saude', newTopicName: 'x'.repeat(41), newIdea: { title: 'x', nature: 'PLANO' as const } }, 'Use até 40 letras no nome do assunto.'],
    [{ areaId: 'A:saude', newTopicName: 'Corrida' }, 'Escreva o nome da ideia.'],
  ])('recusa escolhas inválidas sem gravar nada (%#)', (input, error) => {
    const id = captureThought('pensamento')!
    expect(organizeManually({ captureId: id, ...input })).toEqual({ ok: false, error })
    expect(values(state().ideas)).toEqual([])
    expect(state().ideaCaptures[id]!.status).toBe('PENDENTE')
  })

  it('não repete nome de assunto na área e respeita 12 assuntos', () => {
    for (let i = 0; i < 12; i++) {
      const c = captureThought(`pensamento ${i}`)!
      expect(organizeManually({ captureId: c, areaId: 'A:lazer', newTopicName: `Assunto ${i}`, newIdea: { title: `Ideia ${i}`, nature: 'DESEJO' } }).ok).toBe(true)
    }
    const c = captureThought('mais um')!
    expect(organizeManually({ captureId: c, areaId: 'A:lazer', newTopicName: 'ASSUNTO 3', newIdea: { title: 'x', nature: 'DESEJO' } })).toEqual({ ok: false, error: 'Já existe um assunto com esse nome nesta área.' })
    expect(organizeManually({ captureId: c, areaId: 'A:lazer', newTopicName: 'Décimo terceiro', newIdea: { title: 'x', nature: 'DESEJO' } })).toEqual({ ok: false, error: 'Esta área já tem 12 assuntos. Junte ou arquive algum antes.' })
  })

  it('editar ideia: nome, tipo, estado e assunto; "virou ação" não é editável aqui', () => {
    const c = captureThought('violão')!
    organizeManually({ captureId: c, areaId: 'A:lazer', newTopicName: 'Música', newIdea: { title: 'Violão', nature: 'DESEJO' } })
    const idea = values(state().ideas)[0]!
    const r = updateIdea(idea.id, { title: 'Aprender violão', state: 'GUARDADA', summary: 'Um dia.' })
    expect(r.ok).toBe(true)
    expect(state().ideas[idea.id]).toMatchObject({ title: 'Aprender violão', state: 'GUARDADA', summary: 'Um dia.' })
    expect(updateIdea(idea.id, { title: '  ' })).toEqual({ ok: false, error: 'Escreva um nome com até 80 letras.' })
    if (r.ok) r.undo()
    expect(state().ideas[idea.id]).toMatchObject({ title: 'Violão', state: 'SOLTA' })
  })

  it('ligações: aceitar fica sólida, recusar some; conferir limpa as marcas; confirmar assunto provisório', () => {
    const id = captureThought('correr e dormir cedo')!
    organize(id, [
      { tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:saude', nome: 'Sono', motivo: 'x' },
      { tipo: 'CRIAR_IDEIA', ref: 'a', trecho: 'correr', assunto_ref: 's', titulo: 'Correr', natureza: 'PLANO', confianca: 0.7 },
      { tipo: 'CRIAR_IDEIA', ref: 'b', trecho: 'dormir cedo', assunto_ref: 's', titulo: 'Dormir cedo', natureza: 'PLANO', confianca: 0.9 },
      { tipo: 'SUGERIR_LIGACAO', de_ideia: 'a', para_ideia: 'b', tipo_ligacao: 'DEPENDE_DE', motivo: 'acordar cedo', confianca: 0.9 },
    ])
    const link = values(state().ideaLinks)[0]!
    expect(setLinkState(link.id, 'CONFIRMADA').ok).toBe(true)
    expect(state().ideaLinks[link.id]!.state).toBe('CONFIRMADA')
    expect(setLinkState(link.id, 'RECUSADA').ok).toBe(true)
    expect(state().ideaLinks[link.id]!.state).toBe('RECUSADA')

    const correr = values(state().ideas).find((i) => i.title === 'Correr')!
    expect(correr.needsReview).toBe(true)
    markIdeaReviewed(correr.id)
    expect(state().ideas[correr.id]!.needsReview).toBe(false)
    expect(values(state().ideaNotes).filter((n) => n.ideaId === correr.id).every((n) => !n.needsReview)).toBe(true)

    const topic = values(state().ideaTopics)[0]!
    expect(topic.firm).toBe(false)
    confirmTopic(topic.id)
    expect(state().ideaTopics[topic.id]!.firm).toBe(true)
  })

  it('apagar pensamento pendente e tirar trecho da Caixa de entrada, com Desfazer', () => {
    const id = captureThought('bobagem')!
    const r = deletePendingCapture(id)
    expect(state().ideaCaptures[id]).toBeUndefined()
    if (r.ok) r.undo()
    expect(state().ideaCaptures[id]!.text).toBe('bobagem')
    sendCaptureToInbox(id, 'x')
    const n = values(state().ideaNotes)[0]!
    expect(discardInboxNote(n.id).ok).toBe(true)
    expect(state().ideaNotes[n.id]).toBeUndefined()
    expect(deletePendingCapture(id)).toEqual({ ok: false, error: 'Este pensamento já foi organizado.' })
  })

  it('o par não mexe em nada da pessoa', () => {
    const id = captureThought('meu')!
    organizeManually({ captureId: id, areaId: 'A:saude', newTopicName: 'T', newIdea: { title: 'Minha', nature: 'PLANO' } })
    const idea = values(state().ideas)[0]!
    uiStore.set((s) => ({ ...s, viewer: 'B' }))
    expect(updateIdea(idea.id, { title: 'invadido' }).ok).toBe(false)
    expect(markIdeaReviewed(idea.id).ok).toBe(false)
    expect(state().ideas[idea.id]!.title).toBe('Minha')
  })
})
