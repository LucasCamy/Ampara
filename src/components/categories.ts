import { Car, House, Package, PartyPopper, Pill, ShoppingCart, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import type { TxCategory } from '../domain/types'

export const CATEGORIES: Record<TxCategory, { label: string; icon: LucideIcon }> = {
  MARKET: { label: 'Mercado', icon: ShoppingCart },
  FOOD: { label: 'Comida', icon: UtensilsCrossed },
  HOME: { label: 'Casa e contas', icon: House },
  HEALTH: { label: 'Saúde', icon: Pill },
  TRANSPORT: { label: 'Transporte', icon: Car },
  LEISURE: { label: 'Lazer', icon: PartyPopper },
  OTHER: { label: 'Outros', icon: Package },
}

export const CATEGORY_ORDER: TxCategory[] = ['MARKET', 'FOOD', 'HOME', 'HEALTH', 'TRANSPORT', 'LEISURE']
