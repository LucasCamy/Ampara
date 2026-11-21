import { describe, expect, it } from 'vitest'
import { parseQuickInput } from './quickParse'

const today = '2026-11-20' // sexta-feira

describe('captura livre local em português', () => {
  it('entende o exemplo ditado de gasto sem símbolo de moeda', () => {
    expect(parseQuickInput('gastei 35 na farmácia', today)).toEqual({ kind: 'expense', amountCents: 3500, description: 'farmácia', category: 'HEALTH', date: today })
  })

  it('limpa o valor e preserva acentos e centavos PT-BR', () => {
    expect(parseQuickInput('Paguei R$ 1.234,56 no supermercado hoje.', today)).toEqual({ kind: 'expense', amountCents: 123456, description: 'supermercado', category: 'MARKET', date: today })
  })

  it.each([
    ['gastei 12,5 reais no almoço', 1250, 'FOOD'],
    ['Uber R$ 23,90', 2390, 'TRANSPORT'],
    ['Paguei 1.234 de aluguel', 123400, 'HOME'],
    ['livro 59 reais', 5900, 'LEISURE'],
    ['despesa: 10.50 com adesivos', 1050, 'OTHER'],
    ['R$ 0,01', 1, 'OTHER'],
  ])('converte %s em centavos exatos e infere categoria', (raw, amountCents, category) => {
    expect(parseQuickInput(raw, today)).toMatchObject({ kind: 'expense', amountCents, category })
  })

  it('usa ontem na data do gasto sem deixar a instrução na descrição', () => {
    expect(parseQuickInput('ontem gastei R$ 35 na farmácia', today)).toEqual({ kind: 'expense', amountCents: 3500, description: 'farmácia', category: 'HEALTH', date: '2026-11-19' })
  })

  it.each(['R$ -10 na feira', 'gastei 0 no mercado', 'gastei 2,345 na feira', 'R$ 99.999.999,99', 'gastei vinte na feira', 'R$ na farmácia'])('não salva valor inválido ou fora do integer: %s', (raw) => {
    expect(parseQuickInput(raw, today)).toBeNull()
  })

  it.each([
    ['Comprar leite', 'leite', 'MARKET'],
    ['lista: remédio', 'remédio', 'PHARMACY'],
    ['Falta detergente', 'detergente', 'HOME'],
    ['lista de compras: envelopes', 'envelopes', 'OTHER'],
    ['comprar 2 litros de leite', '2 litros de leite', 'MARKET'],
  ])('reconhece compra sem converter quantidade em dinheiro: %s', (raw, title, category) => {
    expect(parseQuickInput(raw, today)).toEqual({ kind: 'shopping', title, category })
  })

  it('trata compra com valor expresso como gasto, mantendo o valor entendido na prévia', () => {
    expect(parseQuickInput('comprar pão por 15 reais', today)).toMatchObject({ kind: 'expense', amountCents: 1500, category: 'MARKET' })
  })

  it.each([
    ['Ligar na clínica hoje', 'Ligar na clínica', today],
    ['Responder email amanhã', 'Responder email', '2026-11-21'],
    ['Levar documentos na segunda-feira', 'Levar documentos', '2026-11-23'],
    ['Marcar consulta terça', 'Marcar consulta', '2026-11-24'],
    ['sábado conferir chave', 'conferir chave', '2026-11-21'],
    ['Revisar lista próxima sexta-feira', 'Revisar lista', '2026-11-27'],
    ['Lembrar de separar mochila', 'separar mochila', null],
  ])('detecta dia relativo ou Entrada: %s', (raw, title, dueDate) => {
    expect(parseQuickInput(raw, today)).toEqual({ kind: 'task', title, dueDate, effort: 'QUICK_5M' })
  })

  it('avança o ano usando datas locais, sem deslocamento por UTC', () => {
    expect(parseQuickInput('Pagar matrícula amanhã', '2026-12-31')).toMatchObject({ kind: 'task', title: 'Pagar matrícula', dueDate: '2027-01-01' })
  })

  it.each([
    ['alongar 5 min hoje', 'QUICK_5M'],
    ['Tarefa de foco: escrever relatório amanhã', 'FOCUS'],
    ['estudar 25 minutos', 'FOCUS'],
    ['revisar 2 horas na quinta', 'FOCUS'],
  ])('infere esforço sem apagar a duração útil da tarefa: %s', (raw, effort) => {
    expect(parseQuickInput(raw, today)).toMatchObject({ kind: 'task', effort })
  })

  it('mantém números sem contexto financeiro como parte da tarefa', () => {
    expect(parseQuickInput('Ligar para sala 35 hoje', today)).toEqual({ kind: 'task', title: 'Ligar para sala 35', dueDate: today, effort: 'QUICK_5M' })
  })

  it.each(['', '   ', 'comprar', 'lista:', 'amanhã'])('não inventa uma tarefa vazia: %s', (raw) => {
    expect(parseQuickInput(raw, today)).toBeNull()
  })
})
