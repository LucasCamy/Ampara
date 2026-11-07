const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Formata centavos inteiros como R$ 1.234,56 (espaço normal após R$) */
export function formatCents(cents: number): string {
  return brl.format(cents / 100).replace(/\s/g, ' ')
}

/** Converte texto digitado ("12,50", "1.234,5", "120") em centavos inteiros. null se inválido. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, '').trim()
  if (!cleaned) return null
  let normalized = cleaned
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  }
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

/** Máscara estilo caixa eletrônico: os dígitos entram pela direita como centavos */
export function digitsToCents(digits: string): number {
  const only = digits.replace(/\D/g, '').slice(0, 11)
  return only ? Number(only) : 0
}

export function formatPercentBps(bps: number): string {
  const v = bps / 100
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatClock(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Primeiro nome para as telas do dia a dia ("Pedir ajuda para Julia" em vez do nome completo).
 * O nome completo fica no cadastro (Ajustes › Casal) e nos rótulos de acessibilidade da troca de pessoa.
 */
export function firstName(name: string | undefined | null): string {
  const n = (name ?? '').trim()
  return n.split(/\s+/)[0] ?? n
}
