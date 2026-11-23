import { describe, expect, it } from 'vitest'
import { defaultAreasFor, IDEA_LIMITS, foldText, sentenceCount, type Idea, type IdeaLink, type IdeaMap, type IdeaTopic } from './ideas'
import { validateOrganization, type ValidationResult } from './ideasValidate'

const NOW = '2026-11-23T12:00:00.000Z'
const topic = (id: string, areaId: string, name: string, extra: Partial<IdeaTopic> = {}): IdeaTopic =>
  ({ id, areaId: `A:${areaId}`, name, firm: true, archived: false, origin: 'PESSOA', ownerId: 'A', createdAt: NOW, updatedAt: NOW, ...extra })
const idea = (id: string, topicId: string, title: string, extra: Partial<Idea> = {}): Idea =>
  ({ id, topicId, title, summary: '', nature: 'PLANO', state: 'SOLTA', needsReview: false, ownerId: 'A', createdAt: NOW, updatedAt: NOW, ...extra })
const link = (fromIdeaId: string, toIdeaId: string, extra: Partial<IdeaLink> = {}): IdeaLink =>
  ({ id: `${fromIdeaId}-${toIdeaId}`, fromIdeaId, toIdeaId, type: 'RELACIONA', reason: 'r', origin: 'IA', state: 'CONFIRMADA', ownerId: 'A', createdAt: NOW, updatedAt: NOW, ...extra })

function baseMap(): IdeaMap {
  return {
    areas: defaultAreasFor('A', NOW),
    topics: [topic('t-viagem', 'lazer', 'Viagem para o Sul'), topic('t-corrida', 'saude', 'Corrida')],
    ideas: [idea('i-viagem', 't-viagem', 'Viajar para Floripa'), idea('i-correr', 't-corrida', 'Correr de manhã')],
    links: [],
  }
}
const run = (capture: string, operacoes: unknown[], map = baseMap()) => validateOrganization(capture, { versao: 'organizador@1', operacoes }, map)
const kinds = (r: ValidationResult) => r.apply.map((o) => o.kind)

const CAPTURE = 'quero ir para Floripa em janeiro e preciso juntar 3 mil. também quero aprender violão'

describe('organizar uma captura (caminho feliz)', () => {
  it('anexa, cria assunto provisório e ideia nova, sugere ligação e resumo', () => {
    const r = run(CAPTURE, [
      { tipo: 'ANEXAR', trecho: 'quero ir para Floripa em janeiro', ideia_id: 'i-viagem', confianca: 0.93 },
      { tipo: 'CRIAR_ASSUNTO', ref: 'novo-dinheiro', area_id: 'A:dinheiro', nome: 'Reserva para viagem', motivo: 'meta de dinheiro' },
      { tipo: 'CRIAR_IDEIA', ref: 'juntar', trecho: 'preciso juntar 3 mil.', assunto_ref: 'novo-dinheiro', titulo: 'Juntar 3 mil', natureza: 'PLANO', confianca: 0.85 },
      { tipo: 'CRIAR_IDEIA', trecho: 'também quero aprender violão', assunto_id: 't-viagem', titulo: 'Aprender violão', natureza: 'DESEJO', confianca: 0.7 },
      { tipo: 'SUGERIR_LIGACAO', de_ideia: 'i-viagem', para_ideia: 'juntar', tipo_ligacao: 'DEPENDE_DE', motivo: 'a viagem precisa do dinheiro', confianca: 0.9 },
      { tipo: 'ATUALIZAR_RESUMO', ideia_id: 'i-viagem', resumo: 'Ir para Floripa em janeiro. Depende de juntar 3 mil.' },
    ])
    expect(r.ok).toBe(true)
    expect(r.rejected).toEqual([])
    expect(kinds(r)).toEqual(['CRIAR_ASSUNTO', 'ANEXAR', 'CRIAR_IDEIA', 'CRIAR_IDEIA', 'SUGERIR_LIGACAO', 'ATUALIZAR_RESUMO'])
    const violao = r.apply.find((o) => o.kind === 'CRIAR_IDEIA' && o.title === 'Aprender violão')
    expect(violao).toMatchObject({ needsReview: true })
    // "e" entre os trechos é só conectivo: não vai para a Caixa de entrada.
    expect(r.inbox).toEqual([])
  })

  it('posições apontam para o texto literal da captura normalizada', () => {
    const r = run('  ligar   para\n o dentista  ', [
      { tipo: 'CRIAR_IDEIA', trecho: 'ligar para o dentista', assunto_id: 't-corrida', titulo: 'Dentista', natureza: 'PLANO', confianca: 0.9 },
    ])
    expect(r.capture).toBe('ligar para o dentista')
    const op = r.apply[0]!
    expect(op.kind === 'CRIAR_IDEIA' && r.capture.slice(op.start, op.end)).toBe('ligar para o dentista')
  })
})

