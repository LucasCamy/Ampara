import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmpty } from '../domain/seed'
import { canViewTask } from '../domain/tasks'
import { otherPartner, type PartnerId } from '../domain/types'

// ui.ts toca no document (tema); aqui basta quem está usando e o Toast
const toast = vi.fn()
vi.mock('./ui', async () => {
  const { createStore } = await import('./createStore')
  return { uiStore: createStore({ viewer: 'B' as PartnerId }), ui: { toast: (...a: unknown[]) => toast(...a) } }
})

const { dataStore } = await import('./data')
const { uiStore } = await import('./ui')
const { addEvent, addExpense, addMedication, addRoutine, addTask, postponeTask, saveEvent, saveTask, sendTaskToPartner, setEnabledModule, saveMedication, setPartnerSupport, takeDose } = await import('./actions')

const lastToast = () => toast.mock.calls.at(-1) as [string, { undo?: () => void }]

beforeEach(() => {
  uiStore.set((state) => ({ ...state, viewer: 'B' }))
  dataStore.set(() => buildEmpty(new Date('2026-11-06T12:00:00Z')))
  toast.mockClear()
})

describe('actions de cadastro', () => {
  it('captura até três micro-passos não vazios e mantém seus ids na fila de sincronização', () => {
    const taskId = addTask({
      title: 'Separar documentos', dest: 'ME', when: 'INBOX', effort: 'FOCUS',
      steps: [
        { id: 'vazio', text: '  ', done: false },
        { id: 'abrir', text: ' Abrir a pasta ', done: false },
        { id: 'separar', text: 'Pegar um documento', done: false },
        { id: 'foto', text: 'Tirar uma foto', done: false },
        { id: 'extra', text: 'Guardar tudo', done: false },
      ],
    })!
    expect(dataStore.get().tasks[taskId]!.steps).toEqual([
      { id: 'abrir', text: 'Abrir a pasta', done: false },
      { id: 'separar', text: 'Pegar um documento', done: false },
      { id: 'foto', text: 'Tirar uma foto', done: false },
    ])
    expect(dataStore.get().outbox.find((entry) => entry.entityId === taskId)?.payload).toMatchObject({ steps: dataStore.get().tasks[taskId]!.steps })
    lastToast()[1].undo!()
    expect(dataStore.get().tasks[taskId]).toBeUndefined()
  })

  it('conta adiamentos, envia o contador no outbox e Desfazer restaura o contador anterior', () => {
    addTask({ title: 'Separar documentos', dest: 'ME', when: 'TODAY', effort: 'QUICK_5M' })
    const task = Object.values(dataStore.get().tasks)[0]!
    expect(task).toMatchObject({ steps: [], postponeCount: 0 })
    postponeTask(task.id)
    postponeTask(task.id)
    postponeTask(task.id)
    expect(dataStore.get().tasks[task.id]!.postponeCount).toBe(3)
    expect(dataStore.get().outbox.find((e) => e.entityId === task.id)?.payload).toMatchObject({ postponeCount: 3 })
    lastToast()[1].undo!()
    expect(dataStore.get().tasks[task.id]!.postponeCount).toBe(2)
  })

  it('adiar uma tarefa antiga começa a contagem em um sem perder seus micro-passos', () => {
    addTask({ title: 'Ligar na clínica', dest: 'ME', when: 'INBOX', effort: 'QUICK_5M' })
    const task = Object.values(dataStore.get().tasks)[0]!
    dataStore.set((s) => ({ ...s, tasks: { [task.id]: { ...task, postponeCount: undefined, steps: [{ id: 'primeiro', text: 'Achar o telefone', done: false }] } } }))
    postponeTask(task.id)
    expect(dataStore.get().tasks[task.id]).toMatchObject({ postponeCount: 1, steps: [{ id: 'primeiro', text: 'Achar o telefone', done: false }] })
    lastToast()[1].undo!()
    expect(dataStore.get().tasks[task.id]!.postponeCount).toBeUndefined()
  })

  it('muda somente o módulo do viewer atual e permite Desfazer', () => {
    const original = dataStore.get().profiles.B!
    setEnabledModule('cycle', false)
    expect(dataStore.get().profiles.B!.enabledModules).toEqual({ cycle: false, shopping: true, goals: true })
    expect(dataStore.get().profiles.A!.enabledModules!.cycle).toBe(true)
    expect(dataStore.get().outbox.some((e) => e.entityType === 'profiles' && e.entityId === 'B')).toBe(true)
    lastToast()[1].undo!()
    expect(dataStore.get().profiles.B).toEqual(original)
  })

  it('addMedication grava no nome do viewer da sessão, enfileira no outbox e permite desfazer', () => {
    const id = addMedication({ name: 'Venvanse 30mg', dosage: '1 cápsula', times: ['08:00'], stock: '30', shareWithPartner: true })
    expect(id).toBeTruthy()
    const s = dataStore.get()
    expect(s.meds[id!]).toMatchObject({ kind: 'MED', ownerId: 'B', notifyPartnerOnDelay: true, stockCount: 30 })
    expect(s.outbox.some((e) => e.entityType === 'meds' && e.entityId === id && e.status === 'PENDING')).toBe(true)

    const [msg, opts] = lastToast()
    expect(msg).toContain('Venvanse 30mg')
    expect(opts.undo).toBeTypeOf('function')
    opts.undo!()
    expect(dataStore.get().meds[id!]).toBeUndefined()
  })

  it('entrada inválida não grava nada nem mostra Toast', () => {
    const before = dataStore.get()
    expect(addMedication({ name: '', dosage: '', times: ['99:99'], stock: '', shareWithPartner: false })).toBeNull()
    expect(addRoutine({ title: '', times: ['20:00'], weekdays: [], instruction: '', responsible: 'ANY', stock: '', stockUnit: '' })).toBeNull()
    expect(addEvent({ title: 'Jantar', date: '2026-11-10', start: '20:00', end: '19:00', owner: 'US', type: 'APPOINTMENT' })).toBeNull()
    expect(dataStore.get()).toBe(before)
    expect(toast).not.toHaveBeenCalled()
  })

  it('addRoutine cria rotina sem dono (qualquer um confirma) e enfileira em meds', () => {
    const id = addRoutine({ title: 'Tirar o lixo', times: ['21:00'], weekdays: [1, 3, 5], instruction: '', responsible: 'PARTNER', stock: '', stockUnit: '' })
    const r = dataStore.get().meds[id!]
    expect(r).toMatchObject({ kind: 'ROUTINE', ownerId: null, assignee: 'A', weekdays: [1, 3, 5], times: ['21:00'] })
    expect(dataStore.get().outbox.filter((e) => e.entityId === id)).toHaveLength(1)
    lastToast()[1].undo!()
    expect(dataStore.get().meds[id!]).toBeUndefined()
  })

  it('addEvent cria compromisso do casal ou pessoal e enfileira em events', () => {
    const us = addEvent({ title: 'Jantar de aniversário', date: '2026-11-20', start: '20:00', end: '22:30', owner: 'US', type: 'APPOINTMENT' })
    const mine = addEvent({ title: 'Conta de luz', date: '2026-11-15', start: '09:00', end: '09:30', owner: 'ME', type: 'BILL' })
    const s = dataStore.get()
    expect(s.events[us!]).toMatchObject({ kind: 'COUPLE', ownerId: null })
    expect(s.events[mine!]).toMatchObject({ kind: 'BILL', ownerId: 'B' })
    expect(s.outbox.filter((e) => e.entityType === 'events')).toHaveLength(2)
    expect(lastToast()[0]).toBe('Compromisso salvo · 15/11 das 09:00 às 09:30')
  })
})

