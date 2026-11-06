import { describe, expect, it } from 'vitest'
import {
  canViewCycleLog,
  canViewCycleSettings,
  cycleStats,
  cycleToday,
  defaultCycleSettings,
  parseDays,
  partnerCycleView,
  publishedForecast,
  shouldWarnPartner,
  upcomingPeriods,
  validatePeriod,
} from './cycle'
import { addDays } from './dates'
import type { CycleLog, CycleSettings } from './types'

const log = (startDate: string, endDate: string | null = null, ownerId: 'A' | 'B' = 'B'): CycleLog => ({
  id: `${ownerId}-${startDate}`,
  ownerId,
  startDate,
  endDate,
  updatedAt: '',
})
const settings = (p: Partial<CycleSettings> = {}): CycleSettings => ({ ...defaultCycleSettings('B', ''), ...p })

describe('estatística do ciclo', () => {
  it('sem histórico usa a duração típica informada', () => {
    expect(cycleStats([log('2026-11-01')], settings({ cycleDays: 30, periodDays: 4 }))).toEqual({ cycleDays: 30, periodDays: 4, basedOn: 0 })
  })

  it('mediana dos intervalos e das durações registradas', () => {
    const logs = [log('2026-08-01', '2026-08-05'), log('2026-08-31', '2026-09-03'), log('2026-09-30', '2026-10-04'), log('2026-10-27')]
    // intervalos: 30, 30, 27 -> 30; durações: 5, 4, 5 -> 5
    expect(cycleStats(logs, settings())).toEqual({ cycleDays: 30, periodDays: 5, basedOn: 3 })
  })

  it('intervalo fora da faixa (mês esquecido) não entra na média', () => {
    const logs = [log('2026-06-01'), log('2026-08-01'), log('2026-08-29')]
    expect(cycleStats(logs, settings()).cycleDays).toBe(28)
    expect(cycleStats(logs, settings()).basedOn).toBe(1)
  })
})

describe('fase de hoje', () => {
  const s = settings({ cycleDays: 28, periodDays: 5 })
  const start = '2026-11-01'
  const at = (day: number) => cycleToday([log(start)], s, addDays(start, day - 1))

  it('sem registro: null', () => {
    expect(cycleToday([], s, '2026-11-06')).toBeNull()
  })

  it('percorre as fases de um ciclo de 28 dias', () => {
    expect(at(1)?.phase).toBe('MENSTRUAL')
    expect(at(5)?.phase).toBe('MENSTRUAL')
    expect(at(6)?.phase).toBe('FOLLICULAR')
    expect(at(14)?.phase).toBe('OVULATION')
    expect(at(18)?.phase).toBe('LUTEAL')
    expect(at(22)?.phase).toBe('PREMENSTRUAL')
    expect(at(28)?.phase).toBe('PREMENSTRUAL')
    expect(at(30)?.phase).toBe('LATE')
    expect(at(29)?.phase).toBe('PREMENSTRUAL')
    expect(at(29)?.daysUntilNext).toBe(0)
    expect(at(30)?.daysUntilNext).toBe(-1)
  })

  it('fim marcado encurta a menstruação', () => {
    expect(cycleToday([log(start, '2026-11-03')], s, '2026-11-04')?.phase).toBe('FOLLICULAR')
  })

  it('próxima prevista e semana de cuidado', () => {
    const c = at(10)!
    expect(c.nextStart).toBe('2026-11-29')
    expect(c.sensitiveFrom).toBe('2026-11-22')
    expect(c.sensitiveTo).toBe('2026-11-28')
    expect(c.daysUntilNext).toBe(19)
  })

  it('registro muito antigo deixa de prever', () => {
    expect(at(80)).toBeNull()
  })

  it('próximas menstruações (atrasada começa hoje)', () => {
    expect(upcomingPeriods([log(start)], s, '2026-11-10', 2)).toEqual([
      { start: '2026-11-29', end: '2026-12-03' },
      { start: '2026-12-27', end: '2026-12-31' },
    ])
    expect(upcomingPeriods([log(start)], s, '2026-12-01', 1)[0]?.start).toBe('2026-12-01')
  })
})