describe('a IA não pode inventar nem perder o que a pessoa disse', () => {
  it('recusa trecho que não está na captura e manda a captura para a Caixa de entrada', () => {
    const r = run('quero correr amanhã cedo', [
      { tipo: 'ANEXAR', trecho: 'quero correr todo dia às 6h', ideia_id: 'i-correr', confianca: 0.99 },
    ])
    expect(r.apply).toEqual([])
    expect(r.rejected[0]).toMatchObject({ kind: 'ANEXAR', reason: 'trecho não está escrito na captura' })
    expect(r.inbox).toEqual([{ text: 'quero correr amanhã cedo', start: 0, end: 24, reason: 'sobrou da captura sem organização' }])
  })

  it('recusa trechos sobrepostos, mas aceita o mesmo texto quando ele aparece duas vezes', () => {
    const r = run('correr. correr.', [
      { tipo: 'ANEXAR', trecho: 'correr.', ideia_id: 'i-correr', confianca: 0.9 },
      { tipo: 'ANEXAR', trecho: 'correr.', ideia_id: 'i-correr', confianca: 0.9 },
      { tipo: 'ANEXAR', trecho: 'correr. correr', ideia_id: 'i-correr', confianca: 0.9 },
    ])
    expect(kinds(r)).toEqual(['ANEXAR', 'ANEXAR'])
    expect(r.rejected).toEqual([{ index: 2, kind: 'ANEXAR', reason: 'trecho sobreposto a outro já usado' }])
  })

  it('sobras com conteúdo vão para a Caixa de entrada; conectivos e pontuação não', () => {
    const r = run('hmm, tipo, comprar tênis e também marcar médico', [
      { tipo: 'ANEXAR', trecho: 'comprar tênis', ideia_id: 'i-correr', confianca: 0.9 },
    ])
    expect(r.inbox).toEqual([{ text: 'e também marcar médico', start: 25, end: 47, reason: 'sobrou da captura sem organização' }])
  })

  it('operação recusada não derruba as outras', () => {
    const r = run(CAPTURE, [
      { tipo: 'ANEXAR', trecho: 'quero ir para Floripa em janeiro', ideia_id: 'nao-existe', confianca: 0.9 },
      { tipo: 'ANEXAR', trecho: 'preciso juntar 3 mil.', ideia_id: 'i-viagem', confianca: 0.9 },
    ])
    expect(kinds(r)).toEqual(['ANEXAR'])
    expect(r.rejected).toEqual([{ index: 0, kind: 'ANEXAR', reason: 'ideia não existe' }])
    expect(r.inbox.map((i) => i.text)).toEqual(['quero ir para Floripa em janeiro e', 'também quero aprender violão'])
  })

  it.each([
    ['resposta não é objeto', 'texto solto'],
    ['sem versão', { operacoes: [] }],
    ['versão desconhecida', { versao: 'outro@1', operacoes: [] }],
    ['sem lista', { versao: 'organizador@1' }],
    ['operações demais', { versao: 'organizador@1', operacoes: Array.from({ length: IDEA_LIMITS.operationsPerCapture + 1 }, () => ({})) }],
  ])('contrato quebrado (%s): a captura inteira vai para a Caixa de entrada', (_label, response) => {
    const r = validateOrganization('pensar no curso', response, baseMap())
    expect(r.ok).toBe(false)
    expect(r.apply).toEqual([])
    expect(r.inbox).toEqual([expect.objectContaining({ text: 'pensar no curso', start: 0, end: 15 })])
  })

  it('captura maior que o limite não é organizada', () => {
    const r = run('a'.repeat(IDEA_LIMITS.captureMaxChars + 1), [])
    expect(r.ok).toBe(false)
  })

  it('captura vazia não gera nada', () => {
    expect(run('   ', [])).toMatchObject({ ok: true, apply: [], inbox: [] })
  })

  it('propriedade: nenhuma letra da captura some, com qualquer mistura de operações', () => {
    const capture = 'arrumar a garagem no sábado, pensar em vender a bicicleta e ligar para a Ana sobre o aniversário'
    const pieces = ['arrumar a garagem no sábado', 'pensar em vender a bicicleta', 'ligar para a Ana', 'sobre o aniversário', 'inventado', 'garagem no']
    let seed = 7
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
    for (let round = 0; round < 200; round++) {
      const ops = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => {
        const trecho = pieces[Math.floor(rand() * pieces.length)]
        const pick = rand()
        if (pick < 0.4) return { tipo: 'ANEXAR', trecho, ideia_id: rand() < 0.8 ? 'i-viagem' : 'x', confianca: rand() }
        if (pick < 0.7) return { tipo: 'CRIAR_IDEIA', trecho, assunto_id: 't-viagem', titulo: `Ideia ${round}`, natureza: 'PLANO', confianca: rand() }
        return { tipo: 'CAIXA_DE_ENTRADA', trecho, motivo: 'não sei' }
      })
      const r = run(capture, ops)
      const covered = new Array(r.capture.length).fill(false)
      for (const o of r.apply) if ('start' in o) for (let i = o.start; i < o.end; i++) covered[i] = true
      for (const b of r.inbox) if (b.start !== null && b.end !== null) for (let i = b.start; i < b.end; i++) covered[i] = true
      const lost = r.capture.split('').filter((ch, i) => !covered[i] && /\p{L}/u.test(ch)).join('')
      // Só pode faltar conectivo ("e"): nenhuma palavra com conteúdo.
      expect(foldText(lost).replace(/e/g, '')).toBe('')
    }
  })
})

