import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmpty } from '../domain/seed'
import { CONCRETIZE_SCHEMA, CONCRETIZE_VERSION, buildConcretizeInput, defaultDraft, parseProposal } from '../domain/ideasConcretize'
import { actionsOf, ideaOfTarget } from '../domain/ideasView'
import type { Idea } from '../domain/ideas'
import type { AiProvider } from '../ai/provider'

vi.mock('./ui', async () => {
  const { createStore } = await import('./createStore')
  return { uiStore: createStore({ viewer: 'A' }), ui: { toast: vi.fn() } }
})

const { dataStore } = await import('./data')
const { uiStore } = await import('./ui')
const { captureThought, concretizeIdea, organizeManually } = await import('./ideaActions')
const { suggestAction } = await import('./ideaAi')

const TODAY = '2026-11-23'
const iso = '2026-11-23T10:00:00.000Z'
const values = <T,>(m: Record<string, T>) => Object.values(m)
const idea = (): Idea => values(dataStore.get().ideas)[0]!

beforeEach(() => {
  uiStore.set((s) => ({ ...s, viewer: 'A' }))
  dataStore.set(() => buildEmpty(new Date(iso), 'COUPLE'))
  const c = captureThought('quero voltar a correr de manhã')!
  organizeManually({ captureId: c, areaId: 'A:saude', newTopicName: 'Corrida', newIdea: { title: 'Voltar a correr de manhã', nature: 'PLANO' } })
})

describe('proposta da IA', () => {
  const answer = (o: Record<string, unknown>) => ({ versao: CONCRETIZE_VERSION, forma: 'TAREFA', titulo: 'Correr 20 minutos', passos: [], esforco: null, quando: null, data: null, inicio: null, fim: null, motivo: 'Começa pequeno.', ...o })

  it('tarefa com micro-passos, esforço e quando', () => {
    const d = parseProposal(answer({ passos: ['Separar o tênis', 'separar o tênis', 'Pôr o alarme 6h', 'Correr 20 min', 'Extra'], esforco: 'FOCO', quando: 'AMANHA' }), idea(), TODAY)
    expect(d).toEqual({ kind: 'TASK', title: 'Correr 20 minutos', steps: ['Separar o tênis', 'Pôr o alarme 6h', 'Correr 20 min'], effort: 'FOCUS', when: 'TOMORROW', reason: 'Começa pequeno.' })
  })

  it('compromisso só com dia futuro e horas válidas; senão vira tarefa', () => {
    expect(parseProposal(answer({ forma: 'COMPROMISSO', titulo: 'Corrida no parque', data: '2026-11-28', inicio: '07:00', fim: '07:40' }), idea(), TODAY))
      .toMatchObject({ kind: 'EVENT', date: '2026-11-28', start: '07:00', end: '07:40' })
    for (const bad of [{ data: '2026-11-01', inicio: '07:00', fim: '08:00' }, { data: '2026-11-28', inicio: '25:00', fim: '26:00' }, { data: '2026-11-28', inicio: '08:00', fim: '07:00' }, { data: null, inicio: null, fim: null }]) {
      expect(parseProposal(answer({ forma: 'COMPROMISSO', ...bad }), idea(), TODAY).kind).toBe('TASK')
    }
  })

  it('resposta fora do contrato volta para a proposta padrão (tarefa sem data com o nome da ideia)', () => {
    expect(parseProposal('não sei', idea(), TODAY)).toEqual(defaultDraft(idea()))
    expect(parseProposal(answer({ versao: 'outra@1' }), idea(), TODAY)).toEqual({ kind: 'TASK', title: 'Voltar a correr de manhã', steps: [], effort: 'QUICK_5M', when: 'INBOX', reason: '' })
  })

  it('a entrada leva a ideia, as anotações e o dia de hoje; o esquema fecha todos os campos', () => {
    const notes = values(dataStore.get().ideaNotes)
    expect(JSON.parse(buildConcretizeInput(idea(), notes, TODAY))).toEqual({ hoje: TODAY, ideia: { titulo: 'Voltar a correr de manhã', tipo: 'Plano', resumo: '' }, anotacoes: ['quero voltar a correr de manhã'] })
    expect([...CONCRETIZE_SCHEMA.required].sort()).toEqual(Object.keys(CONCRETIZE_SCHEMA.properties).sort())
  })

  it('suggestAction: com IA usa a resposta; sem IA, a proposta padrão', async () => {
    const provider: AiProvider = { id: 't', label: 't', runStructured: async () => ({ json: answer({ quando: 'HOJE', passos: ['Separar o tênis'] }), provider: 't', model: 'm' }) }
    expect(await suggestAction(idea().id, TODAY, provider)).toMatchObject({ kind: 'TASK', when: 'TODAY', steps: ['Separar o tênis'] })
    expect(await suggestAction(idea().id, TODAY, null)).toEqual(defaultDraft(idea()))
  })
})

