import { describe, expect, it } from 'vitest'
import {
  buildEvent,
  buildMedication,
  buildRoutine,
  eventKindOf,
  hasErrors,
  isDateKey,
  isTimeKey,
  parseStock,
  validateEvent,
  validateMedication,
  validateRoutine,
  type EventInput,
  type MedicationInput,
  type RoutineInput,
} from './catalog'

const NOW = '2026-11-06T12:00:00.000Z'
const med: MedicationInput = { name: '  Venvanse 30mg ', dosage: '1 cápsula', times: ['08:00'], stock: '30', shareWithPartner: true }
const routine: RoutineInput = { title: 'Remédio do gato', times: ['20:00'], weekdays: [], instruction: 'meio comprimido na ração', responsible: 'ANY', stock: '14', stockUnit: '' }
const ev: EventInput = { title: 'Consulta médica', date: '2026-11-10', start: '14:00', end: '15:00', owner: 'ME', type: 'HEALTH' }

describe('formatos', () => {
  it('horário HH:MM e data YYYY-MM-DD', () => {
    expect(isTimeKey('08:00')).toBe(true)
    expect(isTimeKey('23:59')).toBe(true)
    expect(isTimeKey('24:00')).toBe(false)
    expect(isTimeKey('8:00')).toBe(false)
    expect(isDateKey('2026-02-28')).toBe(true)
    expect(isDateKey('2026-13-01')).toBe(false)
    expect(isDateKey('ontem')).toBe(false)
  })
  it('estoque: vazio = sem controle, inteiro >= 0, resto inválido', () => {
    expect(parseStock('')).toEqual({ ok: true, value: null })
    expect(parseStock(' 0 ')).toEqual({ ok: true, value: 0 })
    expect(parseStock('12')).toEqual({ ok: true, value: 12 })
    expect(parseStock('-1').ok).toBe(false)
    expect(parseStock('1,5').ok).toBe(false)
  })
})

describe('novo remédio', () => {
  it('valida campos obrigatórios com mensagem por campo', () => {
    const e = validateMedication({ name: ' ', dosage: '', times: ['25:00'], stock: 'abc', shareWithPartner: false })
    expect(Object.keys(e).sort()).toEqual(['dosage', 'name', 'stock', 'times'])
    expect(hasErrors(validateMedication(med))).toBe(false)
  })
  it('fica no nome de quem cadastrou, todo dia, com rede de apoio de 30 min', () => {
    const m = buildMedication(med, 'B', 'm1', NOW)
    expect(m).toMatchObject({ id: 'm1', kind: 'MED', ownerId: 'B', name: 'Venvanse 30mg', times: ['08:00'], weekdays: [], stockCount: 30 })
    expect(m.notifyPartnerOnDelay).toBe(true)
    expect(m.delayMinutesThreshold).toBe(30)
    expect(buildMedication({ ...med, stock: '' }, 'A', 'm2', NOW).stockCount).toBeNull()
  })
})

describe('nova rotina da casa', () => {
  it('sem dono (qualquer um confirma), responsável só como referência', () => {
    const anyone = buildRoutine(routine, 'A', 'r1', NOW)
    expect(anyone).toMatchObject({ kind: 'ROUTINE', ownerId: null, assignee: null, dosage: 'meio comprimido na ração', stockCount: 14, stockUnit: 'unidades' })
    expect(buildRoutine({ ...routine, responsible: 'ME' }, 'A', 'r2', NOW).assignee).toBe('A')
    expect(buildRoutine({ ...routine, responsible: 'PARTNER' }, 'A', 'r3', NOW).assignee).toBe('B')
  })
  it('dias: normaliza, remove repetidos e valores fora de 0..6', () => {
    expect(buildRoutine({ ...routine, weekdays: [5, 1, 1, 9, 3] }, 'A', 'r', NOW).weekdays).toEqual([1, 3, 5])
  })
  it('sem estoque não guarda unidade; instrução vazia ganha texto padrão', () => {
    const r = buildRoutine({ ...routine, stock: '', instruction: ' ' }, 'B', 'r', NOW)
    expect(r.stockCount).toBeNull()
    expect(r.stockUnit).toBeNull()
    expect(r.dosage).toBe('Rotina da casa')
  })
  it('valida título, horário e estoque', () => {
    expect(Object.keys(validateRoutine({ ...routine, title: '', times: ['x'], stock: '-2' })).sort()).toEqual(['stock', 'times', 'title'])
  })
})

