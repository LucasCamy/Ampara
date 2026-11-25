import { describe, expect, it } from 'vitest'
import { parseWhen, titleWithoutWhen } from './whenParse'

// quarta-feira, 25 de novembro de 2026
const TODAY = '2026-11-25'
const p = (text: string) => parseWhen(text, TODAY)

describe('dia e hora pelo código (ADR-0014)', () => {
  it('dias relativos e horas comuns', () => {
    expect(p('amanhã tenho dentista às 18h')).toMatchObject({ date: '2026-11-26', start: '18:00', end: '19:00' })
    expect(p('hoje 14h30 reunião')).toMatchObject({ date: '2026-11-25', start: '14:30', end: '15:30' })
    expect(p('depois de amanhã às 9 consulta')).toMatchObject({ date: '2026-11-27', start: '09:00' })
    expect(p('amanhã às 3 da tarde')).toMatchObject({ start: '15:00' })
    expect(p('amanhã ao meio-dia almoço')).toMatchObject({ start: '12:00', end: '13:00' })
    expect(p('amanhã 18:45')).toMatchObject({ start: '18:45', end: '19:45' })
  })

  it('faixa de horário', () => {
    expect(p('sexta das 14h às 16h curso')).toMatchObject({ date: '2026-11-27', start: '14:00', end: '16:00' })
  })

  it('dias da semana: a próxima vez; o mesmo dia de hoje vira a semana que vem', () => {
    expect(p('na sexta 10h')!.date).toBe('2026-11-27')
    expect(p('segunda-feira 8h')!.date).toBe('2026-11-30')
    expect(p('quarta que vem às 19h')!.date).toBe('2026-12-02')
    expect(p('sábado churrasco')!.date).toBe('2026-11-28')
  })

  it('datas escritas', () => {
    expect(p('dia 28 às 9')).toMatchObject({ date: '2026-11-28', start: '09:00' })
    expect(p('dia 3 dentista 10h')!.date).toBe('2026-12-03')
    expect(p('28/11 às 20h')!.date).toBe('2026-11-28')
    expect(p('10/01 exame 7h')!.date).toBe('2027-01-10')
    expect(p('31/02 algo')).toBeNull()
  })

  it('sem hora: só o dia (vira tarefa com prazo)', () => {
    expect(p('pagar a luz até sexta')).toMatchObject({ date: '2026-11-27', start: null, end: null })
  })

  it('sem dia: não é compromisso (segue como pensamento)', () => {
    expect(p('quero aprender violão')).toBeNull()
    expect(p('comprei 3 kg de arroz')).toBeNull()
    expect(p('às vezes penso em mudar de emprego')).toBeNull()
  })

  it('número que não é hora não vira hora', () => {
    expect(p('amanhã comprar 3 pães')!.start).toBeNull()
    expect(p('amanhã correr 5 km')!.start).toBeNull()
  })

  it('título sem as palavras de dia e hora', () => {
    const t = (s: string) => titleWithoutWhen(s, p(s)!)
    expect(t('amanhã tenho dentista às 18h')).toBe('Dentista')
    expect(t('preciso pagar a luz até sexta')).toBe('Pagar a luz')
    expect(t('sexta das 14h às 16h curso de inglês')).toBe('Curso de inglês')
    expect(t('amanhã às 18h')).toBe('')
  })
})
