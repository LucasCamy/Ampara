import { addDays, parseDateKey } from './dates'
import type { DateKey, ShopCategory, TaskEffort, TxCategory } from './types'

export type QuickParsedInput =
  | { kind: 'expense'; amountCents: number; description: string; category: TxCategory; date: DateKey }
  | { kind: 'shopping'; title: string; category: ShopCategory }
  | { kind: 'task'; title: string; dueDate: DateKey | null; effort: TaskEffort }

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const tidy = (text: string) => text.replace(/\s+/g, ' ').replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, '').trim()
const MAX_AMOUNT_CENTS = 2_147_483_647

const HEALTH = /\b(?:farmacia|remedios?|medicamentos?|consulta|exame|medico|terapia|dentista|psiquiatra|vitaminas?)\b/
const MARKET = /\b(?:supermercado|mercado|feira|hortifruti|leite|pao|arroz|feijao|frutas?|verduras?|cafe|racao)\b/
const HOME = /\b(?:aluguel|luz|energia|agua|condominio|internet|limpeza|casa|sabao|detergente|lampada|moveis|cadeira)\b/

function expenseCategory(text: string): TxCategory {
  const normalized = fold(text)
  if (HEALTH.test(normalized)) return 'HEALTH'
  if (/\b(?:uber|taxi|onibus|metro|gasolina|combustivel|estacionamento|passagem|transporte)\b/.test(normalized)) return 'TRANSPORT'
  if (HOME.test(normalized)) return 'HOME'
  if (/\b(?:restaurante|lanche|almoco|jantar|delivery|ifood|pizza|lanchonete|cafeteria)\b/.test(normalized)) return 'FOOD'
  if (MARKET.test(normalized)) return 'MARKET'
  if (/\b(?:cinema|livro|jogo|lazer|passeio|show|viagem|teatro)\b/.test(normalized)) return 'LEISURE'
  return 'OTHER'
}

function shoppingCategory(text: string): ShopCategory {
  const normalized = fold(text)
  if (HEALTH.test(normalized)) return 'PHARMACY'
  if (HOME.test(normalized)) return 'HOME'
  return MARKET.test(normalized) ? 'MARKET' : 'OTHER'
}

/** Conversão decimal sem arredondamento binário. Pontos de milhar e vírgula são os formatos PT-BR. */
function amountInCents(raw: string): number | null {
  const token = raw.replace(/[.,]+$/, '').replace(/^\+/, '')
  const thousands = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(token)
  if (!thousands && !/^\d+(?:[,.]\d{1,2})?$/.test(token)) return null
  const normalized = thousands ? token.replace(/\./g, '').replace(',', '.') : token.replace(',', '.')
  const [whole, fraction = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isInteger(cents) && cents > 0 && cents <= MAX_AMOUNT_CENTS ? cents : null
}

const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 }
const TASK_DATE = /\b(?:(?:para|pra|na|no|em)\s+)?(?:pr[oó]xim[ao]\s+)?(hoje|amanh[ãa]|segunda(?:[ -]feira)?|ter[cç]a(?:[ -]feira)?|quarta(?:[ -]feira)?|quinta(?:[ -]feira)?|sexta(?:[ -]feira)?|s[aá]bado|domingo)(?=$|[^\p{L}])/iu
const EXPENSE_DATE = /\b(anteontem|ontem|hoje)(?=$|[^\p{L}])/iu

function taskDate(text: string, today: DateKey): { title: string; dueDate: DateKey | null } {
  const match = TASK_DATE.exec(text)
  if (!match) return { title: text, dueDate: null }
  const name = fold(match[1]!).split(/[ -]/)[0]!
  let dueDate: DateKey
  if (name === 'hoje') dueDate = today
  else if (name === 'amanha') dueDate = addDays(today, 1)
  else {
    // Um dia da semana sem "hoje" significa a próxima ocorrência, inclusive se hoje for esse dia.
    const delta = (WEEKDAYS[name]! - parseDateKey(today).getDay() + 7) % 7
    dueDate = addDays(today, delta || 7)
  }
  return { title: tidy(text.slice(0, match.index) + ' ' + text.slice(match.index + match[0].length)), dueDate }
}

function effortFor(text: string): TaskEffort {
  const normalized = fold(text)
  const duration = /\b(\d{1,3})\s*(min(?:utos?)?|h(?:oras?)?)(?=$|[^a-z])/u.exec(normalized)
  const minutes = duration ? Number(duration[1]) * (duration[2]!.startsWith('h') ? 60 : 1) : 0
  return /\b(?:foco|demorada|longa)\b/.test(normalized) || minutes > 5 ? 'FOCUS' : 'QUICK_5M'
}

/** Captura determinística local. Só números com moeda ou após um verbo de gasto viram dinheiro. */
export function parseQuickInput(raw: string, today: DateKey): QuickParsedInput | null {
  const text = raw.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!text) return null

  const number = '[+-]?\\d[\\d.,]*'
  const marked = new RegExp(`r\\$\\s*(${number})|(${number})\\s*(?:reais|real)(?=$|[^\\p{L}])`, 'iu').exec(text)
  const spending = /^(?:eu\s+)?(?:gastei|paguei|gasto|despesa|custou)\b\s*:?\s*([+-]?\d[\d.,]*)(?=$|[^\p{L}\d])/iu.exec(text)
  const money = marked ?? spending
  if (money) {
    const amountCents = amountInCents(money[1] ?? money[2] ?? '')
    if (amountCents === null) return null
    const withoutAmount = text.slice(0, money.index) + ' ' + text.slice(money.index + money[0].length)
    const dateMatch = EXPENSE_DATE.exec(withoutAmount)
    const date = dateMatch ? addDays(today, fold(dateMatch[1]!) === 'ontem' ? -1 : fold(dateMatch[1]!) === 'anteontem' ? -2 : 0) : today
    const withoutDate = dateMatch ? withoutAmount.slice(0, dateMatch.index) + ' ' + withoutAmount.slice(dateMatch.index + dateMatch[0].length) : withoutAmount
    const description = tidy(withoutDate)
      .replace(/^(?:eu\s+)?(?:gastei|paguei|gasto|despesa|custou)\b\s*:?\s*/iu, '')
      .replace(/^(?:em|no|na|nos|nas|com|de|para|por|pelo|pela)\s+/iu, '')
    return { kind: 'expense', amountCents, description: tidy(description).slice(0, 60) || 'Gasto', category: expenseCategory(text), date }
  }
  if (/r\$/iu.test(text) || /^(?:eu\s+)?(?:gastei|paguei|gasto|despesa|custou)\b/iu.test(text)) return null

  const shopping = /^(?:comprar\b|lista(?:\s+de\s+compras)?\b|falta\b)\s*:?\s*/iu.exec(text)
  if (shopping) {
    const title = tidy(text.slice(shopping[0].length)).slice(0, 120)
    return title ? { kind: 'shopping', title, category: shoppingCategory(title) } : null
  }

  const dated = taskDate(text, today)
  const title = tidy(dated.title.replace(/^(?:tarefa(?:\s+de\s+foco)?\s*:\s*|(?:me\s+)?lembrar\s+de\s+)/iu, '')).slice(0, 120)
  return title ? { kind: 'task', title, dueDate: dated.dueDate, effort: effortFor(text) } : null
}
