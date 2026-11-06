import { describe, expect, it } from 'vitest'
import { addMinutesToTime, dateShortcuts, longDateLabel } from './dates'

describe('atalhos de data e hora', () => {
  it('Hoje, Amanhã e o próximo sábado depois de amanhã', () => {
    // 2026-11-06 é sexta: amanhã já é sábado, então o atalho pula para o seguinte
    expect(dateShortcuts('2026-11-06').map((s) => [s.value, s.label])).toEqual([
      ['2026-11-06', 'Hoje'],
      ['2026-11-07', 'Amanhã'],
      ['2026-11-14', 'Sáb 14/11'],
    ])
    // quarta: sábado da mesma semana
    expect(dateShortcuts('2026-11-04')[2]).toMatchObject({ value: '2026-11-07', label: 'Sáb 7/11' })
    // virada de ano
    expect(dateShortcuts('2026-12-31').map((s) => s.value)).toEqual(['2026-12-31', '2027-01-01', '2027-01-02'])
  })

  it('rótulo por extenso para leitor de tela e dica do campo', () => {
    expect(longDateLabel('2026-11-06')).toBe('sexta-feira, 6 de novembro')
    expect(dateShortcuts('2026-11-06')[0]?.ariaLabel).toBe('Hoje, sexta-feira, 6 de novembro')
  })

  it('soma minutos sem passar da meia-noite', () => {
    expect(addMinutesToTime('19:00', 60)).toBe('20:00')
    expect(addMinutesToTime('09:45', 30)).toBe('10:15')
    expect(addMinutesToTime('23:30', 60)).toBe('23:59')
  })
})