describe('concretizar', () => {
  it('cria tarefa pessoal e privada com micro-passos, liga à ideia e marca "Virou ação"; Desfazer volta tudo', () => {
    const r = concretizeIdea(idea().id, { kind: 'TASK', title: 'Correr 20 minutos', steps: ['Separar o tênis', ' ', 'Pôr o alarme'], effort: 'QUICK_5M', when: 'TODAY', reason: '' }, TODAY)
    expect(r.ok).toBe(true)
    const task = dataStore.get().tasks[r.ok ? r.targetId! : '']!
    expect(task).toMatchObject({ title: 'Correr 20 minutos', assignedTo: 'A', createdBy: 'A', visibleToPartner: false, dueDate: TODAY, status: 'PENDING' })
    expect(task.steps!.map((s) => s.text)).toEqual(['Separar o tênis', 'Pôr o alarme'])
    expect(idea().state).toBe('VIROU_ACAO')
    const s = dataStore.get()
    expect(actionsOf(s, 'A', idea().id)).toEqual([expect.objectContaining({ title: 'Correr 20 minutos', done: false, when: TODAY })])
    expect(ideaOfTarget(s, 'A', task.id)?.title).toBe('Voltar a correr de manhã')
    expect(ideaOfTarget(s, 'B', task.id)).toBeNull()
    expect(s.outbox.some((e) => e.entityType === 'ideaActions')).toBe(true)

    if (r.ok) r.undo()
    expect(dataStore.get().tasks[task.id]).toBeUndefined()
    expect(values(dataStore.get().ideaActions)).toEqual([])
    expect(idea().state).toBe('SOLTA')
  })

  it('cria compromisso pessoal; horário inválido explica e não cria nada', () => {
    const bad = concretizeIdea(idea().id, { kind: 'EVENT', title: 'Corrida', date: '2026-11-28', start: '08:00', end: '07:00', reason: '' }, TODAY)
    expect(bad).toEqual({ ok: false, error: 'O término precisa ser depois do início.' })
    expect(values(dataStore.get().events)).toEqual([])
    const ok = concretizeIdea(idea().id, { kind: 'EVENT', title: 'Corrida no parque', date: '2026-11-28', start: '07:00', end: '07:40', reason: '' }, TODAY)
    expect(ok.ok).toBe(true)
    expect(values(dataStore.get().events)).toEqual([expect.objectContaining({ title: 'Corrida no parque', ownerId: 'A', kind: 'PERSONAL' })])
  })

  it('sem nome não cria; o par não concretiza a ideia de quem escreveu', () => {
    expect(concretizeIdea(idea().id, { kind: 'TASK', title: '  ', steps: [], effort: 'QUICK_5M', when: 'INBOX', reason: '' }, TODAY).ok).toBe(false)
    uiStore.set((s) => ({ ...s, viewer: 'B' }))
    expect(concretizeIdea(idea().id, { kind: 'TASK', title: 'x', steps: [], effort: 'QUICK_5M', when: 'INBOX', reason: '' }, TODAY)).toEqual({ ok: false, error: 'Esta ideia não existe mais.' })
    expect(values(dataStore.get().tasks)).toEqual([])
  })
})
