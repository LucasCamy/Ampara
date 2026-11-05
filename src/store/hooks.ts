import type { PartnerId, Profile } from '../domain/types'
import { otherPartner } from '../domain/types'
import { useData } from './data'
import { useUi } from './ui'

export const useViewer = () => useUi((s) => s.viewer)

export function usePeople() {
  const viewer = useViewer()
  const A = useData((s) => s.profiles.A) as Profile
  const B = useData((s) => s.profiles.B) as Profile
  const profiles = { A, B } as Record<PartnerId, Profile>
  const partnerId = otherPartner(viewer)
  return { viewer, partnerId, me: profiles[viewer], partner: profiles[partnerId], profiles }
}

/** "Dela" ou "Dele" conforme o pronome do par */
export const possessive = (p: Profile) => (p.pronoun === 'ela' ? 'Dela' : 'Dele')
export const toneOf = (id: PartnerId | null): 'a' | 'b' | 'us' => (id === null ? 'us' : id === 'A' ? 'a' : 'b')

export function ownerLabel(owner: PartnerId | null, viewer: PartnerId, partner: Profile): string {
  if (owner === null) return 'Nós'
  return owner === viewer ? 'Meu' : possessive(partner)
}

export const useCouple = () => useData((s) => s.couple.couple)!