describe('privacidade do ciclo', () => {
  const logs = [log('2026-11-01')]

  it('"Só eu vejo" não publica nada', () => {
    expect(publishedForecast(logs, settings({ share: 'NONE' }), '2026-11-10')).toEqual({ sensitiveFrom: null, sensitiveTo: null })
  })

  it('aviso publica só a semana de cuidado', () => {
    expect(publishedForecast(logs, settings({ share: 'GENTLE' }), '2026-11-10')).toEqual({ sensitiveFrom: '2026-11-22', sensitiveTo: '2026-11-28' })
  })

  it('atrasada: a semana se estende até hoje', () => {
    expect(publishedForecast(logs, settings({ share: 'GENTLE' }), '2026-12-01')).toEqual({ sensitiveFrom: '2026-11-22', sensitiveTo: '2026-12-01' })
  })

  it('regras de leitura (espelho do RLS)', () => {
    expect(canViewCycleSettings(settings({ share: 'NONE' }), 'B')).toBe(true)
    expect(canViewCycleSettings(settings({ share: 'NONE' }), 'A')).toBe(false)
    expect(canViewCycleSettings(settings({ share: 'GENTLE' }), 'A')).toBe(true)
    expect(canViewCycleLog(log('2026-11-01'), 'A', settings({ share: 'GENTLE' }))).toBe(false)
    expect(canViewCycleLog(log('2026-11-01'), 'A', settings({ share: 'FULL' }))).toBe(true)
    expect(canViewCycleLog(log('2026-11-01'), 'B', undefined)).toBe(true)
  })

  it('o par não vê nada com "Só eu vejo", mesmo com os dados no aparelho', () => {
    const s = settings({ share: 'NONE', sensitiveFrom: '2026-11-22', sensitiveTo: '2026-11-28' })
    expect(partnerCycleView(logs, { B: s }, 'B', 'A', '2026-11-23')).toEqual({ status: 'hidden' })
  })

  it('com aviso o par vê só a janela, sem datas da menstruação', () => {
    const s = settings({ share: 'GENTLE', ...publishedForecast(logs, settings({ share: 'GENTLE' }), '2026-11-10') })
    const v = partnerCycleView(logs, { B: s }, 'B', 'A', '2026-11-20')
    expect(v).toEqual({ status: 'gentle', from: '2026-11-22', to: '2026-11-28', active: false, startsIn: 2 })
    expect(shouldWarnPartner(v)).toBe(true)
    expect(shouldWarnPartner(partnerCycleView(logs, { B: s }, 'B', 'A', '2026-11-12'))).toBe(false)
    expect(partnerCycleView(logs, { B: s }, 'B', 'A', '2026-11-29')).toEqual({ status: 'hidden' })
  })

  it('com "Tudo" o par vê a fase', () => {
    const v = partnerCycleView(logs, { B: settings({ share: 'FULL' }) }, 'B', 'A', '2026-11-23')
    expect(v.status).toBe('full')
    if (v.status === 'full') {
      expect(v.cycle.phase).toBe('PREMENSTRUAL')
      expect(v.active).toBe(true)
    }
  })

  it('a própria pessoa nunca aparece como "par"', () => {
    expect(partnerCycleView(logs, { B: settings({ share: 'FULL' }) }, 'B', 'B', '2026-11-23')).toEqual({ status: 'hidden' })
  })
})

describe('registro', () => {
  const others = [log('2026-10-04', '2026-10-08')]

  it('aceita um registro válido', () => {
    expect(validatePeriod({ startDate: '2026-11-01', endDate: '2026-11-05' }, others, '2026-11-06')).toEqual({})
  })

  it('recusa futuro, fim antes do início e registro colado em outro', () => {
    expect(validatePeriod({ startDate: '2026-11-07', endDate: null }, [], '2026-11-06').startDate).toMatch(/futuro/)
    expect(validatePeriod({ startDate: '2026-11-03', endDate: '2026-11-01' }, [], '2026-11-06').endDate).toMatch(/depois/)
    expect(validatePeriod({ startDate: '2026-10-10', endDate: null }, others, '2026-11-06').startDate).toMatch(/04\/10/)
  })

  it('duração digitada', () => {
    expect(parseDays('28', { min: 20, max: 45 })).toBe(28)
    expect(parseDays('8', { min: 20, max: 45 })).toBeNull()
    expect(parseDays('abc', { min: 20, max: 45 })).toBeNull()
  })
})
