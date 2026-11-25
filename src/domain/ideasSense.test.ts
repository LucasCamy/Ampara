import { describe, expect, it } from 'vitest'
import { defaultAreasFor, focusSense, type Idea, type IdeaNote } from './ideas'
import { buildOrganizerInput, pickExamples, selectCandidates } from './ideasPrompt'

const iso = '2026-11-25T10:00:00.000Z'
const owned = { ownerId: 'A' as const, createdAt: iso, updatedAt: iso }
const idea = (id: string, title: string): Idea => ({ ...owned, id, topicId: 't', title, summary: '', nature: 'PLANO', state: 'SOLTA', needsReview: false })
const note = (id: string, ideaId: string, text: string, captureId = 'c-' + id): IdeaNote => ({ ...owned, id, captureId, ideaId, text, startPos: null, endPos: null, needsReview: false, inboxReason: null })
const map = (ideas: Idea[]) => ({ areas: defaultAreasFor('A', iso), topics: [], ideas, links: [] })

describe('sentido no contexto da IA (ADR-0012)', () => {
  it('candidatas: a de mesmo sentido sobe mesmo sem palavra em comum', () => {
    const ideas = [idea('run', 'Voltar à corrida leve'), idea('rega', 'Ajustar a rega da horta'), idea('cash', 'Revisar o cartão')]
    expect(selectCandidates(map(ideas), [], 'fui trotar hoje cedo', 1)[0]!.id).not.toBe('run')
    const sense = new Map([['run', 0.55], ['rega', 0.3], ['cash', 0.28]])
    expect(selectCandidates(map(ideas), [], 'fui trotar hoje cedo', 1, sense)[0]!.id).toBe('run')
  })

  it('exemplos: só parecidos, de ideias que a IA vai ver, primeiro os da pessoa', () => {
    const notes = [note('n1', 'run', 'corri 5 km', 'c-ia'), note('n2', 'run', 'trotei na praça', 'c-pessoa'), note('n3', 'rega', 'reguei as mudas'), note('n4', 'fora', 'corri muito')]
    const sense = new Map([['n1', 0.7], ['n2', 0.5], ['n3', 0.2], ['n4', 0.8]])
    const ex = pickExamples(notes, new Set(['c-pessoa']), sense, new Set(['run', 'rega']))
    expect(ex).toEqual([
      { trecho: 'trotei na praça', ideia_id: 'run', quem: 'PESSOA' },
      { trecho: 'corri 5 km', ideia_id: 'run', quem: 'IA' },
    ])
    expect(pickExamples(notes, new Set(), null, new Set(['run']))).toEqual([])
  })

  it('entrada: contexto e exemplos só aparecem quando existem', () => {
    const plain = JSON.parse(buildOrganizerInput('oi', map([]), []))
    expect(plain).not.toHaveProperty('dito_pouco_antes_so_para_entender')
    expect(plain).not.toHaveProperty('onde_a_pessoa_guardou_coisas_parecidas')
    const full = JSON.parse(buildOrganizerInput('e o tênis também', map([]), [], { contextoAnterior: ['quero voltar a correr'], exemplos: [{ trecho: 'x', ideia_id: 'run', quem: 'PESSOA' }] }))
    expect(full.dito_pouco_antes_so_para_entender).toEqual(['quero voltar a correr'])
    expect(full.onde_a_pessoa_guardou_coisas_parecidas).toHaveLength(1)
  })
})

describe('corte relativo do sentido', () => {
  it('fica só o que está perto do melhor e acima do mínimo (valores medidos em português)', () => {
    // "o que eu pensei sobre exercício?" contra: correr, tênis, manjericão, trotar, app de música, inglês
    const exercise = new Map([['correr', 0.54], ['tenis', 0.49], ['manjericao', 0.3], ['trotar', 0.44], ['app', 0.35], ['ingles', 0.34]])
    expect([...focusSense(exercise)!.keys()].sort()).toEqual(['correr', 'tenis', 'trotar'])
    const plants = new Map([['correr', 0.34], ['manjericao', 0.53], ['trotar', 0.38]])
    expect([...focusSense(plants)!.keys()]).toEqual(['manjericao'])
    expect(focusSense(null)).toBeNull()
  })
})
