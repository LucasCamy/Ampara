import { describe, expect, it } from 'vitest'
import { buildMedication, validateMedication } from './catalog'
import { isScheduledOn, stockDaysLeft } from './medication'
import { packAllowsDose, packDay, packKindOf, packStockDays } from './pillPack'
import type { PillPack } from './types'

const pack: PillPack = { activeDays: 21, pauseDays: 7, startDate: '2026-11-01' }

describe('cartela de anticoncepcional', () => {
  it('conta o comprimido do dia e a pausa', () => {
    expect(packDay(pack, '2026-11-01')).toMatchObject({ day: 1, pill: 1, inPause: false, daysToPause: 21, pauseStart: '2026-11-22' })
    expect(packDay(pack, '2026-11-21')).toMatchObject({ day: 21, pill: 21, inPause: false, daysToPause: 1 })
    expect(packDay(pack, '2026-11-22')).toMatchObject({ day: 22, pill: null, inPause: true, nextPackStart: '2026-11-29' })
  })

  it('a cartela seguinte começa sozinha depois da pausa', () => {
    expect(packDay(pack, '2026-11-29')).toMatchObject({ day: 1, pill: 1, packStart: '2026-11-29', nextPackStart: '2026-12-27' })
  })

  it('contínua: nunca entra em pausa', () => {
    const cont: PillPack = { activeDays: 28, pauseDays: 0, startDate: '2026-11-01' }
    expect(packDay(cont, '2026-11-28')).toMatchObject({ day: 28, inPause: false, daysToPause: null })
    expect(packDay(cont, '2026-11-29').day).toBe(1)
  })

  it('reconhece o tipo pela combinação de dias', () => {
    expect(packKindOf(pack)).toBe('21_7')
    expect(packKindOf({ activeDays: 24, pauseDays: 4, startDate: '' })).toBe('24_4')
    expect(packKindOf({ activeDays: 30, pauseDays: 2, startDate: '' })).toBeNull()
  })

  it('na pausa não existe dose; antes da 1ª cartela também não', () => {
    const med = buildMedication(
      { name: 'Anticoncepcional', dosage: '1 comprimido', times: ['21:00'], stock: '42', shareWithPartner: true, packKind: '21_7', packStart: '2026-11-01' },
      'B',
      'pill',
      '',
    )
    expect(isScheduledOn(med, '2026-11-10')).toBe(true)
    expect(isScheduledOn(med, '2026-11-25')).toBe(false)
    expect(isScheduledOn(med, '2026-10-30')).toBe(false)
    expect(packAllowsDose({ ...med, pack: null }, '2026-11-25')).toBe(true)
    // 42 comprimidos = 2 cartelas = 56 dias de calendário
    expect(stockDaysLeft(med)).toBe(56)
    expect(packStockDays(pack, 21)).toBe(28)
  })

  it('cartela pede um horário só e uma data de início válida', () => {
    const base = { name: 'Pílula', dosage: '1', times: ['21:00', '09:00'], stock: '', shareWithPartner: false, packKind: '21_7' as const, packStart: '' }
    const e = validateMedication(base, '2026-11-06')
    expect(e.times).toMatch(/um horário só/)
    expect(e.packStart).toMatch(/1º comprimido/)
    expect(validateMedication({ ...base, times: ['21:00'], packStart: '2026-11-20' }, '2026-11-06').packStart).toMatch(/semana/)
    expect(validateMedication({ ...base, times: ['21:00'], packStart: '2026-11-01' }, '2026-11-06')).toEqual({})
  })
})