describe('confiança decide o destino', () => {
  const op = (confianca: unknown) => ({ tipo: 'ANEXAR', trecho: 'correr amanhã', ideia_id: 'i-correr', confianca })
  it('>= 0,8 aplica; 0,6 a 0,8 aplica para conferir; < 0,6 vai para a Caixa de entrada', () => {
    expect(run('correr amanhã', [op(0.8)]).apply[0]).toMatchObject({ needsReview: false })
    expect(run('correr amanhã', [op(0.6)]).apply[0]).toMatchObject({ needsReview: true })
    const low = run('correr amanhã', [op(0.59)])
    expect(low.apply).toEqual([])
    expect(low.inbox).toEqual([{ text: 'correr amanhã', start: 0, end: 13, reason: 'a IA não teve certeza de onde encaixar' }])
  })
  it.each([undefined, -0.1, 1.2, '0.9', Number.NaN])('confiança inválida (%s) é recusada', (c) => {
    const r = run('correr amanhã', [op(c)])
    expect(r.rejected[0]?.reason).toBe('confiança ausente ou fora de 0 a 1')
    expect(r.inbox[0]?.text).toBe('correr amanhã')
  })
})

describe('estrutura fixa (ADR-0002)', () => {
  const create = (extra: Record<string, unknown>) => ({ tipo: 'CRIAR_IDEIA', trecho: 'aprender violão', titulo: 'Aprender violão', natureza: 'DESEJO', confianca: 0.9, ...extra })

  it('vocabulário fechado de natureza e título curto', () => {
    expect(run('aprender violão', [create({ assunto_id: 't-viagem', natureza: 'SONHO' })]).rejected[0]?.reason).toBe('natureza fora do vocabulário')
    const long = run('aprender violão', [create({ assunto_id: 't-viagem', titulo: 'um dois três quatro cinco seis sete oito nove' })])
    expect(long.rejected[0]?.reason).toBe('título com mais de 8 palavras')
  })

  it('assunto precisa existir, não estar arquivado, e não pode vir duplicado', () => {
    const map = baseMap()
    map.topics.push(topic('t-velho', 'lazer', 'Velho', { archived: true }))
    expect(run('aprender violão', [create({ assunto_id: 't-xx' })], map).rejected[0]?.reason).toBe('assunto não existe')
    expect(run('aprender violão', [create({ assunto_id: 't-velho' })], map).rejected[0]?.reason).toBe('assunto arquivado')
    expect(run('aprender violão', [create({})], map).rejected[0]?.reason).toBe('falta assunto_id ou assunto_ref')
    expect(run('aprender violão', [create({ assunto_id: 't-viagem', assunto_ref: 'x' })], map).rejected[0]?.reason).toBe('use assunto_id ou assunto_ref, não os dois')
  })

  it('a IA não cria Área e não usa Área escondida', () => {
    const map = baseMap()
    map.areas = map.areas.map((a) => (a.id === 'A:lazer' ? { ...a, hidden: true } : a))
    const r = run('aprender violão', [
      { tipo: 'CRIAR_ASSUNTO', ref: 'm', area_id: 'A:musica', nome: 'Música', motivo: 'novo' },
      { tipo: 'CRIAR_ASSUNTO', ref: 'n', area_id: 'A:lazer', nome: 'Música', motivo: 'novo' },
      create({ assunto_ref: 'm' }),
    ], map)
    expect(r.rejected.map((x) => x.reason)).toEqual(['área não existe', 'área escondida pela pessoa', 'assunto_ref não foi criado (ou foi recusado) nesta captura'])
    expect(r.inbox[0]?.text).toBe('aprender violão')
  })

  it('nome de assunto repetido na área é recusado (sem acento e maiúscula)', () => {
    const r = run('aprender violão', [
      { tipo: 'CRIAR_ASSUNTO', ref: 'v', area_id: 'A:lazer', nome: 'VIAGEM para o sul', motivo: 'x' },
      create({ assunto_ref: 'v' }),
    ])
    expect(r.rejected[0]?.reason).toBe('já existe assunto com esse nome nesta área; use o id dele')
  })

  it('no máximo 12 assuntos ativos por Área (arquivados não contam)', () => {
    const map = baseMap()
    for (let i = 0; i < 11; i++) map.topics.push(topic(`t-l${i}`, 'lazer', `Assunto ${i}`))
    map.topics.push(topic('t-arq', 'lazer', 'Arquivado', { archived: true }))
    // lazer já tem 12 ativos (t-viagem + 11)
    const r = run('aprender violão', [
      { tipo: 'CRIAR_ASSUNTO', ref: 'm', area_id: 'A:lazer', nome: 'Música', motivo: 'novo' },
      create({ assunto_ref: 'm' }),
    ], map)
    expect(r.rejected[0]?.reason).toBe('área já tem o máximo de assuntos; proponha juntar na revisão')
  })

  it('assunto novo sem ideia válida não é criado', () => {
    const r = run('aprender violão', [
      { tipo: 'CRIAR_ASSUNTO', ref: 'm', area_id: 'A:lazer', nome: 'Música', motivo: 'novo' },
      create({ assunto_ref: 'm', confianca: 0.3 }),
    ])
    expect(kinds(r)).toEqual([])
    expect(r.rejected).toEqual([{ index: 0, kind: 'CRIAR_ASSUNTO', reason: 'assunto sem nenhuma ideia válida' }])
  })

  it('ideia com o mesmo título no mesmo assunto vira anotação nela, para conferir', () => {
    const r = run('viajar para floripa logo', [
      { tipo: 'CRIAR_IDEIA', trecho: 'viajar para floripa logo', assunto_id: 't-viagem', titulo: 'Viajar para Floripa', natureza: 'PLANO', confianca: 0.95 },
    ])
    expect(r.apply).toEqual([expect.objectContaining({ kind: 'ANEXAR', ideaId: 'i-viagem', needsReview: true })])
  })

  it('não existem operações de apagar ou mover', () => {
    const r = run('apaga tudo', [{ tipo: 'APAGAR_IDEIA', ideia_id: 'i-viagem' }, { tipo: 'MOVER_IDEIA', ideia_id: 'i-viagem', assunto_id: 't-corrida' }])
    expect(r.apply).toEqual([])
    expect(r.rejected.map((x) => x.reason)).toEqual(['operação desconhecida', 'operação desconhecida'])
    expect(r.inbox[0]?.text).toBe('apaga tudo')
  })
})