describe('novo compromisso', () => {
  it('término precisa ser depois do início', () => {
    expect(validateEvent({ ...ev, end: '13:00' }).end).toMatch(/depois do início/)
    expect(validateEvent({ ...ev, end: '14:00' }).end).toBeDefined()
    expect(hasErrors(validateEvent(ev))).toBe(false)
    expect(validateEvent({ ...ev, date: '2026-02-31x' }).date).toBeDefined()
  })
  it('tipo vira o marcador do calendário; dono define quem vê', () => {
    expect(eventKindOf('APPOINTMENT', 'US')).toBe('COUPLE')
    expect(eventKindOf('APPOINTMENT', 'ME')).toBe('PERSONAL')
    expect(eventKindOf('HEALTH', 'US')).toBe('HEALTH')
    expect(eventKindOf('BILL', 'ME')).toBe('BILL')
    expect(buildEvent(ev, 'B', 'e1', NOW)).toMatchObject({ id: 'e1', kind: 'HEALTH', ownerId: 'B', start: '14:00', end: '15:00' })
    expect(buildEvent({ ...ev, owner: 'US' }, 'B', 'e2', NOW).ownerId).toBeNull()
  })
})

describe('edição', () => {
  it('horários: 1 a 4, válidos, sem repetir, salvos em ordem', async () => {
    const { validateTimes } = await import('./catalog')
    expect(validateTimes([])).toMatch(/pelo menos um/)
    expect(validateTimes(['08:00', '08:00'])).toMatch(/iguais/)
    expect(validateTimes(['08:00', '9:00'])).toMatch(/HH:MM/)
    expect(validateTimes(['01:00', '02:00', '03:00', '04:00', '05:00'])).toMatch(/No máximo/)
    expect(buildMedication({ ...med, times: ['20:00', '08:00'] }, 'A', 'm', NOW).times).toEqual(['08:00', '20:00'])
  })
  it('editar remédio mantém id, dono e o que o formulário não mostra', async () => {
    const { medicationToInput } = await import('./catalog')
    const prev = { ...buildMedication(med, 'A', 'm1', NOW), weekdays: [1, 3], lowStockThreshold: 9 }
    const next = buildMedication({ ...medicationToInput(prev), dosage: '2 cápsulas', times: ['07:00', '19:00'] }, 'B', 'outro-id', '2026-11-07T00:00:00Z', prev)
    expect(next).toMatchObject({ id: 'm1', ownerId: 'A', dosage: '2 cápsulas', times: ['07:00', '19:00'], weekdays: [1, 3], lowStockThreshold: 9, stockCount: 30 })
    expect(next.updatedAt).toBe('2026-11-07T00:00:00Z')
  })
  it('ida e volta do formulário de rotina e de compromisso não perde nada', async () => {
    const { routineToInput, eventToInput, weekdaysPreset } = await import('./catalog')
    const r = buildRoutine({ ...routine, weekdays: [0, 6], responsible: 'ME', stockUnit: 'sachês' }, 'A', 'r1', NOW)
    const back = buildRoutine(routineToInput(r, 'A'), 'A', 'x', NOW, r)
    expect({ ...back, updatedAt: '' }).toEqual({ ...r, updatedAt: '' })
    expect(routineToInput(r, 'B').responsible).toBe('PARTNER')
    expect(weekdaysPreset(r.weekdays)).toBe('WEEKEND')
    expect(weekdaysPreset([1, 2, 3, 4, 5])).toBe('WEEKDAYS')
    expect(weekdaysPreset([2])).toBe('CUSTOM')
    const e = buildEvent({ ...ev, owner: 'US', type: 'BILL' }, 'A', 'e1', NOW)
    expect(buildEvent(eventToInput(e), 'A', 'x', NOW, e)).toEqual(e)
  })
})