describe('privacidade de tarefas automáticas de estoque', () => {
  const input = { name: 'Cuidado reservado', dosage: '1 unidade', times: ['08:00'], stock: '6', shareWithPartner: false }

  it.each(['SOLO', 'COUPLE'] as const)('estoque baixo de remédio privado não expõe o nome ao par em %s', (mode) => {
    dataStore.set(() => buildEmpty(new Date('2026-11-06T12:00:00Z'), mode))
    const id = addMedication(input)!
    takeDose(id, '2026-11-06', '08:00')
    const task = Object.values(dataStore.get().tasks).find((item) => item.sourceMedicationId === id)!
    expect(task).toMatchObject({ assignedTo: 'B', visibleToPartner: false })
    expect(canViewTask(task, 'A')).toBe(false)
    expect(dataStore.get().outbox.find((entry) => entry.entityId === task.id)?.payload).toMatchObject({ visibleToPartner: false })
  })

  it.each(['rede', 'edicao'] as const)('desligar compartilhamento por %s recolhe reposição automática no mesmo Desfazer', (entry) => {
    const id = addMedication({ ...input, shareWithPartner: true })!
    takeDose(id, '2026-11-06', '08:00')
    const original = Object.values(dataStore.get().tasks).find((item) => item.sourceMedicationId === id)!
    expect(canViewTask(original, 'A')).toBe(true)
    if (entry === 'rede') setPartnerSupport(id, false)
    else saveMedication(input, id)
    expect(dataStore.get().meds[id]!.notifyPartnerOnDelay).toBe(false)
    expect(canViewTask(dataStore.get().tasks[original.id]!, 'A')).toBe(false)
    lastToast()[1].undo!()
    expect(dataStore.get().meds[id]!.notifyPartnerOnDelay).toBe(true)
    expect(dataStore.get().tasks[original.id]).toEqual(original)
  })

  it('rotina Solo gera reposição pessoal mesmo usando o modelo sem dono das rotinas', () => {
    dataStore.set(() => buildEmpty(new Date('2026-11-06T12:00:00Z'), 'SOLO'))
    const id = addRoutine({ title: 'Meu material', times: ['09:00'], weekdays: [], instruction: '', responsible: 'ME', stock: '4', stockUnit: 'unidades' })!
    takeDose(id, '2026-11-06', '09:00')
    const task = Object.values(dataStore.get().tasks).find((item) => item.sourceMedicationId === id)!
    expect(task).toMatchObject({ assignedTo: 'B', visibleToPartner: false })
    expect(canViewTask(task, 'A')).toBe(false)
  })

  it('preserva uma reposição que a pessoa decidiu enviar ao par', () => {
    const id = addMedication({ ...input, shareWithPartner: true })!
    takeDose(id, '2026-11-06', '08:00')
    const task = Object.values(dataStore.get().tasks).find((item) => item.sourceMedicationId === id)!
    sendTaskToPartner(task.id)
    const sent = dataStore.get().tasks[task.id]!
    setPartnerSupport(id, false)
    expect(dataStore.get().tasks[task.id]).toEqual(sent)
    expect(canViewTask(sent, 'A')).toBe(true)
  })
})