describe('malha de ligações (ADR-0003)', () => {
  const sug = (de: string, para: string, extra: Record<string, unknown> = {}) =>
    ({ tipo: 'SUGERIR_LIGACAO', de_ideia: de, para_ideia: para, tipo_ligacao: 'RELACIONA', motivo: 'conversam', confianca: 0.9, ...extra })
  const linkReasons = (ops: unknown[], map = baseMap()) => run('x', ops, map).rejected.map((x) => x.reason)

  it('recusa ligação consigo mesma, tipo fora do vocabulário, sem motivo e ideia inexistente', () => {
    expect(linkReasons([
      sug('i-viagem', 'i-viagem'),
      sug('i-viagem', 'i-correr', { tipo_ligacao: 'AMA' }),
      sug('i-viagem', 'i-correr', { motivo: '' }),
      sug('i-viagem', 'fantasma'),
      sug('i-viagem', 'i-correr', { confianca: 0.2 }),
    ])).toEqual(['ligação de uma ideia com ela mesma', 'tipo de ligação fora do vocabulário', 'motivo vazio', 'ideia da ligação não existe', 'confiança baixa para sugerir ligação'])
  })

  it('não repete ligação existente nem recusada; RELACIONA vale nos dois sentidos', () => {
    const map = baseMap()
    map.ideas.push(idea('i-3', 't-corrida', 'Dormir cedo'))
    map.links = [link('i-viagem', 'i-correr'), link('i-3', 'i-viagem', { type: 'DEPENDE_DE', state: 'RECUSADA' })]
    expect(linkReasons([
      sug('i-correr', 'i-viagem'),
      sug('i-3', 'i-viagem', { tipo_ligacao: 'DEPENDE_DE' }),
    ], map)).toEqual(['ligação já existe', 'a pessoa já recusou esta ligação'])
    // DEPENDE_DE tem direção: o sentido contrário é outra ligação
    expect(run('x', [sug('i-viagem', 'i-3', { tipo_ligacao: 'DEPENDE_DE' })], map).rejected).toEqual([])
  })

  it('no máximo 3 por captura e 5 por ideia', () => {
    const map = baseMap()
    for (let i = 0; i < 6; i++) map.ideas.push(idea(`i-n${i}`, 't-corrida', `Nova ${i}`))
    const four = [0, 1, 2, 3].map((i) => sug('i-viagem', `i-n${i}`))
    expect(linkReasons(four, map)).toEqual(['mais de 3 ligações numa captura'])
    map.links = [0, 1, 2, 3, 4].map((i) => link('i-correr', `i-n${i}`, { id: `l${i}` }))
    expect(linkReasons([sug('i-correr', 'i-viagem')], map)).toEqual(['ideia já tem 5 ligações'])
  })

  it('pode ligar uma ideia criada na mesma captura pelo ref', () => {
    const r = run('comprar tênis', [
      { tipo: 'CRIAR_IDEIA', ref: 'tenis', trecho: 'comprar tênis', assunto_id: 't-corrida', titulo: 'Comprar tênis', natureza: 'PLANO', confianca: 0.9 },
      sug('tenis', 'i-correr', { tipo_ligacao: 'PARTE_DE' }),
    ])
    expect(r.apply[1]).toEqual({ kind: 'SUGERIR_LIGACAO', from: { ref: 'tenis' }, to: { id: 'i-correr' }, type: 'PARTE_DE', reason: 'conversam' })
  })
})

