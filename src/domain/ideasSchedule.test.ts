import { describe, expect, it } from 'vitest'
import { SCHEDULE_VERSION, baseProposal, overlaps, parseSchedule } from './ideasSchedule'
import { parseWhen } from './whenParse'

const TODAY = '2026-11-25'
const TEXT = 'amanhã tenho dentista às 18h'
const when = parseWhen(TEXT, TODAY)!
const notes = [
  { id: 'n-dent', text: 'Minha dentista é a Dra. Paula Souza, consultório na Rua das Flores, 120, sala 3. Levar a carteirinha do plano.' },
  { id: 'n-outra', text: 'Comprar fio dental.' },
]
const reply = (o: Record<string, unknown>) => ({ versao: SCHEDULE_VERSION, titulo: 'Dentista', titulo_fonte: null, local: null, local_fonte: null, observacao: null, observacao_fonte: null, ...o })

describe('marcar pela barra: a IA completa, o código confere (ADR-0014)', () => {
  it('sem IA: dia, hora e o texto como título', () => {
    expect(baseProposal(TEXT, when)).toMatchObject({ kind: 'EVENT', title: 'Dentista', date: '2026-11-26', start: '18:00', end: '19:00', location: '', notes: '' })
  })

  it('local e nome que estão na anotação citada entram, com a fonte', () => {
    const p = parseSchedule(reply({ titulo: 'Dentista com Dra. Paula', titulo_fonte: 1, local: 'Rua das Flores, 120, sala 3.', local_fonte: 1, observacao: 'Levar a carteirinha do plano', observacao_fonte: 1 }), TEXT, when, notes)
    expect(p).toMatchObject({ title: 'Dentista com Dra. Paula', location: 'Rua das Flores, 120, sala 3', notes: 'Levar a carteirinha do plano' })
    expect(p.sources).toEqual({ title: 'n-dent', location: 'n-dent', notes: 'n-dent' })
    // dia e hora nunca vêm da IA
    expect(p).toMatchObject({ date: '2026-11-26', start: '18:00', end: '19:00' })
  })

  it('o que não está escrito na anotação citada é descartado', () => {
    const invented = parseSchedule(reply({ titulo: 'Dentista com Dr. Marcos', titulo_fonte: 1, local: 'Avenida Brasil, 500', local_fonte: 1, observacao: 'Chegar em jejum', observacao_fonte: 1 }), TEXT, when, notes)
    expect(invented).toMatchObject({ title: 'Dentista', location: '', notes: '' })
    // fonte errada também não vale
    const wrong = parseSchedule(reply({ local: 'Rua das Flores, 120', local_fonte: 2 }), TEXT, when, notes)
    expect(wrong.location).toBe('')
    // fora do contrato: só a proposta do código
    expect(parseSchedule({ qualquer: 1 }, TEXT, when, notes).title).toBe('Dentista')
    expect(parseSchedule(null, TEXT, when, notes).title).toBe('Dentista')
  })

  it('sem hora vira tarefa com prazo', () => {
    const w = parseWhen('pagar a luz até sexta', TODAY)!
    expect(baseProposal('pagar a luz até sexta', w)).toMatchObject({ kind: 'TASK', title: 'Pagar a luz', date: '2026-11-27', start: null })
  })

  it('avisa o que se cruza com o horário', () => {
    const p = baseProposal(TEXT, when)
    const evs = [
      { date: '2026-11-26', start: '17:30', end: '18:30', title: 'Reunião' },
      { date: '2026-11-26', start: '19:00', end: '20:00', title: 'Jantar' },
      { date: '2026-11-27', start: '18:00', end: '19:00', title: 'Outro dia' },
    ]
    expect(overlaps(evs, p)).toEqual(['17:30 Reunião'])
  })
})