describe('captura no modo Solo', () => {
  beforeEach(() => dataStore.set(() => buildEmpty(new Date('2026-11-06T12:00:00Z'), 'SOLO')))

  it('tarefa fica com o viewer e não pode ser enviada a um perfil ausente', () => {
    const id = addTask({ title: 'Respirar um pouco', dest: 'PARTNER', when: 'TODAY', effort: 'QUICK_5M' })!
    expect(dataStore.get().tasks[id]).toMatchObject({ assignedTo: 'B', createdBy: 'B', sentBy: null, visibleToPartner: false })
    const previous = dataStore.get()
    sendTaskToPartner(id)
    expect(dataStore.get()).toBe(previous)
    expect(lastToast()[0]).not.toContain('Enviada')
  })

  it('gasto do Solo é pessoal, pago pelo viewer e sem presente oculto', () => {
    addExpense({ amountCents: 4500, description: 'Farmácia', category: 'HEALTH', scope: 'COUPLE', paidBy: 'A', splitRule: '50_50', isSecretGift: true, status: 'CONFIRMED_SOLID' })
    const expense = Object.values(dataStore.get().transactions)[0]!
    expect(expense).toMatchObject({ scope: 'PERSONAL', createdBy: 'B', paidBy: 'B', isSecretGift: false, splitRule: null, partnerAShareCents: 0, partnerBShareCents: 4500 })
  })

  it('compromissos e cuidados usam o viewer mesmo se uma captura antiga pedir casal ou par', () => {
    const eventId = addEvent({ title: 'Consulta', date: '2026-11-20', start: '09:00', end: '10:00', owner: 'US', type: 'HEALTH' })!
    const medicationId = addMedication({ name: 'Remédio diário', dosage: '1 comprimido', times: ['08:00'], stock: '30', shareWithPartner: true })!
    const routineId = addRoutine({ title: 'Beber água', times: ['09:00'], weekdays: [], instruction: '', responsible: 'PARTNER', stock: '', stockUnit: '' })!
    expect(dataStore.get().events[eventId]).toMatchObject({ ownerId: 'B', kind: 'HEALTH' })
    expect(dataStore.get().meds[medicationId]).toMatchObject({ ownerId: 'B', notifyPartnerOnDelay: false })
    expect(dataStore.get().meds[routineId]).toMatchObject({ ownerId: null, assignee: 'B', notifyPartnerOnDelay: false })
  })
})