describe('resumo e estado', () => {
  it('resumo com no máximo 2 frases e uma vez por ideia', () => {
    const r = run('x', [
      { tipo: 'ATUALIZAR_RESUMO', ideia_id: 'i-viagem', resumo: 'Uma. Duas. Três.' },
      { tipo: 'ATUALIZAR_RESUMO', ideia_id: 'i-viagem', resumo: 'Ir em janeiro.' },
      { tipo: 'ATUALIZAR_RESUMO', ideia_id: 'i-viagem', resumo: 'De novo.' },
    ])
    expect(r.rejected.map((x) => x.reason)).toEqual(['resumo com mais de 2 frases', 'resumo repetido para a mesma ideia'])
  })

  it('a IA sugere estado, mas nunca "virou ação"', () => {
    const r = run('x', [
      { tipo: 'SUGERIR_ESTADO', ideia_id: 'i-viagem', estado: 'VIROU_ACAO', motivo: 'já comprou' },
      { tipo: 'SUGERIR_ESTADO', ideia_id: 'i-viagem', estado: 'SOLTA', motivo: 'x' },
      { tipo: 'SUGERIR_ESTADO', ideia_id: 'i-viagem', estado: 'ESQUECIDA', motivo: 'x' },
      { tipo: 'SUGERIR_ESTADO', ideia_id: 'i-viagem', estado: 'GUARDADA', motivo: 'parada há 40 dias' },
    ])
    expect(r.rejected.map((x) => x.reason)).toEqual(['só a pessoa marca que a ideia virou ação', 'a ideia já está neste estado', 'estado fora do vocabulário'])
    expect(r.apply).toEqual([{ kind: 'SUGERIR_ESTADO', ideaId: 'i-viagem', state: 'GUARDADA', reason: 'parada há 40 dias' }])
  })
})

