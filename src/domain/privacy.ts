import { monthKey } from './dates'
import type { PartnerId, Profile, Transaction } from './types'

/**
 * Espelho da política RLS de `transactions` (supabase/schema.sql):
 * o visualizador lê uma transação se
 *  - foi ele quem criou, OU
 *  - é do casal, OU
 *  - é pessoal do par, o par liberou a transparência e não é presente/surpresa.
 */
export function canViewTransaction(
  tx: Transaction,
  viewer: PartnerId,
  profiles: Record<PartnerId, Pick<Profile, 'sharePersonalFinances'>>,
): boolean {
  if (tx.createdBy === viewer) return true
  if (tx.scope === 'COUPLE') return true
  return profiles[tx.createdBy].sharePersonalFinances && !tx.isSecretGift
}

export function visibleTransactions(
  all: Transaction[],
  viewer: PartnerId,
  profiles: Record<PartnerId, Pick<Profile, 'sharePersonalFinances'>>,
): Transaction[] {
  return all.filter((tx) => canViewTransaction(tx, viewer, profiles))
}

export type PersonalTabView =
  | { status: 'own'; items: Transaction[]; totalCents: number }
  | { status: 'closed'; ownerName: string }
  | { status: 'readonly'; items: Transaction[]; totalCents: number; ownerName: string }

/**
 * O que a aba pessoal de `owner` mostra para `viewer` no mês.
 * Na leitura do par o total inclui presentes (entram no saldo do dono),
 * mas a linha do presente nunca é exposta.
 */
export function personalTabView(
  all: Transaction[],
  owner: PartnerId,
  viewer: PartnerId,
  profiles: Record<PartnerId, Pick<Profile, 'sharePersonalFinances' | 'displayName'>>,
  month: string,
): PersonalTabView {
  const mine = all.filter(
    (t) => t.scope === 'PERSONAL' && t.createdBy === owner && monthKey(t.competenceDate) === month,
  )
  const total = mine
    .filter((t) => t.type === 'EXPENSE' && t.status === 'CONFIRMED_SOLID')
    .reduce((s, t) => s + t.amountCents, 0)
  const sorted = (xs: Transaction[]) => [...xs].sort((a, b) => b.competenceDate.localeCompare(a.competenceDate))

  if (owner === viewer) return { status: 'own', items: sorted(mine), totalCents: total }
  if (!profiles[owner].sharePersonalFinances) {
    return { status: 'closed', ownerName: profiles[owner].displayName }
  }
  return {
    status: 'readonly',
    items: sorted(mine.filter((t) => canViewTransaction(t, viewer, profiles))),
    totalCents: total,
    ownerName: profiles[owner].displayName,
  }
}
