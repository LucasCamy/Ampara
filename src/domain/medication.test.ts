import { describe, expect, it } from 'vitest'
import { confirmTaken, doseView, DoseTransitionError, emptyLog, shouldAlertPartner, skipDose, snoozeWater, SNOOZE_MS } from './medication'
import type { Medication } from './types'

const med: Medication = {
  id: 'venv',
  kind: 'MED',
  ownerId: 'A',
  name: 'Venvanse 30mg',
  dosage: '1 cápsula',
  times: ['08:00'],
  weekdays: [],
  stockCount: 6,
  lowStockThreshold: 5,
  notifyPartnerOnDelay: true,
  delayMinutesThreshold: 30,
  updatedAt: '',
}

const at = (hhmm: string) => new Date(`2026-11-05T${hhmm}:00`)
const fresh = () => emptyLog(med, '2026-11-05', '08:00', '')

describe('máquina de estados da dose', () => {
  it('PENDING -> SNOOZED_WATER -> TAKEN', () => {
    const t0 = at('08:02')
    const snoozed = snoozeWater(fresh(), t0)
    expect(snoozed.status).toBe('SNOOZED_WATER')
    expect(snoozed.snoozeCount).toBe(1)
    expect(new Date(snoozed.snoozeUntil as string).getTime() - t0.getTime()).toBe(SNOOZE_MS)
    expect(doseView(snoozed, at('08:05'))).toBe('SNOOZED_WATER')

    const taken = confirmTaken(snoozed, med, 'A', at('08:06'))
    expect(taken.log.status).toBe('TAKEN')
    expect(taken.log.takenAt).toBe(at('08:06').toISOString())
    expect(taken.log.snoozeUntil).toBeNull()
    expect(taken.med.stockCount).toBe(5)
  })

  it('snooze vencido volta a pedir confirmação', () => {
    const snoozed = snoozeWater(fresh(), at('08:00'))
    expect(doseView(snoozed, at('08:06'))).toBe('DUE')
  })

  it('confirmar duas vezes é idempotente: não desconta estoque de novo', () => {
    const first = confirmTaken(fresh(), med, 'A', at('08:01'))
    const second = confirmTaken(first.log, first.med, 'B', at('08:05'))
    expect(second.changed).toBe(false)
    expect(second.med.stockCount).toBe(5)
    expect(second.log.confirmedBy).toBe('A')
  })

  it('sinaliza quando cruza o limite de estoque baixo (<= 5) uma única vez', () => {
    const r = confirmTaken(fresh(), med, 'A', at('08:01'))
    expect(r.crossedLowStock).toBe(true)
    const next = confirmTaken(emptyLog(med, '2026-11-06', '08:00', ''), r.med, 'A', at('08:01'))
    expect(next.med.stockCount).toBe(4)
    expect(next.crossedLowStock).toBe(false)
  })

  it('estoque nunca fica negativo', () => {
    const empty = { ...med, stockCount: 0 }
    expect(confirmTaken(fresh(), empty, 'A', at('08:01')).med.stockCount).toBe(0)
  })

  it('não permite snooze nem pular dose já tomada', () => {
    const taken = confirmTaken(fresh(), med, 'A', at('08:01')).log
    expect(() => snoozeWater(taken, at('08:02'))).toThrow(DoseTransitionError)
    expect(() => skipDose(taken, 'FORGOT', 'A', at('08:02'))).toThrow(DoseTransitionError)
  })

  it('visão temporal: antes, no horário e atrasada', () => {
    expect(doseView(fresh(), at('06:30'))).toBe('UPCOMING')
    expect(doseView(fresh(), at('07:30'))).toBe('DUE')
    expect(doseView(fresh(), at('08:31'))).toBe('LATE')
  })
})

describe('rede de apoio (+30 min)', () => {
  it('alerta o par só depois de 30 min sem confirmação', () => {
    expect(shouldAlertPartner(med, fresh(), at('08:29'))).toBe(false)
    expect(shouldAlertPartner(med, fresh(), at('08:30'))).toBe(true)
  })

  it('não alerta se a pessoa desligou a rede de apoio', () => {
    expect(shouldAlertPartner({ ...med, notifyPartnerOnDelay: false }, fresh(), at('09:30'))).toBe(false)
  })

  it('não alerta depois de tomado ou pulado', () => {
    const taken = confirmTaken(fresh(), med, 'A', at('08:40')).log
    expect(shouldAlertPartner(med, taken, at('09:30'))).toBe(false)
    const skipped = skipDose(fresh(), 'MEDICAL', 'A', at('08:40'))
    expect(shouldAlertPartner(med, skipped, at('09:30'))).toBe(false)
  })

  it('snooze que estoura o limite continua alertando', () => {
    const snoozed = snoozeWater(fresh(), at('08:20'))
    expect(shouldAlertPartner(med, snoozed, at('08:31'))).toBe(true)
  })
})

describe('estoque: até quando dura', () => {
  const base: Omit<Medication, 'stockCount'> = { id: 'm', kind: 'MED', ownerId: 'A', name: 'X', dosage: '1', times: ['08:00'], weekdays: [], lowStockThreshold: 5, notifyPartnerOnDelay: false, delayMinutesThreshold: 30, updatedAt: '' }
  it('data em que a caixa acaba e nível da barra', async () => {
    const { stockRunsOutOn, stockLevel } = await import('./medication')
    expect(stockRunsOutOn({ ...base, stockCount: 12 }, '2026-11-06')).toBe('2026-11-18')
    expect(stockRunsOutOn({ ...base, stockCount: null }, '2026-11-06')).toBeNull()
    expect(stockLevel({ ...base, stockCount: 60 })).toEqual({ ratio: 1, level: 'ok' })
    expect(stockLevel({ ...base, stockCount: 8 })?.level).toBe('warn')
    expect(stockLevel({ ...base, stockCount: 4 })?.level).toBe('low')
    // duas vezes ao dia gasta o dobro
    expect(stockRunsOutOn({ ...base, times: ['08:00', '20:00'], stockCount: 12 }, '2026-11-06')).toBe('2026-11-12')
  })
})