describe('ajudantes de texto', () => {
  it('conta frases e dobra acentos', () => {
    expect(sentenceCount('Uma frase')).toBe(1)
    expect(sentenceCount('Uma. Outra!')).toBe(2)
    expect(foldText('  Saúde  E   Ânimo ')).toBe('saude e animo')
  })
})

describe('resposta real da assinatura (2026-11-23)', () => {
  it('assunto novo sem motivo não derruba as ideias; resumo da ideia nova é aproveitado', () => {
    const capture = 'quero voltar a correr de manhã, mas tenho medo de não conseguir acordar cedo. talvez dormir antes das 23h ajude'
    const r = run(capture, [
      { tipo: 'CRIAR_ASSUNTO', ref: 'S1', area_id: 'A:saude', nome: 'Exercício e sono', motivo: null },
      { tipo: 'CRIAR_IDEIA', ref: 'I1', trecho: 'quero voltar a correr de manhã', assunto_ref: 'S1', titulo: 'Voltar a correr de manhã', natureza: 'PLANO', resumo: 'Quer voltar a correr pela manhã.', confianca: 0.9 },
      { tipo: 'CRIAR_IDEIA', ref: 'I2', trecho: 'tenho medo de não conseguir acordar cedo', assunto_ref: 'S1', titulo: 'Medo de não conseguir acordar cedo', natureza: 'PREOCUPACAO', resumo: null, confianca: 0.85 },
      { tipo: 'CRIAR_IDEIA', ref: 'I3', trecho: 'talvez dormir antes das 23h ajude', assunto_ref: 'S1', titulo: 'Dormir antes das 23h', natureza: 'PLANO', confianca: 0.8 },
      { tipo: 'SUGERIR_LIGACAO', de_ideia: 'I1', para_ideia: 'I3', tipo_ligacao: 'RELACIONA', motivo: 'Correr de manhã depende de dormir cedo.', confianca: 0.8 },
    ])
    expect(r.rejected).toEqual([])
    expect(kinds(r)).toEqual(['CRIAR_ASSUNTO', 'CRIAR_IDEIA', 'CRIAR_IDEIA', 'CRIAR_IDEIA', 'SUGERIR_LIGACAO'])
    expect(r.apply[1]).toMatchObject({ summary: 'Quer voltar a correr pela manhã.' })
    expect(r.apply[2]).toMatchObject({ summary: '' })
    // "mas" e a pontuação entre os trechos são conectivos: nada vai para a Caixa de entrada
    expect(r.inbox).toEqual([])
  })
})

describe('tolerância a modelos pequenos', () => {
  it('ref de assunto novo escrito em assunto_id é entendido como o mesmo assunto', () => {
    const r = run('aprender violão', [
      { tipo: 'CRIAR_ASSUNTO', ref: 'm1', area_id: 'A:lazer', nome: 'Música', motivo: null },
      { tipo: 'CRIAR_IDEIA', trecho: 'aprender violão', assunto_id: 'm1', titulo: 'Aprender violão', natureza: 'DESEJO', confianca: 0.9 },
    ])
    expect(r.rejected).toEqual([])
    expect(r.apply[1]).toMatchObject({ kind: 'CRIAR_IDEIA', topic: { ref: 'm1' } })
  })

  it('id que não existe e não é ref continua recusado', () => {
    const r = run('aprender violão', [{ tipo: 'CRIAR_IDEIA', trecho: 'aprender violão', assunto_id: 'inventado', titulo: 'X', natureza: 'DESEJO', confianca: 0.9 }])
    expect(r.rejected[0]?.reason).toBe('assunto não existe')
  })
})