describe('editar e excluir', () => {
  const medInput = { name: 'Venvanse 30mg', dosage: '1 cápsula', times: ['08:00'], stock: '30', shareWithPartner: false }

  it.each(['A', 'B'] as const)('editar tarefas e eventos compartilhados em Solo %s preserva donos e autoria do histórico', (viewer) => {
    uiStore.set((state) => ({ ...state, viewer }))
    const partner = otherPartner(viewer)
    const taskId = addTask({ title: 'Tarefa conjunta original', dest: 'US', when: 'TODAY', effort: 'QUICK_5M' })!
    const eventId = addEvent({ title: 'Compromisso conjunto original', date: '2026-11-20', start: '09:00', end: '10:00', owner: 'US', type: 'APPOINTMENT' })!
    dataStore.set((state) => ({ ...state, couple: { couple: { ...state.couple.couple!, mode: 'SOLO', soloOwnerId: viewer } }, tasks: { ...state.tasks, [taskId]: { ...state.tasks[taskId]!, createdBy: partner, sentBy: partner } } }))
    const originalTask = dataStore.get().tasks[taskId]!
    const originalEvent = dataStore.get().events[eventId]!
    expect(saveTask({ title: 'Título corrigido', dest: 'ME', when: 'TODAY', effort: 'FOCUS', private: true }, taskId)).toBe(taskId)
    expect(dataStore.get().tasks[taskId]).toMatchObject({ assignedTo: null, createdBy: partner, sentBy: partner, visibleToPartner: true })
    expect(dataStore.get().outbox.find((entry) => entry.entityId === taskId)?.payload).toMatchObject({ assignedTo: null, createdBy: partner })
    lastToast()[1].undo!()
    expect(dataStore.get().tasks[taskId]).toEqual(originalTask)
    expect(saveEvent({ title: 'Horário corrigido', date: '2026-11-21', start: '09:00', end: '10:00', owner: 'ME', type: 'APPOINTMENT' }, eventId)).toBe(eventId)
    expect(dataStore.get().events[eventId]).toMatchObject({ ownerId: null, kind: 'COUPLE' })
    expect(dataStore.get().outbox.find((entry) => entry.entityId === eventId)?.payload).toMatchObject({ ownerId: null, kind: 'COUPLE' })
    lastToast()[1].undo!()
    expect(dataStore.get().events[eventId]).toEqual(originalEvent)
  })

  it.each(['A', 'B'] as const)('Solo %s mantém atribuição antiga de tarefa e recusa editar dados privados do par', (viewer) => {
    uiStore.set((state) => ({ ...state, viewer }))
    const partner = otherPartner(viewer)
    const taskId = addTask({ title: 'Tarefa visível do par', dest: 'PARTNER', when: 'TODAY', effort: 'QUICK_5M' })!
    uiStore.set((state) => ({ ...state, viewer: partner }))
    const privateTask = addTask({ title: 'Tarefa privada do par', dest: 'ME', private: true, when: 'TODAY', effort: 'FOCUS' })!
    const privateEvent = addEvent({ title: 'Evento privado do par', date: '2026-11-20', start: '09:00', end: '10:00', owner: 'ME', type: 'HEALTH' })!
    uiStore.set((state) => ({ ...state, viewer }))
    dataStore.set((state) => ({ ...state, couple: { couple: { ...state.couple.couple!, mode: 'SOLO', soloOwnerId: viewer } } }))
    expect(saveTask({ title: 'Nome corrigido', dest: 'ME', when: 'TODAY', effort: 'FOCUS' }, taskId)).toBe(taskId)
    expect(dataStore.get().tasks[taskId]).toMatchObject({ assignedTo: partner, createdBy: viewer, sentBy: viewer })
    const before = dataStore.get()
    expect(saveTask({ title: 'Não autorizado', dest: 'ME', when: 'TODAY', effort: 'FOCUS' }, privateTask)).toBeNull()
    expect(saveEvent({ title: 'Não autorizado', date: '2026-11-21', start: '09:00', end: '10:00', owner: 'US', type: 'HEALTH' }, privateEvent)).toBeNull()
    expect(dataStore.get()).toBe(before)
    const createdTask = addTask({ title: 'Nova tarefa', dest: 'US', when: 'TODAY', effort: 'QUICK_5M' })!
    const createdEvent = addEvent({ title: 'Novo evento', date: '2026-11-21', start: '09:00', end: '10:00', owner: 'US', type: 'HEALTH' })!
    expect(dataStore.get().tasks[createdTask]).toMatchObject({ createdBy: viewer, assignedTo: viewer, visibleToPartner: false })
    expect(dataStore.get().events[createdEvent]).toMatchObject({ ownerId: viewer, kind: 'HEALTH' })
  })

  it('editar tarefa preserva conclusão, adiamentos, origem e passos concluídos depois de abrir a gaveta', () => {
    const id = addTask({ title: 'Organizar a mesa', dest: 'ME', when: 'INBOX', effort: 'QUICK_5M', steps: [{ id: 'uma-coisa', text: 'Pegar uma folha', done: false }] })!
    const staleSteps = dataStore.get().tasks[id]!.steps!
    dataStore.set((state) => ({ ...state, tasks: { ...state.tasks, [id]: {
      ...state.tasks[id]!,
      createdBy: 'A', sourceMedicationId: 'lembrete', status: 'DONE', completedAt: '2026-11-06T10:05:00Z', completedBy: 'B',
      postponeCount: 4, dueTime: '10:00', steps: [{ ...staleSteps[0]!, done: true }],
    } } }))
    const previous = dataStore.get().tasks[id]!
    expect(saveTask({ title: 'Organizar só um canto', dest: 'ME', when: 'TODAY', dueDate: '2026-12-02', effort: 'FOCUS', steps: staleSteps }, id)).toBe(id)
    expect(dataStore.get().tasks[id]).toMatchObject({
      title: 'Organizar só um canto', createdBy: 'A', createdAt: previous.createdAt, sourceMedicationId: 'lembrete', status: 'DONE',
      completedAt: '2026-11-06T10:05:00Z', completedBy: 'B', postponeCount: 4, dueDate: '2026-12-02', dueTime: '10:00',
      steps: [{ id: 'uma-coisa', text: 'Pegar uma folha', done: true }],
    })
    lastToast()[1].undo!()
    expect(dataStore.get().tasks[id]).toEqual(previous)
  })

  it('não edita tarefa pessoal privada do par nem cria tarefa com data inválida', () => {
    const id = addTask({ title: 'Anotação reservada', dest: 'ME', when: 'TODAY', effort: 'QUICK_5M' })!
    dataStore.set((state) => ({ ...state, tasks: { ...state.tasks, [id]: { ...state.tasks[id]!, assignedTo: 'A', visibleToPartner: false, sentBy: null } } }))
    const before = dataStore.get()
    toast.mockClear()
    const input = { title: 'Trocado', dest: 'ME', when: 'TODAY', effort: 'QUICK_5M' } as const
    expect(saveTask(input, id)).toBeNull()
    expect(addTask({ ...input, dueDate: '2026-02-31' })).toBeNull()
    expect(dataStore.get()).toBe(before)
    expect(toast).not.toHaveBeenCalled()
  })

  it('saveMedication com id edita o mesmo registro, enfileira e desfaz para a versão anterior', async () => {
    const { saveMedication } = await import('./actions')
    const id = saveMedication(medInput)!
    const edited = saveMedication({ ...medInput, times: ['08:00', '20:00'], dosage: '2 cápsulas' }, id)
    expect(edited).toBe(id)
    expect(Object.keys(dataStore.get().meds)).toHaveLength(1)
    expect(dataStore.get().meds[id]).toMatchObject({ dosage: '2 cápsulas', times: ['08:00', '20:00'] })
    expect(lastToast()[0]).toBe('Remédio atualizado · Venvanse 30mg')
    lastToast()[1].undo!()
    expect(dataStore.get().meds[id]).toMatchObject({ dosage: '1 cápsula', times: ['08:00'] })
  })

  it('não edita nem exclui remédio do par', async () => {
    const { saveMedication, deleteMedication } = await import('./actions')
    const { uiStore } = await import('./ui')
    const id = saveMedication(medInput)! // dono: B (viewer do mock)
    uiStore.set((s) => ({ ...s, viewer: 'A' }))
    try {
      expect(saveMedication({ ...medInput, name: 'trocado' }, id)).toBeNull()
      expect(deleteMedication(id)).toBe(false)
      expect(dataStore.get().meds[id]?.name).toBe('Venvanse 30mg')
    } finally {
      uiStore.set((s) => ({ ...s, viewer: 'B' }))
    }
  })

  it('excluir remédio, rotina e compromisso: some na hora, vai para a fila como DELETE e Desfazer devolve', async () => {
    const { deleteEvent, deleteMedication, saveEvent, saveRoutine } = await import('./actions')
    const rid = saveRoutine({ title: 'Lixo', times: ['20:00'], weekdays: [], instruction: '', responsible: 'ANY', stock: '', stockUnit: '' })!
    expect(deleteMedication(rid)).toBe(true)
    expect(dataStore.get().meds[rid]).toBeUndefined()
    expect(dataStore.get().outbox.some((e) => e.entityId === rid && e.operation === 'DELETE')).toBe(true)
    expect(lastToast()[0]).toBe('Rotina excluída · Lixo')
    lastToast()[1].undo!()
    expect(dataStore.get().meds[rid]?.name).toBe('Lixo')

    const eid = saveEvent({ title: 'Dentista', date: '2026-11-12', start: '10:00', end: '11:00', owner: 'ME', type: 'HEALTH' })!
    expect(deleteEvent(eid)).toBe(true)
    expect(dataStore.get().events[eid]).toBeUndefined()
    expect(deleteEvent(eid)).toBe(false)
  })

  it('excluir remédio leva a tarefa "Repor estoque" pendente; Desfazer devolve os dois', async () => {
    const { deleteMedication, saveMedication } = await import('./actions')
    const id = saveMedication(medInput)!
    const base = { createdBy: 'B', assignedTo: 'B', effort: 'QUICK_5M', dueDate: null, dueTime: null, visibleToPartner: true, sentBy: null, completedAt: null, completedBy: null, sourceMedicationId: id, createdAt: '', updatedAt: '' } as const
    dataStore.set((s) => ({
      ...s,
      tasks: {
        ...s.tasks,
        repor: { ...base, id: 'repor', title: 'Repor Venvanse', status: 'PENDING' },
        antiga: { ...base, id: 'antiga', title: 'Repor Venvanse (feito)', status: 'DONE' },
      },
    }))
    expect(deleteMedication(id)).toBe(true)
    const s = dataStore.get()
    expect(s.tasks.repor).toBeUndefined()
    expect(s.tasks.antiga).toBeTruthy() // concluída fica no histórico
    expect(s.outbox.some((e) => e.entityId === 'repor' && e.operation === 'DELETE')).toBe(true)
    lastToast()[1].undo!()
    expect(dataStore.get().meds[id]).toBeTruthy()
    expect(dataStore.get().tasks.repor?.status).toBe('PENDING')
  })
})
